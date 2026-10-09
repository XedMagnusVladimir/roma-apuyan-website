(() => {
'use strict';
const R=window.Roma, db=R.client, $=R.qs;
let customerRows=[], customerTotal=0, customerOffset=0, customerSearchTimer=null, customersRequest=0;
let activeAdminTab='requests';
const CUSTOMERS_PAGE_SIZE=50;
let user, bookings=[],selectedBooking=null,services=[],methods=[],options=[],serviceMethodLinks=[], blocked=[],imageRows=[],calendar=null;
const imageSlots=[['hero_primary','Homepage — main photo','hero'],['hero_secondary','Homepage — second photo','hero'], ...Array.from({length:6},(_,i)=>[`gallery_${i+1}`,`Gallery — photo ${i+1}`,'gallery']),['service_portraits','Service card — portraits','website'],['service_events','Service card — events','website'],['service_films','Service card — films','website'],['service_editorial','Service card — editorial','website']];
function safe(fn){return async e=>{try{R.clear();if(e?.type==='submit'&&e.preventDefault)e.preventDefault();await fn(e)}catch(err){R.notify(R.readable(err),'error')}}}
function tab(which){
  activeAdminTab=which;
  document.querySelectorAll('[data-admin-tab]').forEach(b=>{
    const current=b.dataset.adminTab===which;
    b.classList.toggle('active',current);
    b.setAttribute('aria-selected',String(current));
  });
  for(const n of ['requests','services','payments','calendar','images','customers']){
    const panel=$('admin-'+n);
    if(panel)panel.hidden=n!==which;
  }
}
async function initialData(){
  // A failing secondary query must never block access to customers or other sections.
  const jobs=[['services',loadServices],['payment methods',loadMethods],['bookings',loadBookings],['blocked dates',loadBlocked],['website images',loadImages]];
  const results=await Promise.allSettled(jobs.map(async ([name,run])=>{await run();return name;}));
  const failed=results.map((r,i)=>r.status==='rejected'?`${jobs[i][0]}: ${R.readable(r.reason)}`:null).filter(Boolean);
  if(failed.length)R.notify('Some dashboard sections could not load: '+failed.join(' | '),'error');
  return failed;
}
async function initialize(){
  const loader=$('admin-loader');
  loader.hidden=false;
  $('admin-auth').hidden=true;
  $('admin-console').hidden=true;
  $('admin-logout').hidden=true;
  try{
    user=await R.loggedIn();
    if(!user){$('admin-auth').hidden=false;return;}
    if(!(await R.isAdmin(user))){$('admin-auth').hidden=false;throw Error('This account does not have the Super Administrator role.');}
    $('admin-user').textContent='Signed in as '+user.email+' · Super Administrator';
    // Show the screen only after initial data is loaded. Always reveal UI even on partial errors.
    await initialData();
    $('admin-console').hidden=false;
    $('admin-logout').hidden=false;
    tab(activeAdminTab);
    try{
      if(!calendar)calendar=window.RomaCalendar.mount('calendar-admin',{mode:'admin',fetchMonth:async(start,end)=>{
        const busy=await R.rpc('unavailable_booking_dates',{p_start:start,p_end:end});
        return {busy:busy.map(x=>x.event_date),events:bookings.filter(b=>['approved','completed'].includes(b.status)).map(b=>b.event_date)};
      }});
      else calendar.refresh();
    }catch(error){R.notify('Calendar unavailable: '+R.readable(error),'error');}
    if(activeAdminTab==='customers')await loadCustomers();
  }finally{loader.hidden=true;}
}
async function loadCustomers(){
  const requestId=++customersRequest;
  const tbody=$('customer-list');
  const state=$('customer-directory-state');
  state.textContent='Loading registered Supabase Auth accounts…';
  tbody.innerHTML='<tr><td colspan="6">Loading customer directory…</td></tr>';
  $('customer-count').textContent='Loading…';
  try{
    const result=await R.rpc('roma_admin_customer_directory_v2',{
      p_search:$('customer-search').value.trim(),
      p_limit:CUSTOMERS_PAGE_SIZE,
      p_offset:customerOffset
    });
    if(requestId!==customersRequest)return;
    const data=typeof result==='string'?JSON.parse(result):result;
    if(!data || !Array.isArray(data.rows))throw Error('Unexpected customer directory response. Run 08_CUSTOMER_DIRECTORY_V2.sql.');
    customerRows=data.rows;
    customerTotal=Number(data.total||0);
    state.textContent=`Registered accounts loaded successfully. ${customerTotal} matching account(s).`;
    renderCustomers();
  }catch(err){
    if(requestId!==customersRequest)return;
    const message=R.readable(err);
    const install=message.includes('roma_admin_customer_directory_v2') || message.includes('schema cache')
      ? 'Run 08_CUSTOMER_DIRECTORY_V2.sql in Supabase SQL Editor, then click Refresh customers.' : message;
    state.textContent='Customer list could not load: '+install;
    tbody.innerHTML='<tr><td colspan="6">'+R.esc(install)+'</td></tr>';
    $('customer-count').textContent='Customer directory unavailable';
    $('customers-prev').disabled=true;
    $('customers-next').disabled=true;
  }
}
function renderCustomers(){
  $('customer-list').innerHTML=customerRows.length?customerRows.map(c=>{
    const role=c.role||'customer';
    const canDelete=c.user_id!==user.id&&role!=='super_admin';
    const verified=c.email_verified?'Verified':'Awaiting verification';
    const joined=c.registered_at?new Date(c.registered_at).toLocaleDateString('en-PH',{dateStyle:'medium'}):'—';
    return `<tr><td>${R.esc(c.full_name||'Customer')}</td><td>${R.esc(c.email)}<br><small class="roma-muted">${verified}</small></td><td>${R.esc(c.phone||'—')}</td><td>${R.esc(role)}</td><td>${R.esc(joined)}</td><td>${canDelete?`<button class="roma-btn warn tiny" data-delete-user="${R.esc(c.user_id)}" type="button">Delete User</button>`:'Protected administrator'}</td></tr>`;
  }).join(''):'<tr><td colspan="6">No registered accounts match your search.</td></tr>';
  const from=customerTotal?customerOffset+1:0;
  const to=customerTotal?Math.min(customerOffset+customerRows.length,customerTotal):0;
  $('customer-count').textContent=`Showing ${from}–${to} of ${customerTotal} registered accounts`;
  $('customers-prev').disabled=customerOffset===0;
  $('customers-next').disabled=customerOffset+CUSTOMERS_PAGE_SIZE>=customerTotal;
}
async function deleteCustomer(userId){
  const target=customerRows.find(c=>c.user_id===userId);
  if(!target)throw Error('This customer is not on the current page. Click Refresh customers and try again.');
  if(!user || target.user_id===user.id || target.role==='super_admin')throw Error('Super Administrator accounts are protected.');
  const label=target.email||target.full_name||'this customer';
  const confirmation=window.prompt(`Delete the account for ${label}?\n\nThis will revoke their sign-in access and remove private ID and payment proof uploads. Booking and payment history is kept.\n\nType DELETE to confirm:`);
  if(confirmation===null)return;
  if(confirmation.trim()!=='DELETE'){
    R.notify('Deletion cancelled. Type DELETE exactly to confirm an account deletion.','error');
    return;
  }
  const button=Array.from(document.querySelectorAll('button[data-delete-user]')).find(b=>b.dataset.deleteUser===userId);
  const oldText=button?.textContent;
  if(button){button.disabled=true;button.textContent='Deleting…';}
  const state=$('customer-directory-state');
  if(state)state.textContent='Removing the selected customer account…';
  try{
    // This server-side Edge Function checks the caller's verified access token and
    // super_admin role. No privileged credentials are exposed to the browser.
    const {data,error}=await db.functions.invoke('roma-user-admin',{
      body:{action:'delete_customer',user_id:userId}
    });
    if(error){
      let detail=data?.error || error.message || 'Unable to delete this account.';
      // A function may return JSON with a helpful error body on a non-2xx status.
      try{
        if(error.context && typeof error.context.json==='function'){
          const body=await error.context.json();
          if(body?.error)detail=body.error;
        }
      }catch(_ignored){}
      throw Error(detail);
    }
    if(data?.error)throw Error(data.error);
    if(data?.ok!==true)throw Error('The deletion service did not confirm that the account was removed.');
    // Reload the directory from Supabase after successful deletion.
    if(customerRows.length===1 && customerOffset>0)customerOffset=Math.max(0,customerOffset-CUSTOMERS_PAGE_SIZE);
    await loadCustomers();
    R.notify(data.warning ? 'Account deleted. '+data.warning : 'Customer account deleted. Sign-in access revoked and booking history preserved.','success');
  }catch(err){
    if(state)state.textContent='Customer deletion failed: '+R.readable(err);
    throw err;
  }finally{
    if(button?.isConnected){button.disabled=false;button.textContent=oldText;}
  }
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
html+=`<p>Event: ${R.esc(b.event_name||'Event details not yet submitted')}<br>Location: ${R.esc(b.event_location||'—')}<br>Start time: ${R.esc(b.event_start_time||'—')}<br>Duration: ${b.event_duration_minutes?R.readableDuration(b.event_duration_minutes):'—'}</p><h3>Identity documents</h3>${docs.length?docs.map(d=>`<button class="roma-btn secondary tiny" data-file-bucket="roma-customer-ids" data-file-path="${R.esc(d.storage_path)}">View ID ${d.document_slot}</button>`).join(''):'<p class="roma-muted">No ID files received.</p>'}`;
html+=`<hr class="roma-divider"><h3>Submitted payments</h3>${pays.length?pays.map(p=>`<div class="roma-note"><strong>${R.money(p.amount_centavos)}</strong> · ${R.esc(p.status)}<br>Reference: ${R.esc(p.transaction_reference)}<br>Bank/wallet: ${R.esc(p.bank_or_wallet_used)}<br>${p.proof_path?(p.proof_path.startsWith('gdrive/')?`<button class="roma-btn secondary tiny" data-drive-proof="${R.esc(p.proof_path.slice(7))}">View Google Drive proof</button>`:`<button class="roma-btn secondary tiny" data-file-bucket="roma-payment-proofs" data-file-path="${R.esc(p.proof_path)}">View payment proof</button>`):''}${p.status==='submitted'?`<button class="roma-btn tiny" data-pay-approve="${p.id}">Verify payment</button><button class="roma-btn warn tiny" data-pay-reject="${p.id}">Reject proof</button>`:''}${p.rejection_reason?`<p>${R.esc(p.rejection_reason)}</p>`:''}</div>`).join(''):'<p class="roma-muted">No payments recorded.</p>'}`;
if(['approved','completed','rejected'].includes(b.status))html+=`<button class="roma-btn secondary" data-admin-pdf="${b.id}">Download booking document (PDF)</button>`;
if(b.status==='pending_approval' && b.event_name && b.event_location)html+=`<hr class="roma-divider"><h3>Booking decision</h3><button class="roma-btn" data-approve="${b.id}">APPROVE BOOKING — reserve date</button><button class="roma-btn warn" data-reject="${b.id}">Reject with reason</button>`;
else if(b.status==='payment_verified')html+=`<div class="roma-note">Payment verified. Waiting for customer to submit event details before booking approval.</div>`;
else if(b.status==='payment_under_review'||b.status==='awaiting_payment')html+=`<div class="roma-note">Submitted proof does not count as paid until you click Verify payment for that submission.</div>`;
html+=`<hr class="roma-divider"><button class="roma-btn warn" type="button" data-delete-transaction="${b.id}">Delete this transaction</button>`;
if(b.status==='approved')html+=`<hr class="roma-divider"><button class="roma-btn" data-complete="${b.id}">Mark service completed</button>`;
if(['approved','completed','payment_verified','pending_approval'].includes(b.status)&&b.total_centavos>b.paid_centavos)html+=`<hr class="roma-divider"><h3>Record payment received manually</h3><form id="offline-payment"><label class="roma-field">Amount in pesos<input name="amount" type="number" step="0.01" min="0.01" max="${((b.total_centavos-b.paid_centavos)/100).toFixed(2)}" required></label><label class="roma-field">Reference<input name="reference" maxlength="150" required></label><button class="roma-btn" type="submit">Record verified payment</button></form>`;
html+=`<hr class="roma-divider"><h3>Customer messages</h3>${msgs.length?msgs.map(m=>`<div class="roma-note">${R.esc(m.message)}<br><small>${new Date(m.created_at).toLocaleString()} ${m.is_internal?'· Staff only':''}</small></div>`).join(''):'<p class="roma-muted">No messages yet.</p>'}<form id="admin-message"><label class="roma-field">Reply<textarea name="message" maxlength="5000" required></textarea></label><label class="roma-field"><span><input name="internal" type="checkbox"> Internal note (not visible to customer)</span></label><button class="roma-btn" type="submit">Save message</button></form>`;
$('admin-booking-details').innerHTML=html;}
async function loadServices(){services=R.check(await db.from('services').select('*').order('name'));options=R.check(await db.from('service_payment_options').select('*'));serviceMethodLinks=R.check(await db.from('service_payment_methods').select('*'));
$('services-admin-list').innerHTML=services.length?services.map(s=>`<article class="roma-card roma-package-tile">${s.banner_drive_file_id?`<img class="roma-banner" src="${R.image(s.banner_drive_file_id)}" alt="${R.esc(s.name)}">`:''}<h3>${R.esc(s.name)}</h3><p>${R.money(s.base_price_centavos)} · ${s.is_active?'Active':'Disabled'}</p><p>${R.readableDuration(s.duration_minutes)}</p><div class="roma-tile-actions"><button class="roma-btn secondary tiny" data-view-service="${s.id}">View details</button><button class="roma-btn secondary tiny" data-edit-service="${s.id}">Edit</button><button class="roma-btn warn tiny" data-delete-service="${s.id}">Delete</button></div><div class="roma-package-details" id="package-detail-${s.id}" hidden><p>${R.esc(s.description)}</p><strong>Inclusions</strong><ul>${(s.inclusions||[]).map(x=>`<li>${R.esc(x)}</li>`).join('')}</ul></div></article>`).join(''):'<p class="roma-muted">Create your first service package.</p>';
renderMethodChecks();}
function renderMethodChecks(){const selected=document.querySelector('#service-form input[name="id"]').value;
$('service-methods').innerHTML=methods.length?methods.map(m=>`<label><input name="method_options" type="checkbox" value="${m.id}" ${selected&&serviceMethodLinks.some(x=>x.service_id===selected&&x.method_id===m.id)?'checked':''}> ${R.esc(m.name)}${m.is_active?'':' (inactive)'}</label>`).join(''):'<p class="roma-muted">Create a payment method under Payment methods to assign it here.</p>';}
function serviceReset(){const f=$('service-form');f.reset();f.elements.id.value='';f.elements.is_active.checked=true;f.querySelectorAll('[name="options"]').forEach(x=>x.checked=true);$('service-image-state').textContent='';renderMethodChecks();}
function editService(id){const s=services.find(x=>x.id===id);if(!s)return;const f=$('service-form');f.elements.id.value=s.id;f.elements.name.value=s.name;f.elements.description.value=s.description;f.elements.price.value=(s.base_price_centavos/100).toFixed(2);f.elements.duration_unit.value=s.duration_minutes%1440===0?'days':s.duration_minutes%60===0?'hours':'minutes';f.elements.duration.value=f.elements.duration_unit.value==='days'?s.duration_minutes/1440:f.elements.duration_unit.value==='hours'?s.duration_minutes/60:s.duration_minutes;f.elements.duration.max=f.elements.duration_unit.value==='days'?'365':f.elements.duration_unit.value==='hours'?'8760':'525600';f.elements.inclusions.value=(s.inclusions||[]).join('\n');f.elements.image.value=s.banner_drive_file_id||'';$('service-image-state').textContent=s.banner_drive_file_id?'Existing banner attached. Select a new image to replace it.':'No banner uploaded.';f.elements.is_active.checked=s.is_active;f.querySelectorAll('[name="options"]').forEach(x=>x.checked=options.some(o=>o.service_id===s.id&&o.option_code===x.value));renderMethodChecks();tab('services');f.scrollIntoView({behavior:'smooth'});}
async function saveService(e){const f=e.currentTarget;const id=f.elements.id.value;const file=f.elements.image_file.files[0];let parsed=String(f.elements.image.value||'').trim();if(file){$('service-image-state').textContent='Uploading banner to Google Drive…';parsed=await R.uploadToDrive(file,'service_banner');$('service-image-state').textContent='Banner uploaded to Google Drive.';}const incl=f.elements.inclusions.value.split('\n').map(x=>x.trim()).filter(Boolean);
const data={name:f.elements.name.value.trim(),description:f.elements.description.value.trim(),base_price_centavos:Math.round(Number(f.elements.price.value)*100),duration_minutes:R.durationMinutes(f.elements.duration.value,f.elements.duration_unit.value),inclusions:incl,banner_drive_file_id:parsed||null,is_active:f.elements.is_active.checked,updated_at:new Date().toISOString()};
let svcId=id;if(id){R.check(await db.from('services').update(data).eq('id',id));}else{const s=R.check(await db.from('services').insert(data).select('id').single());svcId=s.id;}
R.check(await db.from('service_payment_options').delete().eq('service_id',svcId));const opt=Array.from(f.querySelectorAll('input[name="options"]:checked')).map(x=>({service_id:svcId,option_code:x.value}));if(opt.length)R.check(await db.from('service_payment_options').insert(opt));
R.check(await db.from('service_payment_methods').delete().eq('service_id',svcId));const linked=Array.from(f.querySelectorAll('input[name="method_options"]:checked')).map(x=>({service_id:svcId,method_id:x.value}));if(linked.length)R.check(await db.from('service_payment_methods').insert(linked));
R.notify('Service package saved.','success');await loadServices();serviceReset();}
async function loadMethods(){methods=R.check(await db.from('payment_methods').select('*').order('name'));$('method-admin-list').innerHTML=methods.length?methods.map(m=>`<div class="roma-card"><h3>${R.esc(m.name)}</h3><p>${R.esc(m.provider)}<br>${R.esc(m.account_holder)}<br>${m.is_active?'Active':'Inactive'}</p><button class="roma-btn secondary tiny" data-edit-method="${m.id}">Edit</button><button class="roma-btn warn tiny" data-delete-method="${m.id}">Delete</button></div>`).join(''):'<p class="roma-muted">Add your first bank or e-wallet account.</p>';renderMethodChecks();}
function methodReset(){const f=$('method-form');f.reset();f.elements.id.value='';f.elements.is_active.checked=true;$('method-qr-state').textContent='';}
function editMethod(id){const m=methods.find(x=>x.id===id);if(!m)return;const f=$('method-form');f.elements.id.value=m.id;f.elements.name.value=m.name;f.elements.provider.value=m.provider;f.elements.holder.value=m.account_holder;f.elements.details.value=m.account_details;f.elements.instructions.value=m.instructions;f.elements.qr.value=m.qr_drive_file_id||'';$('method-qr-state').textContent=m.qr_drive_file_id?'QR image attached; upload another to replace it.':'No QR image attached.';f.elements.is_active.checked=m.is_active;tab('payments');f.scrollIntoView({behavior:'smooth'});}
async function saveMethod(e){const f=e.currentTarget;const file=f.elements.qr_file.files[0];let parsed=String(f.elements.qr.value||'').trim();if(file){$('method-qr-state').textContent='Uploading QR image to Google Drive…';parsed=await R.uploadToDrive(file,'payment_qr');$('method-qr-state').textContent='QR image uploaded.';}const data={name:f.elements.name.value.trim(),provider:f.elements.provider.value.trim(),account_holder:f.elements.holder.value.trim(),account_details:f.elements.details.value.trim(),instructions:f.elements.instructions.value.trim(),qr_drive_file_id:parsed||null,is_active:f.elements.is_active.checked};const id=f.elements.id.value;
if(id)R.check(await db.from('payment_methods').update(data).eq('id',id));else R.check(await db.from('payment_methods').insert(data));R.notify('Payment method saved.','success');await loadMethods();methodReset();}
async function loadBlocked(){blocked=R.check(await db.from('blocked_dates').select('*').order('event_date'));$('blocked-list').innerHTML=blocked.length?blocked.map(d=>`<div class="roma-booking">${R.datePH(d.event_date)} — ${R.esc(d.reason)} <button class="roma-btn secondary tiny" data-unblock="${d.event_date}">Unblock</button></div>`).join(''):'<p class="roma-muted">No manually blocked dates.</p>';}
async function loadImages(){imageRows=R.check(await db.from('site_images').select('*'));$('image-positions').innerHTML=imageSlots.map(([slot,label])=>{const row=imageRows.find(x=>x.slot_key===slot);return `<div class="roma-card"><h3>${R.esc(label)}</h3>${row?.drive_file_id?`<img class="roma-banner" src="${R.image(row.drive_file_id)}" alt="${R.esc(label)}">`:''}<form data-image-form="${slot}"><label class="roma-field">Upload image to Google Drive<input name="image_file" type="file" accept="image/jpeg,image/png,image/webp"></label><input name="image" type="hidden" value="${R.esc(row?.drive_file_id||'')}"><label class="roma-field">Image title<input name="title" maxlength="140" value="${R.esc(row?.title||label)}"></label><label class="roma-field"><span><input name="active" type="checkbox" ${row?.is_active!==false?'checked':''}> Display this image</span></label><button class="roma-btn" type="submit">Save image</button></form></div>`}).join('');}
async function saveImage(e){const f=e.target;const slot=f.dataset.imageForm;const lookup=imageSlots.find(x=>x[0]===slot);if(!lookup)throw Error('Invalid image slot.');const file=f.elements.image_file.files[0];const id=file?await R.uploadToDrive(file,'site_image'):f.elements.image.value.trim();const existing=imageRows.find(x=>x.slot_key===slot);if(!id){if(existing)R.check(await db.from('site_images').delete().eq('id',existing.id));}else{const data={slot_key:slot,placement:lookup[2],title:f.elements.title.value.trim()||lookup[1],drive_file_id:id,is_active:f.elements.active.checked};if(existing)R.check(await db.from('site_images').update(data).eq('id',existing.id));else R.check(await db.from('site_images').insert(data));}
R.notify('Image saved. Your public website will use this Google Drive image.','success');await loadImages();}
$('admin-login').addEventListener('submit',safe(async e=>{const f=e.currentTarget;R.check(await db.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value}));await initialize();}));
$('admin-logout').addEventListener('click',safe(async()=>{R.check(await db.auth.signOut());user=null;selectedBooking=null;await initialize();}));
document.querySelectorAll('[data-admin-tab]').forEach(b=>b.addEventListener('click',()=>{tab(b.dataset.adminTab);if(b.dataset.adminTab==='customers')loadCustomers().catch(e=>R.notify(R.readable(e),'error'));}));
$('refresh-customers').addEventListener('click',safe(loadCustomers));
$('customer-search').addEventListener('input',()=>{
  window.clearTimeout(customerSearchTimer);
  customerSearchTimer=window.setTimeout(()=>{customerOffset=0;loadCustomers();},300);
});
$('customers-prev').addEventListener('click',safe(async()=>{
  customerOffset=Math.max(0,customerOffset-CUSTOMERS_PAGE_SIZE);
  await loadCustomers();
}));
$('customers-next').addEventListener('click',safe(async()=>{
  customerOffset+=CUSTOMERS_PAGE_SIZE;
  await loadCustomers();
}));
$('reload-bookings').addEventListener('click',safe(loadBookings));
$('service-form').elements.duration_unit.addEventListener('change',e=>{$('service-form').elements.duration.max=e.target.value==='days'?'365':e.target.value==='hours'?'8760':'525600';});$('service-form').addEventListener('submit',safe(saveService));$('service-reset').addEventListener('click',serviceReset);
$('method-form').addEventListener('submit',safe(saveMethod));$('method-reset').addEventListener('click',methodReset);
$('block-form').addEventListener('submit',safe(async e=>{const f=e.currentTarget;R.check(await db.from('blocked_dates').insert({event_date:f.elements.event_date.value,reason:f.elements.reason.value.trim(),created_by:user.id}));R.notify('Date blocked.','success');f.reset();await loadBlocked();if(calendar)calendar.refresh();}));
document.addEventListener('submit',safe(async e=>{const f=e.target;if(f.dataset.imageForm)await saveImage(e);
if(f.id==='offline-payment'){const b=bookings.find(b=>b.id===selectedBooking);await R.rpc('admin_record_offline_payment',{p_booking:b.id,p_amount:Math.round(Number(f.elements.amount.value)*100),p_reference:f.elements.reference.value.trim()});R.notify('Payment recorded.','success');await loadBookings();}
if(f.id==='admin-message'){R.check(await db.from('booking_messages').insert({booking_id:selectedBooking,sender_id:user.id,message:f.elements.message.value.trim(),is_internal:f.elements.internal.checked}));R.notify('Message saved.','success');await showBooking(selectedBooking);}
}));
document.addEventListener('click',safe(async e=>{const btn=e.target.closest('button');if(!btn)return;
const d=btn.dataset;if(d.deleteUser){await deleteCustomer(d.deleteUser);return;}if(d.selectBooking){await showBooking(d.selectBooking);return;}
if(d.deleteTransaction){const b=bookings.find(b=>b.id===d.deleteTransaction);const confirmText=window.prompt(`Delete the entire transaction ${b?.reference_number||''}, including booking, payments and messages? This cannot be undone.\nType DELETE TRANSACTION to confirm:`);if(confirmText!=='DELETE TRANSACTION')return;const {data,error}=await db.functions.invoke('roma-drive-media',{body:{action:'delete_transaction',booking_id:d.deleteTransaction}});if(error||!data?.ok)throw Error(data?.error||error?.message||'Transaction deletion failed.');selectedBooking=null;$('admin-booking-details').innerHTML='Transaction deleted.';await loadBookings();R.notify(data.warning||'Transaction deleted successfully.','success');return;}if(d.adminPdf){const b=bookings.find(x=>x.id===d.adminPdf);const profile=R.check(await db.from('profiles').select('full_name,email,phone').eq('user_id',b.user_id).single());window.RomaPDF.build(b,profile);return;}
if(d.driveProof){await R.viewDriveProof(d.driveProof);return;}if(d.fileBucket&&d.filePath){await signed(d.fileBucket,d.filePath);return;}
if(d.viewService){const detail=$('package-detail-'+d.viewService);if(detail)detail.hidden=!detail.hidden;return;}if(d.editService){editService(d.editService);return;}
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
initialize().catch(e=>{ $('admin-loader').hidden=true; R.notify('Dashboard could not start: '+R.readable(e),'error'); });
})();
