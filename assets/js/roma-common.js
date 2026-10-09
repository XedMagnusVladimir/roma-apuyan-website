/* Shared client for the original Supabase Stage 7 database. Public publishable key only. */
window.Roma = (() => {
  'use strict';
  const url='https://lprvftpjrwvztddgsbgq.supabase.co';
  const key='sb_publishable_oLEHbDXw2BGStOQDKUicNA_8GmQUWF8';
  const client=window.supabase.createClient(url,key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const money = cents => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(cents||0)/100);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const driveId = v => {const s=String(v||'').trim();const m=s.match(/\/file\/d\/([A-Za-z0-9_-]+)/)||s.match(/[?&]id=([A-Za-z0-9_-]+)/);const id=m?m[1]:s;return /^[A-Za-z0-9_-]{15,}$/.test(id)?id:''};
  const image = id => id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId(id))}&sz=w1200` : '';
  const sizeAllowed=5*1024*1024;

  async function preparePublicImage(file,kind='banner'){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Upload a JPG, PNG, or WebP photograph.');
    if(file.size>30*1024*1024)throw Error('The original image must be under 30 MB.');
    const sizes={banner:[1280,720],icon:[256,256],website:[1600,1000]};
    const [width,height]=sizes[kind]||sizes.website;
    const bitmap=await createImageBitmap(file);
    try{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing is not available.');
      ctx.fillStyle=kind==='icon'?'#20161e':'#161016';ctx.fillRect(0,0,width,height);
      const scale=kind==='icon'?Math.min(width/bitmap.width,height/bitmap.height):Math.max(width/bitmap.width,height/bitmap.height);
      const dw=bitmap.width*scale,dh=bitmap.height*scale;
      ctx.drawImage(bitmap,(width-dw)/2,(height-dh)/2,dw,dh);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Unable to resize image.')),'image/jpeg',0.86));
      return new File([blob],String(file.name||'image').replace(/\.[^.]*$/,'')+'-'+kind+'.jpg',{type:'image/jpeg'});
    }finally{bitmap.close();}
  }
  async function uploadToDrive(file,scope,bookingId){
    if(!file) return null;
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)) throw Error('Choose a JPG, PNG, WebP or PDF file.');
    if(file.size>sizeAllowed) throw Error('Google Drive upload size is limited to 5 MB per file.');
    const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to read selected file.'));
      reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
    });
    const {data,error}=await client.functions.invoke('roma-drive-media',{
      body:{action:'upload',scope,booking_id:bookingId||null,name:file.name,mime:file.type,base64}
    });
    if(error){let detail=error.message;try{const d=await error.context?.json?.();detail=d?.error||detail;}catch(_){}throw Error(detail||'Google Drive upload failed.');}
    if(!data?.ok||!data?.file_id)throw Error(data?.error||'Google Drive did not confirm the upload.');
    return data.file_id;
  }
  async function viewDriveProof(fileId){
    const {data,error}=await client.functions.invoke('roma-drive-media',{body:{action:'read_proof',file_id:fileId}});
    if(error||!data?.base64)throw Error(data?.error||error?.message||'Unable to open private payment proof.');
    const raw=atob(data.base64);const arr=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
    const blob=new Blob([arr],{type:data.mime||'application/octet-stream'});
    const u=URL.createObjectURL(blob);window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000);
  }
  const readableDuration=minutes=>minutes%1440===0?`${minutes/1440} day(s)`:minutes%60===0?`${minutes/60} hour(s)`:`${minutes} minute(s)`;
  const durationMinutes=(value,unit)=>{const mult={minutes:1,hours:60,days:1440}[unit];const n=Number(value)*mult;if(!Number.isInteger(n)||n<1||n>525600)throw Error('Duration must be between 1 minute and 365 days.');return n;};
  const datePH = value => value ? new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')) : '';
  const optionText = {full_discount:'Pay in full — 10% off', deposit_25:'25% down payment',after_service_plus_10:'Pay after service — +10%'};
  const readable = e => {
    const s=String(e?.message || e || 'Unknown error');
    const errors={SIGN_IN_REQUIRED:'Sign in first.',CONTACT_DETAILS_REQUIRED:'Save your full name and telephone number first.',TWO_GOVERNMENT_IDS_REQUIRED:'Upload both government IDs first.',PAYMENT_MUST_BE_VERIFIED_FIRST:'Payment must be verified by an administrator first.',EVENT_DATE_UNAVAILABLE:'This date is already reserved or blocked.',EVENT_DATE_NOW_UNAVAILABLE:'This date is now unavailable. Contact the studio to reschedule.',INVALID_EVENT_DATE:'Choose a future event date.',PAYMENT_METHOD_NOT_ALLOWED:'The selected payment method is not available for this package.',BOOKING_NOT_READY_FOR_DECISION:'Only complete, submitted event requests can be approved or rejected.',INSUFFICIENT_VERIFIED_PAYMENT:'The required payment has not been verified yet.',PAYMENT_NOT_VERIFIED:'The required payment has not been verified yet.',BOOKING_ACCESS_DENIED:'You cannot access that booking.',REJECTION_REASON_REQUIRED:'Enter a rejection reason.',CANNOT_APPROVE_BLOCKED_DATE:'That date is blocked.',INVALID_PAYMENT_AMOUNT:'Check the payment amount.',TRANSACTION_AND_PROOF_REQUIRED:'Enter the transaction reference and upload proof.'};
    for (const [k,v] of Object.entries(errors)) if(s.includes(k)) return v;
    return s;
  };
  const check=(res)=>{if(res.error) throw res.error;return res.data};
  const notify=(message,type='info')=>{const el=document.getElementById('roma-alert');if(el){el.textContent=message;el.className='roma-alert '+type;el.hidden=false;el.scrollIntoView({block:'nearest',behavior:'smooth'});}};
  const clear=()=>{const el=document.getElementById('roma-alert');if(el){el.hidden=true;el.textContent='';}};
  const loggedIn=async()=> (await client.auth.getUser()).data.user;
  async function isAdmin(user){if(!user)return false; const r=await client.from('account_roles').select('role').eq('user_id',user.id).maybeSingle();return r.data?.role==='super_admin';}
  const rpc=async(name,args)=>check(await client.rpc(name,args));
  const query=async(p)=>check(await p);
  const qs=(id)=>document.getElementById(id);
  return {client,money,esc,driveId,image,preparePublicImage,datePH,optionText,readable,check,notify,clear,loggedIn,isAdmin,rpc,query,qs,uploadToDrive,viewDriveProof,readableDuration,durationMinutes};
})();
