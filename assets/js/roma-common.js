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
  return {client,money,esc,driveId,image,datePH,optionText,readable,check,notify,clear,loggedIn,isAdmin,rpc,query,qs};
})();
