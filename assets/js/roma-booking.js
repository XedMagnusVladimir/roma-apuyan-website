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
async function paymentDetails(b,methodId){const details=await R.rpc('get_booking_payment_details',{p_booking:b.id,p_method:methodId});const d=details?.[0];let methodIcon='';if(d){const {data:iconRow}=await db.from('payment_methods').select('icon_drive_file_id').eq('id',methodId).maybeSingle();if(iconRow?.icon_drive_file_id)methodIcon=`<img src="${R.image(iconRow.icon_drive_file_id)}" alt="Payment method icon" class="roma-customer-method-icon">`;}$('payment-account').innerHTML=d?`<div class="roma-note">${methodIcon}<strong>${R.esc(d.method_name)}</strong><br>${R.esc(d.provider)}<br>${R.esc(d.account_holder)}<br>${R.esc(d.account_details)}<br>${R.esc(d.instructions)}${d.qr_drive_file_id?`<img src="${R.image(d.qr_drive_file_id)}" class="roma-banner" alt="Payment QR">`:''}</div>`:'<p>Select an available method.</p>';}
async function displayBooking(id){selected=id;const b=myBookings.find(b=>b.id===id);if(!b)return;const docs=R.check(await db.from('customer_identity_documents').select('document_slot').eq('booking_id',id));const pays=R.check(await db.from('booking_payments').select('*').eq('booking_id',id).order('created_at',{ascending:false}));const messages=R.check(await db.from('booking_messages').select('*').eq('booking_id',id).eq('is_internal',false).order('created_at'));
const docsDone=docs.length===2, canEvent=['payment_verified','pending_approval'].includes(b.status)&&(!b.event_name),canPay=['awaiting_payment','payment_under_review','payment_verified','approved'].includes(b.status)&&b.option_code!=='after_service_plus_10';const showId=!docsDone&&!['rejected','cancelled','completed'].includes(b.status);
let html=`<h3>${R.esc(b.reference_number)}</h3><p><strong>${R.esc(b.service_name_snapshot)}</strong><br>${R.datePH(b.event_date)}<br>${R.esc(optLabel(b.option_code))}<br><span class="roma-pill">${R.esc(b.status.replaceAll('_',' '))}</span></p><p>Contract: <strong>${R.money(b.total_centavos)}</strong><br>Verified paid: ${R.money(b.paid_centavos)}<br>Balance: <strong>${R.money(b.total_centavos-b.paid_centavos)}</strong></p>${b.rejection_reason?`<div class="roma-note">Reason: ${R.esc(b.rejection_reason)}</div>`:''}`;
if(showId) html+=`<hr class="roma-divider"><h3>Upload 2 government IDs</h3><p class="roma-muted">Each file can be a JPG, PNG, WebP, or PDF up to 10 MB.</p><form id="ids-form">${[1,2].map(n=>`<label class="roma-field">Government ID ${n} ${docs.some(d=>d.document_slot===n)?'— received':`<input name="id_${n}" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>`}</label>`).join('')}<button class="roma-btn" type="submit">Upload IDs</button></form>`;
if(docsDone)html+='<div class="roma-note">Two government IDs received securely.</div>';
if(canPay && docsDone && b.paid_centavos < b.initial_due_centavos){const pm=await getMethods(b);html+=`<hr class="roma-divider"><h3>Submit payment proof</h3><p>Required upfront: ${R.money(b.initial_due_centavos)} · Already verified: ${R.money(b.paid_centavos)}</p>${pm.length?`<form id="payment-form"><label class="roma-field">Payment method<select id="pay-method" name="method" required>${pm.map(m=>`<option value="${m.method_id}">${R.esc(m.method_name)} — ${R.esc(m.provider)}</option>`).join('')}</select></label><div id="payment-account"></div><label class="roma-field">Amount actually paid (PHP)<input name="amount" type="number" min="0.01" step="0.01" value="${((b.initial_due_centavos-b.paid_centavos)/100).toFixed(2)}" required></label><label class="roma-field">Bank / e-wallet used<input name="bank" maxlength="150" required></label><label class="roma-field">Transaction reference<input name="reference" maxlength="180" required></label><label class="roma-field">Payment screenshot <input name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="roma-btn" type="submit">Submit for verification</button></form>`:'<div class="roma-note">This package has no active payment method assigned. Contact the studio.</div>'}`;
if(pm.length)setTimeout(()=>paymentDetails(b,pm[0].method_id).catch(e=>R.notify(R.readable(e),'error')),0);
}
if(b.status==='payment_under_review')html+='<div class="roma-note">Your submitted payment is awaiting manual verification.</div>';
if(canEvent&&docsDone)html+=`<hr class="roma-divider"><h3>Complete event details</h3><form id="event-form"><label class="roma-field">Event name<input name="name" maxlength="180" required></label><label class="roma-field">Event location<input name="location" maxlength="250" required></label><div class="roma-2cols"><label class="roma-field">Start time<input name="start" type="time" required></label><label class="roma-field">Duration<input name="duration" type="number" min="1" max="8760" value="${b.event_duration_minutes?Math.max(1,Math.round(b.event_duration_minutes/60)):2}" required><select name="duration_unit"><option value="hours">Hours</option><option value="minutes">Minutes</option><option value="days">Days</option></select></label></div><label class="roma-field">Notes<textarea name="notes" maxlength="2000"></textarea></label><button class="roma-btn" type="submit">Submit event for approval</button></form>`;
if(b.event_name)html+=`<hr class="roma-divider"><h3>Event information</h3><p>${R.esc(b.event_name)}<br>${R.esc(b.event_location)}<br>${R.esc(b.event_start_time||'')} · ${R.readableDuration(b.event_duration_minutes||0)}</p>`;
if(['approved','completed','rejected'].includes(b.status))html+=`<button class="roma-btn secondary" data-download-pdf="${b.id}">Download ${b.status==='rejected'?'rejection notice':'booking slip'} (PDF)</button>`;
if(pays.length)html+=`<hr class="roma-divider"><h3>Payment history</h3>${pays.map(p=>`<p class="roma-mini">${R.money(p.amount_centavos)} — ${R.esc(p.status)} · ${R.esc(p.transaction_reference)}</p>`).join('')}`;
html+=`<hr class="roma-divider"><h3>Messages</h3><div>${messages.length?messages.map(m=>`<div class="roma-note">${R.esc(m.message)}<br><span class="roma-muted">${new Date(m.created_at).toLocaleString()}</span></div>`).join(''):'<p class="roma-muted">No messages yet.</p>'}</div><form id="message-form"><label class="roma-field">Send a message to the studio<textarea name="message" required maxlength="5000"></textarea></label><button class="roma-btn" type="submit">Send message</button></form>`;
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
    showTab('profile');const prof=$('profile-form');if(prof.elements.full_name.value.trim()&&prof.elements.phone.value.trim())showTab('mine');
    R.notify('Booking request submitted. Complete the required steps in My bookings.','success');
  }catch(err){if(!committed){creatingBooking=false;button.disabled=false;$('booking-submit-status').textContent='Request not submitted. Please try again.';}else{$('booking-submit-status').textContent='Booking saved. Open My bookings to continue.';}throw err;}
}));
$('my-booking-details').addEventListener('change',safe(async e=>{if(e.target.name==='duration_unit'){const input=e.target.form.elements.duration;input.max=e.target.value==='days'?'365':e.target.value==='hours'?'8760':'525600';}if(e.target.id==='pay-method'){const b=myBookings.find(x=>x.id===selected);await paymentDetails(b,e.target.value)}}));
$('my-booking-details').addEventListener('submit',safe(async e=>{const form=e.target;const b=myBookings.find(x=>x.id===selected);if(!b)return;
if(form.id==='ids-form') await uploadIds(form);
if(form.id==='payment-form'){const file=form.elements.proof.files[0];const proof=await R.preparePrivateImage(file,'proof');const driveId=await R.uploadToDrive(proof,'payment_proof',b.id,message=>{const submit=form.querySelector('button[type=submit]');if(submit)submit.textContent=message;});const path='gdrive/'+driveId;await R.rpc('submit_booking_payment',{p_booking:b.id,p_method:form.elements.method.value,p_amount:Math.round(Number(form.elements.amount.value)*100),p_transaction_reference:form.elements.reference.value.trim(),p_bank_wallet:form.elements.bank.value.trim(),p_proof_path:path});R.notify('Payment proof submitted. An administrator will verify it.','success');await loadBookings(b.id)}
if(form.id==='event-form'){await R.rpc('submit_event_details',{p_booking:b.id,p_name:form.elements.name.value.trim(),p_location:form.elements.location.value.trim(),p_start:form.elements.start.value,p_duration:R.durationMinutes(form.elements.duration.value,form.elements.duration_unit.value),p_notes:form.elements.notes.value.trim()});R.notify('Event request submitted for review.','success');await loadBookings(b.id)}
if(form.id==='message-form'){R.check(await db.from('booking_messages').insert({booking_id:b.id,sender_id:user.id,message:form.elements.message.value.trim(),is_internal:false}));R.notify('Message sent.','success');await displayBooking(b.id)}
}));
loginState().then(()=>{const u=new URL(window.location.href);if(u.searchParams.get('email_confirmed')==='1'){R.notify('Your email is confirmed! Please sign in with your email and password.','success');u.searchParams.delete('email_confirmed');window.history.replaceState(null,'',u.pathname+u.search+u.hash);document.querySelector('#login-form input[name=email]')?.focus();}}).catch(e=>R.notify(R.readable(e),'error'));
})();
