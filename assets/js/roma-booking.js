(() => {
'use strict';
const R=window.Roma, db=R.client;
let user=null,services=[],options=[], unavailable=[], myBookings=[],selected=null,methods=[],calendar=null;
const $=R.qs;
function safe(fn){return async e=>{
  const form=e?.type==='submit'&&e.target instanceof HTMLFormElement?e.target:null;
  if(form){e.preventDefault();if(form.dataset.busy==='1')return;form.dataset.busy='1';form.setAttribute('aria-busy','true');}
  const button=form?.querySelector('button[type="submit"]'),old=button?.textContent;
  if(button){button.disabled=true;button.textContent='Working…';}
  try{R.clear();await fn(e)}catch(err){R.notify(R.readable(err),'error');}
  finally{if(button?.isConnected && form?.dataset.submitted!=='1'){button.disabled=false;button.textContent=old;}
    if(form){delete form.dataset.busy;form.removeAttribute('aria-busy');}}
}}
function showTab(name){['browse','mine','profile'].forEach(s=>{$('tab-'+s).hidden=s!==name;document.querySelector(`[data-tab="${s}"]`)?.classList.toggle('active',s===name)})}
const priceFor=(svc,opt)=>{const p=Number(svc.base_price_centavos);return opt==='full_discount'?Math.round(p*.9):opt==='after_service_plus_10'?Math.round(p*1.1):p};
const initialFor=(svc,opt)=>opt==='after_service_plus_10'?0:opt==='deposit_25'?Math.round(Number(svc.base_price_centavos)*.25):priceFor(svc,opt);
const optLabel=o=>R.optionText[o]||o;
async function servicesLoad(){services=R.check(await db.from('services').select('*').eq('is_active',true).order('name'));options=R.check(await db.from('service_payment_options').select('*'));
const html=services.length?services.map(s=>`<article class="roma-card">${s.banner_drive_file_id?`<img class="roma-banner" src="${R.image(s.banner_drive_file_id)}" alt="${R.esc(s.name)}">`:''}<h3>${R.esc(s.name)}</h3><p>${R.esc(s.description)}</p><p class="roma-amount">${R.money(s.base_price_centavos)}</p><p class="roma-muted">${R.readableDuration(s.duration_minutes)} · ${Array.isArray(s.inclusions)?s.inclusions.length:0} inclusions</p><ul>${Array.isArray(s.inclusions)?s.inclusions.map(i=>`<li>${R.esc(i)}</li>`).join(''):''}</ul>${user?`<button class="roma-btn" data-pick="${s.id}">Request service</button>`:`<a class="roma-btn secondary" href="#auth-view">Sign in to request</a>`}</article>`).join(''):'<div class="roma-empty">Service packages will appear here when published by the studio.</div>';
$('public-services').innerHTML=html;$('book-services').innerHTML=html;
}
async function updateAvailability(){const v=document.querySelector('#new-booking input[name="event_date"]').value;
if(!v)return;const r=await R.rpc('unavailable_booking_dates',{p_start:v,p_end:v});const blocked=(r||[]).some(x=>x.event_date===v);$('date-status').textContent=blocked?'This date is already booked or blocked. Select another day.':'This date is currently available for a request. Final approval reserves the date.';$('date-status').dataset.blocked=blocked?'1':'0';}
function chooseService(id){const svc=services.find(s=>s.id===id);if(!svc)return;const panel=$('new-booking');panel.hidden=false;const f=$('new-booking-form');f.querySelectorAll('input,select,button').forEach(x=>x.disabled=false);creatingBooking=false;delete f.dataset.submitted;$('booking-submit-status').textContent='';$('chosen-title').textContent='Request: '+svc.name;
const form=$('new-booking-form');form.elements.service_id.value=svc.id;
const allowed=options.filter(o=>o.service_id===svc.id).map(o=>o.option_code);
$('booking-option').innerHTML=allowed.map(o=>`<option value="${o}">${R.esc(optLabel(o))}</option>`).join('');
$('booking-option').disabled=!allowed.length;form.querySelector('button[type=submit]').disabled=!allowed.length;
if(!allowed.length)R.notify('This package does not have a payment arrangement configured yet.','error');
form.elements.event_date.min=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const update=()=>{const opt=form.elements.option_code.value;$('price-preview').textContent=`Contract amount: ${R.money(priceFor(svc,opt))} · Required upfront: ${R.money(initialFor(svc,opt))}`};
form.elements.option_code.onchange=update;update();panel.scrollIntoView({behavior:'smooth',block:'start'});}
async function profileLoad(){if(!user)return;const data=R.check(await db.from('profiles').select('*').eq('user_id',user.id).single());const form=$('profile-form');form.elements.full_name.value=data.full_name||'';form.elements.phone.value=data.phone||'';form.elements.email.value=user.email||'';}
async function loginState(){
const loader=$('auth-loader');
loader.hidden=false;
$('auth-view').hidden=true;
$('client-view').hidden=true;
try{
  user=await R.loggedIn();
  $('logout').hidden=!user;
  $('admin-link').hidden=true;
  if(user){
    $('client-view').hidden=false;
    $('admin-link').hidden=!(await R.isAdmin(user));
    await Promise.all([servicesLoad(),profileLoad(),loadBookings()]);
    if(!calendar) calendar=window.RomaCalendar.mount('calendar-customer',{
      fetchMonth:async(start,end)=>({busy:(await R.rpc('unavailable_booking_dates',{p_start:start,p_end:end})).map(r=>r.event_date)}),
      onPick:iso=>{const f=$('new-booking-form');f.elements.event_date.value=iso;updateAvailability().catch(e=>R.notify(R.readable(e),'error'));}
    });
  }else{
    $('auth-view').hidden=false;
    await servicesLoad();
  }
}finally{loader.hidden=true;}
}
async function loadBookings(prefer){if(!user)return;myBookings=R.check(await db.from('bookings').select('*').order('created_at',{ascending:false}));
$('my-bookings').innerHTML=myBookings.length?myBookings.map(b=>`<div class="roma-booking ${b.id===selected?'selected':''}"><button data-booking="${b.id}"><strong>${R.esc(b.reference_number)}</strong><br>${R.esc(b.service_name_snapshot)}<br>${R.datePH(b.event_date)}<br><span class="roma-pill">${R.esc(b.status.replaceAll('_',' '))}</span></button></div>`).join(''):'<div class="roma-empty">No bookings yet. Select a service to begin.</div>';
const id=prefer||selected;if(id&&myBookings.some(b=>b.id===id))await displayBooking(id);else $('my-booking-details').innerHTML='<p>Select a booking to see its information and next required action.</p>';
}
async function uploadPrivate(file,bucket,path){const ext=file.name.split('.').pop().toLowerCase();if(!['jpg','jpeg','png','webp','pdf'].includes(ext))throw Error('Choose a JPG, PNG, WebP, or PDF file.');if(file.size>10*1024*1024)throw Error('Maximum file size is 10 MB.');const optimized=file.type==='application/pdf'?file:await R.preparePrivateImage(file,'identity');R.check(await db.storage.from(bucket).upload(path,optimized,{upsert:false,contentType:optimized.type}));}
async function uploadIds(form){const b=myBookings.find(b=>b.id===selected);if(!b)throw Error('Select a booking first.');const rows=R.check(await db.from('customer_identity_documents').select('document_slot').eq('booking_id',b.id));const existing=rows.map(x=>x.document_slot);
for(const slot of [1,2]){if(existing.includes(slot))continue;const input=form.querySelector(`[name="id_${slot}"]`);const file=input?.files?.[0];if(!file)throw Error('Choose both government ID files.');const path=`${user.id}/${b.id}/id-${slot}-${crypto.randomUUID()}.${file.name.split('.').pop().toLowerCase()}`;await uploadPrivate(file,'roma-customer-ids',path);R.check(await db.from('customer_identity_documents').insert({booking_id:b.id,user_id:user.id,document_slot:slot,storage_path:path}));}
R.notify('Two ID documents saved to private storage.','success');await loadBookings(b.id);}
async function getMethods(b){methods=await R.rpc('list_booking_payment_methods',{p_booking:b.id});return methods||[]}
async function paymentDetails(b,methodId){const details=await R.rpc('get_booking_payment_details',{p_booking:b.id,p_method:methodId});const d=details?.[0];let methodIcon='';if(d){const {data:iconRow}=await db.from('payment_methods').select('icon_drive_file_id').eq('id',methodId).maybeSingle();if(iconRow?.icon_drive_file_id)methodIcon=`<img src="${R.image(iconRow.icon_drive_file_id)}" alt="Payment method icon" class="roma-customer-method-icon">`;}if(!$('payment-account'))return; $('payment-account').innerHTML=d?`<div class="roma-note">${methodIcon}<strong>${R.esc(d.method_name)}</strong><br>${R.esc(d.provider)}<br>${R.esc(d.account_holder)}<br>${R.esc(d.account_details)}<br>${R.esc(d.instructions)}${d.qr_drive_file_id?`<img src="${R.image(d.qr_drive_file_id)}" class="roma-banner" alt="Payment QR">`:''}</div>`:'<p>Select an available method.</p>';}
async function displayBooking(id){
  selected=id;
  const b=myBookings.find(x=>x.id===id);if(!b)return;
  const [docs,pays,messages,profile]=await Promise.all([
    R.query(db.from('customer_identity_documents').select('document_slot').eq('booking_id',id)),
    R.query(db.from('booking_payments').select('*').eq('booking_id',id).order('created_at',{ascending:false})),
    R.query(db.from('booking_messages').select('*').eq('booking_id',id).eq('is_internal',false).order('created_at')),
    R.query(db.from('profiles').select('full_name,email,phone').eq('user_id',user.id).maybeSingle())
  ]);
  const docSlots=new Set(docs.map(d=>Number(d.document_slot)));
  const docsDone=docSlots.has(1)&&docSlots.has(2);
  const contactReady=!!(profile?.full_name?.trim()&&profile?.email?.trim()&&profile?.phone?.trim());
  const after=b.option_code==='after_service_plus_10';
  const terminal=['rejected','cancelled','completed'].includes(b.status);
  const eventCompleted=!!(b.event_name&&b.event_location&&b.event_start_time&&b.event_duration_minutes);
  const canEvent=!terminal&&!eventCompleted&&docsDone&&contactReady&&Number(b.paid_centavos)>=Number(b.initial_due_centavos)&&
    (after?['awaiting_details','pending_approval'].includes(b.status):b.status==='payment_verified');
  const hasUpfront=!after&&Number(b.initial_due_centavos)>0;
  const needsInitialPay=hasUpfront&&Number(b.paid_centavos)<Number(b.initial_due_centavos)&&!terminal;
  const methodChoices=needsInitialPay?await getMethods(b):[];
  const statusLabel={awaiting_details:'Awaiting identity and event details',awaiting_payment:'Awaiting payment',payment_under_review:'Payment awaiting verification',payment_verified:'Payment verified — enter event details',pending_approval:'Event request awaiting studio approval',approved:'Approved',completed:'Completed',rejected:'Rejected'};
  let html=`<header class="roma-booking-heading"><h3>${R.esc(b.reference_number)}</h3><span class="roma-pill">${R.esc(statusLabel[b.status]||b.status)}</span></header>
  <p><strong>${R.esc(b.service_name_snapshot)}</strong> · ${R.datePH(b.event_date)}<br>${R.esc(optLabel(b.option_code))}</p>
  <div class="roma-payment-summary"><div><span>Contract amount</span><strong>${R.money(b.total_centavos)}</strong></div><div><span>Verified payments</span><strong>${R.money(b.paid_centavos)}</strong></div><div><span>Outstanding balance</span><strong>${R.money(Math.max(0,b.total_centavos-b.paid_centavos))}</strong></div></div>
  ${b.rejection_reason?`<div class="roma-note">Reason: ${R.esc(b.rejection_reason)}</div>`:''}`;
  if(!terminal&&!eventCompleted){
    html+=`<section class="roma-checkout-step"><h3>1. Your contact information</h3>
      <p class="roma-muted">Name, email and phone number are required for the booking.</p>
      <form id="booking-contact-form" class="roma-checkout-form">
      <label class="roma-field">Full name<input name="full_name" maxlength="150" required value="${R.esc(profile?.full_name||'')}"></label>
      <label class="roma-field">Email address<input name="email" type="email" readonly value="${R.esc(profile?.email||user.email||'')}"></label>
      <label class="roma-field">Phone number<input name="phone" maxlength="35" required value="${R.esc(profile?.phone||'')}"></label>
      <button class="roma-btn secondary" type="submit">${contactReady?'Update contact details':'Save contact details'}</button>
      ${contactReady?'<span class="roma-inline-success">Contact details saved</span>':''}</form></section>`;
    html+=`<section class="roma-checkout-step"><h3>2. Two government IDs</h3>
      <p class="roma-muted">Upload both documents before sending your event request.</p>
      ${docsDone?'<div class="roma-inline-success">Both documents received.</div>':`<form id="ids-form" class="roma-checkout-form">${[1,2].map(n=>`<label class="roma-field">Government ID ${n} ${docSlots.has(n)?'— received':`<input name="id_${n}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>`}</label>`).join('')}<button class="roma-btn" type="submit">Upload government IDs</button></form>`}
      </section>`;
  }
  if(hasUpfront&&!terminal){
    html+=`<section class="roma-checkout-step"><h3>3. Manual payment — ${R.money(b.initial_due_centavos)} due now</h3><p class="roma-muted">Select a payment method to view the recipient details, pay manually and submit your receipt. You may return later.</p>`;
    if(b.status==='payment_under_review')html+='<div class="roma-note">Your payment proof is under review. It will count as paid only when the studio verifies it.</div>';
    if(Number(b.paid_centavos)>=Number(b.initial_due_centavos))html+='<div class="roma-inline-success">Required initial payment verified. You may enter event details.</div>';
    if(needsInitialPay&&methodChoices.length){
      html+=`<label class="roma-field">Available payment method<select id="pay-method-preview">${methodChoices.map(m=>`<option value="${R.esc(m.method_id)}">${R.esc(m.method_name)} — ${R.esc(m.provider)}</option>`).join('')}</select></label><div id="payment-account" class="roma-payment-account"></div>`;
      if(b.status!=='payment_under_review'&&contactReady&&docsDone){
        html+=`<form id="payment-form" class="roma-checkout-form"><input type="hidden" name="method" value="${R.esc(methodChoices[0].method_id)}">
        <label class="roma-field">Amount actually paid (PHP)<input name="amount" type="number" min="0.01" step="0.01" value="${((b.initial_due_centavos-b.paid_centavos)/100).toFixed(2)}" required></label>
        <label class="roma-field">Bank / e-wallet used<input name="bank" maxlength="150" required></label>
        <label class="roma-field">Transaction/reference number<input name="reference" maxlength="180" required></label>
        <label class="roma-field">Screenshot of payment<input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label>
        <button class="roma-btn" type="submit">Submit payment proof for verification</button></form>`;
      }else if(b.status!=='payment_under_review')html+='<p class="roma-muted">Save your contact details and upload both government IDs to enable receipt submission.</p>';
      queueMicrotask(()=>paymentDetails(b,methodChoices[0].method_id).catch(e=>R.notify(R.readable(e),'error')));
    }else if(needsInitialPay&&!methodChoices.length)html+='<div class="roma-note">The studio must configure an active payment method for this package.</div>';
    html+='</section>';
  }
  if(after&&!terminal){html+=`<section class="roma-checkout-step"><h3>3. Pay after the service</h3><p>No upfront payment is required. Your agreed total is ${R.money(b.total_centavos)}, including the additional 10%. Payment will be recorded after the event.</p></section>`;}
  if(!terminal){
    html+='<section class="roma-checkout-step"><h3>4. Event details and studio approval</h3>';
    if(canEvent){html+=`<form id="event-form" class="roma-checkout-form"><label class="roma-field">Event name<input name="name" maxlength="180" required></label><label class="roma-field">Location<input name="location" maxlength="250" required></label><div class="roma-2cols"><label class="roma-field">Event start time<input name="start" type="time" required></label><label class="roma-field">Event duration<input name="duration" type="number" min="1" max="8760" value="${Math.max(1,Math.round((b.event_duration_minutes||120)/60))}" required><select name="duration_unit"><option value="hours">Hours</option><option value="minutes">Minutes</option><option value="days">Days</option></select></label></div><label class="roma-field">Additional event notes<textarea name="notes" maxlength="2000"></textarea></label><button class="roma-btn" type="submit">Submit event details for studio approval</button></form>`;}
    else if(eventCompleted)html+='<div class="roma-inline-success">Event details submitted; waiting for the studio decision.</div>';
    else html+=`<p class="roma-muted">${!contactReady?'Save your contact details. ':''}${!docsDone?'Upload both IDs. ':''}${!after&&Number(b.paid_centavos)<Number(b.initial_due_centavos)?'The studio must verify the required upfront payment before this form unlocks. ':''}</p>`;
    html+='</section>';
  }
  if(eventCompleted)html+=`<section class="roma-checkout-step"><h3>Submitted event information</h3><p>${R.esc(b.event_name)}<br>${R.esc(b.event_location)}<br>${R.esc(b.event_start_time)} · ${R.readableDuration(b.event_duration_minutes)}</p></section>`;
  if(['approved','completed','rejected'].includes(b.status))html+=`<button class="roma-btn secondary" data-download-pdf="${b.id}">Download ${b.status==='rejected'?'rejection notice':'approved booking slip'} (PDF)</button>`;
  html+=`<section class="roma-checkout-step"><h3>Payment history for this booking</h3>${pays.length?pays.map(p=>`<div class="roma-note"><strong>${R.money(p.amount_centavos)}</strong> · ${R.esc(p.status)}<br>Reference: ${R.esc(p.transaction_reference||'—')}<br>${p.status==='submitted'?'Awaiting verification by studio':p.status==='verified'?'Manually verified by studio':p.rejection_reason?R.esc(p.rejection_reason):''}</div>`).join(''):'<p class="roma-muted">No payment has been verified or submitted for this booking yet.</p>'}</section>`;
  html+=`<section class="roma-checkout-step"><h3>Messages with the studio</h3>${messages.length?messages.map(m=>`<div class="roma-note">${R.esc(m.message)}<br><span class="roma-muted">${new Date(m.created_at).toLocaleString()}</span></div>`).join(''):'<p class="roma-muted">No messages yet.</p>'}<form id="message-form"><label class="roma-field">Send message<textarea name="message" maxlength="5000" required></textarea></label><button class="roma-btn secondary" type="submit">Send message</button></form></section>`;
  $('my-booking-details').innerHTML=html;
}
$('login-form').addEventListener('submit',safe(async e=>{const f=e.currentTarget;R.check(await db.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value}));await loginState();R.notify('Signed in.','success');}));
$('signup-form').addEventListener('submit',safe(async e=>{const f=e.currentTarget;const data=R.check(await db.auth.signUp({email:f.elements.email.value.trim(),password:f.elements.password.value,options:{data:{full_name:f.elements.full_name.value.trim()},emailRedirectTo:new URL('/email-confirmed.html',window.location.origin).toString()}}));R.notify(data.session?'Registration successful. Sign in to continue.':'Account created. Check your email for the confirmation link, then sign in.','success');if(data.session)await loginState();}));
$('logout').addEventListener('click',safe(async()=>{R.check(await db.auth.signOut());user=null;selected=null;await loginState();}));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',safe(async()=>{showTab(b.dataset.tab);if(b.dataset.tab==='mine')await loadBookings();if(b.dataset.tab==='profile')await profileLoad();})));
$('profile-form').addEventListener('submit',safe(async e=>{const f=e.currentTarget;await R.rpc('update_my_profile',{p_full_name:f.elements.full_name.value.trim(),p_phone:f.elements.phone.value.trim()});R.notify('Contact information saved.','success');}));
document.addEventListener('click',e=>{if(!(e.target instanceof Element)||!e.target.closest('[data-download-pdf],[data-pick],[data-booking]'))return;return safe(async e=>{const pdf=e.target.closest('[data-download-pdf]');if(pdf){const b=myBookings.find(x=>x.id===pdf.dataset.downloadPdf);const profile=R.check(await db.from('profiles').select('full_name,email,phone').eq('user_id',user.id).single());window.RomaPDF.build(b,profile);return;}const pick=e.target.closest('[data-pick]');if(pick){showTab('browse');chooseService(pick.dataset.pick)}const row=e.target.closest('[data-booking]');if(row){showTab('mine');await displayBooking(row.dataset.booking)} })(e);});
$('new-booking-form').elements.event_date.addEventListener('change',safe(updateAvailability));
let creatingBooking=false;
$('new-booking-form').addEventListener('submit',safe(async e=>{
  const f=e.currentTarget;if(creatingBooking)return;
  if($('date-status').dataset.blocked==='1')throw Error('Choose an available date.');
  const button=f.querySelector('button[type=submit]');let committed=false;creatingBooking=true;button.disabled=true;
  $('booking-submit-status').textContent='Submitting your request…';
  try{
    const id=await R.rpc('start_booking',{p_service:f.elements.service_id.value,p_option:f.elements.option_code.value,p_day:f.elements.event_date.value});
    committed=true;f.dataset.submitted='1';f.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
    $('booking-submit-status').textContent='Request submitted successfully. Continue your booking below.';
    $('new-booking').hidden=true;selected=id;await loadBookings(id);
    showTab('mine');
    R.notify('Booking opened. Complete the contact, ID and payment steps shown here.','success');
  }catch(err){if(!committed){creatingBooking=false;button.disabled=false;$('booking-submit-status').textContent='Request not submitted. Please try again.';}else{$('booking-submit-status').textContent='Booking saved. Open My bookings to continue.';}throw err;}
}));
$('my-booking-details').addEventListener('change',safe(async e=>{if(e.target.name==='duration_unit'){const input=e.target.form.elements.duration;input.max=e.target.value==='days'?'365':e.target.value==='hours'?'8760':'525600';}if(e.target.id==='pay-method-preview'){const b=myBookings.find(x=>x.id===selected);const form=$('payment-form');if(form)form.elements.method.value=e.target.value;await paymentDetails(b,e.target.value)}}));
$('my-booking-details').addEventListener('submit',safe(async e=>{const form=e.target;const b=myBookings.find(x=>x.id===selected);if(!b)return;
if(form.id==='booking-contact-form'){await R.rpc('update_my_profile',{p_full_name:form.elements.full_name.value.trim(),p_phone:form.elements.phone.value.trim()});R.notify('Contact information saved.','success');await loadBookings(b.id);}
if(form.id==='ids-form') await uploadIds(form);
if(form.id==='payment-form'){const file=form.elements.proof.files[0];const proof=await R.preparePrivateImage(file,'proof');const driveId=await R.uploadToDrive(proof,'payment_proof',b.id,message=>{const submit=form.querySelector('button[type=submit]');if(submit)submit.textContent=message;});const path='gdrive/'+driveId;await R.rpc('submit_booking_payment',{p_booking:b.id,p_method:form.elements.method.value,p_amount:Math.round(Number(form.elements.amount.value)*100),p_transaction_reference:form.elements.reference.value.trim(),p_bank_wallet:form.elements.bank.value.trim(),p_proof_path:path});R.notify('Payment proof submitted. An administrator will verify it.','success');await loadBookings(b.id)}
if(form.id==='event-form'){await R.rpc('submit_event_details',{p_booking:b.id,p_name:form.elements.name.value.trim(),p_location:form.elements.location.value.trim(),p_start:form.elements.start.value,p_duration:R.durationMinutes(form.elements.duration.value,form.elements.duration_unit.value),p_notes:form.elements.notes.value.trim()});R.notify('Event request submitted for review.','success');await loadBookings(b.id)}
if(form.id==='message-form'){R.check(await db.from('booking_messages').insert({booking_id:b.id,sender_id:user.id,message:form.elements.message.value.trim(),is_internal:false}));R.notify('Message sent.','success');await displayBooking(b.id)}
}));
loginState().then(()=>{const u=new URL(window.location.href);if(u.searchParams.get('email_confirmed')==='1'){R.notify('Your email is confirmed! Please sign in with your email and password.','success');u.searchParams.delete('email_confirmed');window.history.replaceState(null,'',u.pathname+u.search+u.hash);document.querySelector('#login-form input[name=email]')?.focus();}}).catch(e=>R.notify(R.readable(e),'error'));
})();
