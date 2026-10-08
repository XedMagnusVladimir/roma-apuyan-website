/* Public service packages are always loaded from Supabase; admins edit in /admin.html. */
(async () => {
'use strict';
if (!window.Roma) return;
const R=window.Roma;
const host=document.getElementById('roma-live-services');
if(!host) return;
try{
const result=await R.client.from('services').select('*').eq('is_active',true).order('name');
if(result.error) throw result.error;
const rows=result.data||[];
const cards=rows.map(s=>`<article class="service" style="min-height:unset"><div class="service-number">AVAILABLE STUDIO PACKAGE</div>${s.banner_drive_file_id?`<img class="service-drive-image" style="position:relative;display:block;width:100%;aspect-ratio:16/9;object-fit:cover;opacity:1;visibility:visible;margin:15px 0;border-radius:10px" src="${R.image(s.banner_drive_file_id)}" alt="${R.esc(s.name)}">`:''}<h3>${R.esc(s.name)}</h3><p>${R.esc(s.description)}</p><div class="service-foot"><strong style="font-size:19px;color:#e4b3cb">${R.money(s.base_price_centavos)}</strong> <a style="color:inherit" href="booking.html">REQUEST SERVICE ↗</a></div><small>${Array.isArray(s.inclusions)?s.inclusions.map(i=>R.esc(i)).join(' · '):''}</small></article>`).join('');
host.innerHTML=rows.length?`<div class="section-top" style="margin-top:38px"><h2>Packages & <em>pricing.</em></h2><p class="lead">Choose a service to see availability and request a booking.</p></div><div class="service-grid">${cards}</div>`:'';
}catch(err){console.warn('Service listings unavailable',err.message)}
})();
