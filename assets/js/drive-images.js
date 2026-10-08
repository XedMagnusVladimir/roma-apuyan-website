/* Google Drive images sourced from Supabase site_images. Edit from /admin.html, not the code. */
(async () => {
'use strict';
if(!window.Roma) return;
const R=window.Roma;
try{
 const res=await R.client.from('site_images').select('slot_key,drive_file_id,title,is_active,placement').eq('is_active',true);
 if(res.error) throw res.error;
 const slots={};
 for(const s of res.data||[]) {
   if(s.slot_key && R.driveId(s.drive_file_id)) slots[s.slot_key]=s;
   else if(s.placement==='hero'&&s.title==='Homepage primary photo'&&!slots.hero_primary)slots.hero_primary=s;
 }
 for (const img of document.querySelectorAll('img[data-drive-slot]')){
   const slot=img.dataset.driveSlot,source=slots[slot];if(!source)continue;
   const target=R.image(source.drive_file_id);if(!target)continue;
   const service=img.classList.contains('service-drive-image');
   const originalSrc=img.getAttribute('src');
   const probe=new Image();
   probe.onload=()=>{
     img.src=target;
     img.alt=source.title || 'Creations by Roma Apuyan photo';
     if(service)img.hidden=false;
     const gallery=img.closest('.gallery-item');
     if(gallery){gallery.dataset.source='google-drive';gallery.dataset.title=source.title||'Our photo collection';const name=gallery.querySelector('.photo-label strong');if(name)name.textContent=gallery.dataset.title;}
   };
   probe.onerror=()=>{if(service)img.hidden=true;else if(originalSrc)img.src=originalSrc};
   probe.src=target;
 }
}catch(err){console.warn('Studio image settings unavailable:',err.message)}
})();
