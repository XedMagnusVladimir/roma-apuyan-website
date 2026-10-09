(() => {
'use strict';
const R=window.Roma, db=R.client, $=R.qs;
let customerRows=[], customerRoles=[];
let user, bookings=[],selectedBooking=null,services=[],methods=[],options=[],serviceMethodLinks=[], blocked=[],imageRows=[],calendar=null;
const imageSlots=[['hero_primary','Homepage — main photo','hero'],['hero_secondary','Homepage — second photo','hero'], ...Array.from({length:6},(_,i)=>[`gallery_${i+1}`,`Gallery — photo ${i+1}`,'gallery']),['service_portraits','Service card — portraits','website'],['service_events','Service card — events','website'],['service_films','Service card — films','website'],['service_editorial','Service card — editorial','website']];
function safe(fn){return async e=>{try{R.clear();if(e?.type==='submit'&&e.preventDefault)e.preventDefault();await fn(e)}catch(err){R.notify(R.readable(err),'error')}}}
function tab(which){document.querySelectorAll('[data-admin-tab]').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===which));['requests','services','payments','calendar','images','customers'].forEach(n=>$('admin-'+n).hidden=n!==which);}
async function initialize(){user=await R.loggedIn();if(!user){$('admin-auth').hidden=false;$('admin-console').hidden=true;$('admin-logout').hidden=true;return;}
if(!(await R.isAdmin(user))){$('admin-auth').hidden=false;$('admin-console').hidden=true;throw Error('This account does not have the Super Administrator role.');}
$('admin-auth').hidden=true;$('admin-console').hidden=false;$('admin-logout').hidden=false;$('admin-user').textContent='Signed in as '+user.email+' · Super Administrator';
await Promise.all([loadServices(),loadMethods(),loadBookings(),loadBlocked(),loadImages()]);
if(!calendar)calendar=window.RomaCalendar.mount('calendar-admin',{mode:'admin',fetchMonth:async(start,end)=>{
const busy=await R.rpc('unavailable_booking_dates',{p_start:start,p_end:end});
return {busy:busy.map(x=>x.event_date),events:bookings.filter(b=>['approved','completed'].includes(b.status)).map(b=>b.event_date)};
}});else calendar.refresh();}
async function loadCustomers(){
  customerRows=R.check(await db.from('profiles').select('user_id,full_name,email,phone,deleted_at').is('deleted_at',null).order('created_at',{ascending:false}).limit(500));
  customerRoles=R.check(await db.from('account_roles').select('user_id,role'));
  renderCustomers();
}
function renderCustomers(){
  const term=($('customer-search').value||'').trim().toLowerCase();
  const filtered=customerRows.filter(c=>[c.full_name,c.email,c.phone].some(x=>String(x||'').toLowerCase().includes(term)));
  const roleOf=(id)=>customerRoles.find(r=>r.user_id===id)?.role||'customer';
  $('customer-list').innerHTML=filtered.length?filtered.map(c=>{
    const role=roleOf(c.user_id);
    const canDelete=c.user_id!==user.id && role!=='super_admin';
    return `<tr><td>${R.esc(c.full_name||'Customer')}</td><td>${R.esc(c.email)}</td><td>${R.esc(c.phone)}</td><td>${R.esc(role)}</td><td>${canDelete?`<button class="roma-btn warn tiny" data-delete-user="${c.user_id}" type="button">Delete User</button>`:'Protected administrator'}</td></tr>`;
  }).join(''):'<tr><td colspan="5">No matching customers.</td></tr>';
}
async function deleteCustomer(userId){
  const target=customerRows.find(c=>c.user_id===userId);
  if(!target)throw Error('Customer not found. Refresh the list.');
  const label=target.email||target.full_name||userId;
  const response=window.prompt(`Delete the customer account ${label}?\n\nRemoves login access and private ID/payment-proof files, while preserving booking and payment records.\n\nType DELETE to confirm:`);
  if(response!=='DELETE')return;
  const {data,error}=await db.functions.invoke('roma-user-admin',{body:{action:'delete_customer',user_id:userId}});
  if(error)throw new Error(data?.error||error.message||'Unable to delete the customer');
  if(data?.error)throw Error(data.error);
  R.notify('Customer login access removed. Booking history preserved.','success');
  await loadCustomers();
}
async function loadBookings(){bookings=R.check(await db.from('bookings').select('*').order('created_at',{ascending:false}).limit(250));const summary=[['Recent bookings',bookings.length],['Awaiting approval',bookings.filter(b=>b.status==='pending_approval').length],['Verified payments',R.money(bookings.reduce((sum,b)=>sum+Number(b.paid_centavos),0))],['Remaining balances',R.money(bookings.filter(b=>['approved','completed'].includes(b.status)).reduce((sum,b)=>sum+Number(b.total_centavos-b.paid_centavos),0))]];$('admin-summary').innerHTML=summary.map(([label,value])=>`<div class="roma-card"><span class="roma-muted">${label} (shown records)</span><h3>${value}</h3></div>`).join('');
$('admin-booking-list').innerHTML=bookings.length?bookings.map(b=>`<div class="roma-booking"><button data-select-booking="${b.id}"><strong>${R.esc(b.reference_number)}</strong><br>${R.esc(b.service_name_snapshot)} · ${R.datePH(b.event_date)}<br><span class="roma-pill">${R.esc(b.status.replaceAll('_',' '))}</span><br><small>${R.money(b.total_centavos)} · Paid ${R.money(b.paid_centavos)}</small></button></div>`).join(''):'<div class="roma-empty">No submitted or draft bookings yet.</div>';
if(selectedBooking&&bookings.some(x=>x.id===selectedBooking))await showBooking(selectedBooking);if(calendar)calendar.refresh();}
const signed=async(bucket,path)=>{const d=R.check(await db.storage.from(bucket).createSignedUrl(path,60));window.open(d.signedUrl,'_blank','noopener,noreferrer');};
async function showBooking(id){selectedBooking=id;const b=bookings.find(x=>x.id===id);if(!b)return;const [profile,docs,pays,msgs]=await Promise.all([
 R.query(db.from('profiles').select('full_name,email,phone').eq('user_id',b.user_id).single()),
 R.query(db.from('customer_identity_documents').select('document_slot,storage_path').eq('booking_id',id).order('document_slot')),
 R.query(db.from('booking_payments').select('*').eq('booking_id',id).order('created_at',{ascending:false})),
 R.query(db.from('booking_messages').select('*').eq('booking_id',id).order('created_at'))
]);
let html=`<h3>${R.esc(b.reference_number)}</h3><p>${R.esc(b.service_name_snapshot)}<br><span class="roma-pill">${R.esc(b.status.replaceAll('_',' '))}</span><br>Booked date: ${R.datePH(b.event_date)}<br>Payment arrangement: ${R.esc(R.optionText[b.option_code])}</p><p>Customer: ${R.esc(profile.full_name)}<br>${R.esc(profile.email)}<br>${R.esc(profile.phone)}</p><p>Contract: <strong>${R.money(b.total_centavos)}</strong><br>Verified: ${R.money(b.paid_centavos)}<br>Balance: <strong>${R.money(b.total_centavos-b.paid_centavos)}</strong></p>`;
html+=`<p>Event: ${R.esc(b.event_name||'Event details not yet submitted')}<br>Location: ${R.esc(b.event_location||'—')}<br>Start time: ${R.esc(b.event_start_time||'—')}<br>Duration: ${b.event_duration_minutes||'—'} minutes</p><h3>Identity documents</h3>${docs.length?docs.map(d=>`<button class="roma-btn secondary tiny" data-file-bucket="roma-customer-ids" data-file-path="${R.esc(d.storage_path)}">View ID ${d.document_slot}</button>`).join(''):'<p class="roma-muted">No ID files received.</p>'}`;
html+=`<hr class="roma-divider"><h3>Submitted payments</h3>${pays.length?pays.map(p=>`<div class="roma-note"><strong>${R.money(p.amount_centavos)}</strong> · ${R.esc(p.status)}<br>Reference: ${R.esc(p.transaction_reference)}<br>Bank/wallet: ${R.esc(p.bank_or_wallet_used)}<br>${p.proof_path?`<button class="roma-btn secondary tiny" data-file-bucket="roma-payment-proofs" data-file-path="${R.esc(p.proof_path)}">View payment proof</button>`:''}${p.status==='submitted'?`<button class="roma-btn tiny" data-pay-approve="${p.id}">Verify payment</button><button class="roma-btn warn tiny" data-pay-reject="${p.id}">Reject proof</button>`:''}${p.rejection_reason?`<p>${R.esc(p.rejection_reason)}</p>`:''}</div>`).join(''):'<p class="roma-muted">No payments recorded.</p>'}`;
if(['approved','completed','rejected'].includes(b.status))html+=`<button class="roma-btn secondary" data-admin-pdf="${b.id}">Download booking document (PDF)</button>`;
if(b.status==='pending_approval' && b.event_name && b.event_location)html+=`<hr class="roma-divider"><h3>Decision</h3><button class="roma-btn" data-approve="${b.id}">Approve and reserve date</button><button class="roma-btn warn" data-reject="${b.id}">Reject with reason</button>`;
if(b.status==='approved')html+=`<hr class="roma-divider"><button class="roma-btn" data-complete="${b.id}">Mark service completed</button>`;
if(['approved','completed','payment_verified','pending_approval'].includes(b.status)&&b.total_centavos>b.paid_centavos)html+=`<hr class="roma-divider"><h3>Record payment received manually</h3><form id="offline-payment"><label class="roma-field">Amount in pesos<input name="amount" type="number" step="0.01" min="0.01" max="${((b.total_centavos-b.paid_centavos)/100).toFixed(2)}" required></label><label class="roma-field">Reference<input name="reference" maxlength="150" required></label><button class="roma-btn" type="submit">Record verified payment</button></form>`;
html+=`<hr class="roma-divider"><h3>Customer messages</h3>${msgs.length?msgs.map(m=>`<div class="roma-note">${R.esc(m.message)}<br><small>${new Date(m.created_at).toLocaleString()} ${m.is_internal?'· Staff only':''}</small></div>`).join(''):'<p class="roma-muted">No messages yet.</p>'}<form id="admin-message"><label class="roma-field">Reply<textarea name="message" maxlength="5000" required></textarea></label><label class="roma-field"><span><input name="internal" type="checkbox"> Internal note (not visible to customer)</span></label><button class="roma-btn" type="submit">Save message</button></form>`;
$('admin-booking-details').innerHTML=html;}
async function loadServices(){services=R.check(await db.from('services').select('*').order('name'));options=R.check(await db.from('service_payment_options').select('*'));serviceMethodLinks=R.check(await db.from('service_payment_methods').select('*'));
$('services-admin-list').innerHTML=services.length?services.map(s=>`<div class="roma-booking"><strong>${R.esc(s.name)}</strong><br>${R.money(s.base_price_centavos)} · ${s.is_active?'Active':'Disabled'}<br><button class="roma-btn secondary tiny" data-edit-service="${s.id}">Edit</button><button class="roma-btn warn tiny" data-delete-service="${s.id}">Delete</button></div>`).join(''):'<p class="roma-muted">Create your first service package.</p>';
renderMethodChecks();}
function renderMethodChecks(){const selected=document.querySelector('#service-form input[name="id"]').value;
$('service-methods').innerHTML=methods.length?methods.map(m=>`<label><input name="method_options" type="checkbox" value="${m.id}" ${selected&&serviceMethodLinks.some(x=>x.service_id===selected&&x.method_id===m.id)?'checked':''}> ${R.esc(m.name)}${m.is_active?'':' (inactive)'}</label>`).join(''):'<p class="roma-muted">Create a payment method under Payment methods to assign it here.</p>';}
function serviceReset(){const f=$('service-form');f.reset();f.elements.id.value='';f.elements.is_active.checked=true;f.querySelectorAll('[name="options"]').forEach(x=>x.checked=true);renderMethodChecks();}
function editService(id){const s=services.find(x=>x.id===id);if(!s)return;const f=$('service-form');f.elements.id.value=s.id;f.elements.name.value=s.name;f.elements.description.value=s.description;f.elements.price.value=(s.base_price_centavos/100).toFixed(2);f.elements.duration.value=s.duration_minutes;f.elements.inclusions.value=(s.inclusions||[]).join('\n');f.elements.image.value=s.banner_drive_file_id?`https://drive.google.com/file/d/${s.banner_drive_file_id}/view`:'';f.elements.is_active.checked=s.is_active;f.querySelectorAll('[name="options"]').forEach(x=>x.checked=options.some(o=>o.service_id===s.id&&o.option_code===x.value));renderMethodChecks();tab('services');f.scrollIntoView({behavior:'smooth'});}
async function saveService(e){const f=e.currentTarget;const id=f.elements.id.value;const drive=String(f.elements.image.value||'').trim();const parsed=R.driveId(drive);if(drive&&!parsed)throw Error('Enter a valid Google Drive file link or file ID.');const incl=f.elements.inclusions.value.split('\n').map(x=>x.trim()).filter(Boolean);
const data={name:f.elements.name.value.trim(),description:f.elements.description.value.trim(),base_price_centavos:Math.round(Number(f.elements.price.value)*100),duration_minutes:Number(f.elements.duration.value),inclusions:incl,banner_drive_file_id:parsed||null,is_active:f.elements.is_active.checked,updated_at:new Date().toISOString()};
let svcId=id;if(id){R.check(await db.from('services').update(data).eq('id',id));}else{const s=R.check(await db.from('services').insert(data).select('id').single());svcId=s.id;}
R.check(await db.from('service_payment_options').delete().eq('service_id',svcId));const opt=Array.from(f.querySelectorAll('input[name="options"]:checked')).map(x=>({service_id:svcId,option_code:x.value}));if(opt.length)R.check(await db.from('service_payment_options').insert(opt));
R.check(await db.from('service_payment_methods').delete().eq('service_id',svcId));const linked=Array.from(f.querySelectorAll('input[name="method_options"]:checked')).map(x=>({service_id:svcId,method_id:x.value}));if(linked.length)R.check(await db.from('service_payment_methods').insert(linked));
R.notify('Service package saved.','success');await loadServices();serviceReset();}
async function loadMethods(){methods=R.check(await db.from('payment_methods').select('*').order('name'));$('method-admin-list').innerHTML=methods.length?methods.map(m=>`<div class="roma-card"><h3>${R.esc(m.name)}</h3><p>${R.esc(m.provider)}<br>${R.esc(m.account_holder)}<br>${m.is_active?'Active':'Inactive'}</p><button class="roma-btn secondary tiny" data-edit-method="${m.id}">Edit</button><button class="roma-btn warn tiny" data-delete-method="${m.id}">Delete</button></div>`).join(''):'<p class="roma-muted">Add your first bank or e-wallet account.</p>';renderMethodChecks();}
function methodReset(){const f=$('method-form');f.reset();f.elements.id.value='';f.elements.is_active.checked=true;}
function editMethod(id){const m=methods.find(x=>x.id===id);if(!m)return;const f=$('method-form');f.elements.id.value=m.id;f.elements.name.value=m.name;f.elements.provider.value=m.provider;f.elements.holder.value=m.account_holder;f.elements.details.value=m.account_details;f.elements.instructions.value=m.instructions;f.elements.qr.value=m.qr_drive_file_id?`https://drive.google.com/file/d/${m.qr_drive_file_id}/view`:'';f.elements.is_active.checked=m.is_active;tab('payments');f.scrollIntoView({behavior:'smooth'});}
async function saveMethod(e){const f=e.currentTarget;const qr=String(f.elements.qr.value||'').trim();const parsed=R.driveId(qr);if(qr&&!parsed)throw Error('Enter a valid Google Drive QR image link.');const data={name:f.elements.name.value.trim(),provider:f.elements.provider.value.trim(),account_holder:f.elements.holder.value.trim(),account_details:f.elements.details.value.trim(),instructions:f.elements.instructions.value.trim(),qr_drive_file_id:parsed||null,is_active:f.elements.is_active.checked};const id=f.elements.id.value;
if(id)R.check(await db.from('payment_methods').update(data).eq('id',id));else R.check(await db.from('payment_methods').insert(data));R.notify('Payment method saved.','success');await loadMethods();methodReset();}
async function loadBlocked(){blocked=R.check(await db.from('blocked_dates').select('*').order('event_date'));$('blocked-list').innerHTML=blocked.length?blocked.map(d=>`<div class="roma-booking">${R.datePH(d.event_date)} — ${R.esc(d.reason)} <button class="roma-btn secondary tiny" data-unblock="${d.event_date}">Unblock</button></div>`).join(''):'<p class="roma-muted">No manually blocked dates.</p>';}
async function loadImages(){imageRows=R.check(await db.from('site_images').select('*'));$('image-positions').innerHTML=imageSlots.map(([slot,label])=>{const row=imageRows.find(x=>x.slot_key===slot);return `<div class="roma-card"><h3>${R.esc(label)}</h3>${row?.drive_file_id?`<img class="roma-banner" src="${R.image(row.drive_file_id)}" alt="${R.esc(label)}">`:''}<form data-image-form="${slot}"><label class="roma-field">Google Drive share link<input name="image" value="${R.esc(row?.drive_file_id?`https://drive.google.com/file/d/${row.drive_file_id}/view`:'')}" placeholder="Paste your photo link"></label><label class="roma-field">Image title<input name="title" maxlength="140" value="${R.esc(row?.title||label)}"></label><label class="roma-field"><span><input name="active" type="checkbox" ${row?.is_active!==false?'checked':''}> Display this image</span></label><button class="roma-btn" type="submit">Save image</button></form></div>`}).join('');}
async function saveImage(e){const f=e.target;const slot=f.dataset.imageForm;const lookup=imageSlots.find(x=>x[0]===slot);if(!lookup)throw Error('Invalid image slot.');const value=f.elements.image.value.trim();const id=R.driveId(value);if(value&&!id)throw Error('Use a valid Google Drive image link.');const existing=imageRows.find(x=>x.slot_key===slot);if(!id){if(existing)R.check(await db.from('site_images').delete().eq('id',existing.id));}else{const data={slot_key:slot,placement:lookup[2],title:f.elements.title.value.trim()||lookup[1],drive_file_id:id,is_active:f.elements.active.checked};if(existing)R.check(await db.from('site_images').update(data).eq('id',existing.id));else R.check(await db.from('site_images').insert(data));}
R.notify('Image saved. Your public website will use this Google Drive image.','success');await loadImages();}
$('admin-login').addEventListener('submit',safe(async e=>{const f=e.currentTarget;R.check(await db.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value}));await initialize();}));
$('admin-logout').addEventListener('click',safe(async()=>{R.check(await db.auth.signOut());user=null;selectedBooking=null;await initialize();}));
document.querySelectorAll('[data-admin-tab]').forEach(b=>b.addEventListener('click',()=>{tab(b.dataset.adminTab);if(b.dataset.adminTab==='customers')loadCustomers().catch(e=>R.notify(R.readable(e),'error'));}));
$('refresh-customers').addEventListener('click',safe(loadCustomers));
$('customer-search').addEventListener('input',renderCustomers);
$('reload-bookings').addEventListener('click',safe(loadBookings));
$('service-form').addEventListener('submit',safe(saveService));$('service-reset').addEventListener('click',serviceReset);
$('method-form').addEventListener('submit',safe(saveMethod));$('method-reset').addEventListener('click',methodReset);
$('block-form').addEventListener('submit',safe(async e=>{const f=e.currentTarget;R.check(await db.from('blocked_dates').insert({event_date:f.elements.event_date.value,reason:f.elements.reason.value.trim(),created_by:user.id}));R.notify('Date blocked.','success');f.reset();await loadBlocked();if(calendar)calendar.refresh();}));
document.addEventListener('submit',safe(async e=>{const f=e.target;if(f.dataset.imageForm)await saveImage(e);
if(f.id==='offline-payment'){const b=bookings.find(b=>b.id===selectedBooking);await R.rpc('admin_record_offline_payment',{p_booking:b.id,p_amount:Math.round(Number(f.elements.amount.value)*100),p_reference:f.elements.reference.value.trim()});R.notify('Payment recorded.','success');await loadBookings();}
if(f.id==='admin-message'){R.check(await db.from('booking_messages').insert({booking_id:selectedBooking,sender_id:user.id,message:f.elements.message.value.trim(),is_internal:f.elements.internal.checked}));R.notify('Message saved.','success');await showBooking(selectedBooking);}
}));
document.addEventListener('click',safe(async e=>{const btn=e.target.closest('button');if(!btn)return;
const d=btn.dataset;if(d.deleteUser){await deleteCustomer(d.deleteUser);return;}if(d.selectBooking){await showBooking(d.selectBooking);return;}
if(d.adminPdf){const b=bookings.find(x=>x.id===d.adminPdf);const profile=R.check(await db.from('profiles').select('full_name,email,phone').eq('user_id',b.user_id).single());window.RomaPDF.build(b,profile);return;}
if(d.fileBucket&&d.filePath){await signed(d.fileBucket,d.filePath);return;}
if(d.editService){editService(d.editService);return;}
if(d.editMethod){editMethod(d.editMethod);return;}
if(d.deleteService){const svc=services.find(x=>x.id===d.deleteService);if(window.confirm(`Delete package "${svc.name}"? Packages with past bookings cannot be deleted.`)){R.check(await db.from('services').delete().eq('id',d.deleteService));await loadServices();R.notify('Package deleted.','success')}return;}
if(d.deleteMethod){const m=methods.find(x=>x.id===d.deleteMethod);if(window.confirm(`Delete payment method "${m.name}"? Existing payment records may prevent deletion.`)){R.check(await db.from('payment_methods').delete().eq('id',d.deleteMethod));await loadMethods();R.notify('Payment method deleted.','success')}return;}
if(d.unblock){R.check(await db.from('blocked_dates').delete().eq('event_date',d.unblock));await loadBlocked();R.notify('Date unblocked.','success');return;}
if(d.payApprove){await R.rpc('review_booking_payment',{p_payment:d.payApprove,p_approve:true,p_rejection:null});R.notify('Payment verified.','success');await loadBookings();return;}
if(d.payReject){const reason=window.prompt('Enter the reason for rejecting this payment:');if(!reason?.trim())return;await R.rpc('review_booking_payment',{p_payment:d.payReject,p_approve:false,p_rejection:reason.trim()});R.notify('Payment rejected with reason.','success');await loadBookings();return;}
if(d.approve){if(!window.confirm('Approve this event and reserve the date?'))return;await R.rpc('admin_decide_booking',{p_booking:d.approve,p_approve:true,p_reason:null});R.notify('Booking approved and date reserved.','success');await loadBookings();return;}
if(d.reject){const reason=window.prompt('Enter the reason for rejecting this booking:');if(!reason?.trim())return;await R.rpc('admin_decide_booking',{p_booking:d.reject,p_approve:false,p_reason:reason.trim()});R.notify('Booking rejected.','success');await loadBookings();return;}
if(d.complete){if(!window.confirm('Mark this event as completed?'))return;await R.rpc('admin_complete_booking',{p_booking:d.complete});R.notify('Service marked complete.','success');await loadBookings();return;}
}));
initialize().catch(e=>R.notify(R.readable(e),'error'));
})();
