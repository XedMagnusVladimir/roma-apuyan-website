/* Compact, zero-dependency calendar. The backend remains authoritative about availability. */
window.RomaCalendar=(()=>{
'use strict';
const keyOf=(year,month,day)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
function mount(id,{fetchMonth,onPick,mode='customer'}) {
const target=document.getElementById(id);if(!target)return null;
const now=new Date();let current=new Date(now.getFullYear(),now.getMonth(),1),selected='';
const escape=window.Roma?.esc || (s=>String(s));
async function render(){
const year=current.getFullYear(),month=current.getMonth(),lastDay=new Date(year,month+1,0).getDate();
const start=keyOf(year,month,1),end=keyOf(year,month,lastDay);
let data={busy:[],events:[]};try{data=await fetchMonth(start,end);}catch(e){target.textContent='Availability could not be loaded: '+String(e.message||e);return;}
const busy=new Set(data.busy||[]),events=new Set(data.events||[]);
const first=new Date(year,month,1).getDay();
let cells=Array.from({length:first},()=>'<span></span>');
for(let day=1;day<=lastDay;day++){
const iso=keyOf(year,month,day),inPast=iso<keyOf(now.getFullYear(),now.getMonth(),now.getDate()),isBusy=busy.has(iso),event=events.has(iso);
const buttonText=mode==='admin'?(event?'Event':isBusy?'Blocked':''):(isBusy?'Taken':'');
const cls=`roma-day${isBusy?' busy':''}${event?' event':''}${selected===iso?' selected':''}`;
cells.push(`<button class="${cls}" data-cal-date="${iso}" ${inPast||isBusy&&mode==='customer'?'disabled':''} title="${isBusy?'Unavailable':'Available'}: ${iso}">${day}<small>${buttonText}</small></button>`)
}
target.innerHTML=`<div class="roma-calendar"><div class="roma-month-head"><button type="button" class="roma-btn secondary tiny" data-cal-move="-1">← Previous</button><strong>${escape(current.toLocaleString('en-PH',{month:'long',year:'numeric'}))}</strong><button type="button" class="roma-btn secondary tiny" data-cal-move="1">Next →</button></div><div class="roma-week">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="roma-days">${cells.join('')}</div><p>${mode==='admin'?'Green: confirmed event · Red: unavailable':'Select an available date to fill the booking form. Red dates are unavailable.'}</p></div>`;
}
target.addEventListener('click',e=>{const mv=e.target.closest('[data-cal-move]');if(mv){current=new Date(current.getFullYear(),current.getMonth()+Number(mv.dataset.calMove),1);render();return;}const pick=e.target.closest('[data-cal-date]');if(pick){selected=pick.dataset.calDate;if(onPick)onPick(selected);render();}});
render();return {refresh:render};
}
return {mount};
})();
