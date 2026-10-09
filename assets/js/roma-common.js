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

  // Compress images before any network upload. Images use standard JPEG for reliable browser/Drive support.
  async function resizeImage(file,kind='banner'){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPG, PNG or WebP image.');
    if(file.size>30*1024*1024)throw Error('The original image must be 30 MB or less.');
    const settings={banner:[1280,720,420000],icon:[256,256,95000],website:[1600,1000,530000],proof:[1900,1900,750000],identity:[1900,1900,950000]};
    const [w,h,target]=settings[kind]||settings.website;
    let bitmap;
    try {bitmap=await createImageBitmap(file);}
    catch(e){throw Error('Could not read this image. Please select a valid JPG, PNG or WebP file.');}
    try{
      let width=w,height=h;
      if(kind==='proof'||kind==='identity'){
        const scale=Math.min(1,w/bitmap.width,h/bitmap.height);
        width=Math.max(1,Math.round(bitmap.width*scale));height=Math.max(1,Math.round(bitmap.height*scale));
      }
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Image resizing is unavailable in this browser.');
      ctx.fillStyle=kind==='icon'?'#20161e':'#fff';ctx.fillRect(0,0,width,height);
      const cover=kind==='banner'||kind==='website';
      const scale=cover?Math.max(width/bitmap.width,height/bitmap.height):Math.min(width/bitmap.width,height/bitmap.height);
      const dw=bitmap.width*scale,dh=bitmap.height*scale;
      ctx.drawImage(bitmap,(width-dw)/2,(height-dh)/2,dw,dh);
      async function encode(quality){return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image compression failed.')),'image/jpeg',quality));}
      let blob=await encode(kind==='identity'||kind==='proof'?0.88:0.78);
      for(const q of [0.70,0.58,0.46]){
        if(blob.size<=target)break;
        blob=await encode(q);
      }
      if(blob.size>5*1024*1024)throw Error('The resized image is too large to upload.');
      return new File([blob],String(file.name||'image').replace(/\.[^.]*$/,'')+'-'+kind+'.jpg',{type:'image/jpeg'});
    }finally{bitmap.close?.();}
  }
  const preparePublicImage=resizeImage;
  async function preparePrivateImage(file,kind='proof'){
    if(!file)return null;
    if(file.type==='application/pdf'){
      if(file.size>5*1024*1024)throw Error('PDF files must be 5 MB or less.');
      return file;
    }
    return resizeImage(file,kind);
  }

  // Fixed deadline: a failed gateway never leaves a form stuck at 'Uploading...'.
  // Upload requests are deliberately not retried automatically (to avoid duplicate Drive files).
  async function uploadToDrive(file,scope,bookingId=null,onStatus=()=>{}){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type))throw Error('Choose a JPG, PNG, WebP or PDF file.');
    if(file.size>5*1024*1024)throw Error('The selected file must be 5 MB or smaller.');
    onStatus('Preparing '+Math.max(1,Math.round(file.size/1024))+' KB file…');
    const sessionResult=await client.auth.getSession();
    const token=sessionResult.data?.session?.access_token;
    if(!token)throw Error('Your session expired. Please sign in again.');
    const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=()=>reject(Error('Unable to read the selected file.'));
      reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
    });
    const controller=new AbortController();
    const deadline=window.setTimeout(()=>controller.abort(),45000);
    try{
      onStatus('Sending image to the secure Google Drive gateway…');
      const response=await fetch(url+'/functions/v1/roma-drive-media',{
        method:'POST',signal:controller.signal,
        headers:{'Authorization':'Bearer '+token,'apikey':key,'Content-Type':'application/json'},
        body:JSON.stringify({action:'upload',scope,booking_id:bookingId||null,name:file.name,mime:file.type,base64,request_id:(typeof crypto.randomUUID==='function'?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2))})
      });
      onStatus('Checking Google Drive confirmation…');
      const text=await response.text();let payload;
      try{payload=JSON.parse(text);}catch(e){throw Error('Upload server returned an unexpected response (HTTP '+response.status+'). Check the deployed roma-drive-media function.');}
      if(!response.ok||!payload.ok||!payload.file_id)throw Error(payload.error||'Google Drive upload was not confirmed (HTTP '+response.status+').');
      onStatus('Upload completed. Saving changes…');
      return payload.file_id;
    }catch(err){
      if(err?.name==='AbortError')throw Error('Google Drive upload timed out after 45 seconds. Check the gateway connection and try again after verifying whether the file appeared in Drive.');
      if(err instanceof TypeError)throw Error('Cannot reach Supabase upload service. Check network access and Edge Function deployment.');
      throw err;
    }finally{window.clearTimeout(deadline);}
  }
  async function checkDriveGateway(){
    const token=(await client.auth.getSession()).data?.session?.access_token;
    if(!token)throw Error('Sign in as an administrator to check Google Drive.');
    const ctl=new AbortController();const timer=window.setTimeout(()=>ctl.abort(),18000);
    try{
      const response=await fetch(url+'/functions/v1/roma-drive-media',{
        method:'POST',signal:ctl.signal,headers:{'Authorization':'Bearer '+token,'apikey':key,'Content-Type':'application/json'},
        body:JSON.stringify({action:'health'})
      });
      let data;try{data=await response.json();}catch(e){throw Error('Upload gateway returned an invalid response (HTTP '+response.status+').');}
      if(!response.ok||!data.ok)throw Error(data.error||'Drive connection health check failed.');
      return data.root_folder_name||'Google Drive';
    }catch(error){if(error?.name==='AbortError')throw Error('Google Drive connection did not respond within 18 seconds. Check Apps Script permissions and the deployed URL.');throw error;}
    finally{window.clearTimeout(timer);}
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
  return {client,money,esc,driveId,image,preparePublicImage,preparePrivateImage,datePH,optionText,readable,check,notify,clear,loggedIn,isAdmin,rpc,query,qs,uploadToDrive,checkDriveGateway,viewDriveProof,readableDuration,durationMinutes};
})();
