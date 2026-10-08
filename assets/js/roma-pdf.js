/* Downloadable booking slip / rejection notice generated from authenticated database record. */
window.RomaPDF = (() => {
'use strict';
function build(booking,profile){
  if(!window.jspdf?.jsPDF) throw new Error('PDF library is not available. Check your internet connection.');
  if(!['approved','completed','rejected'].includes(booking.status)) throw new Error('Documents are available after an approval or rejection decision.');
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  const W=210,left=20,right=190;let y=22;
  const line=(label,value)=>{pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.text(label,left,y);pdf.setFont('helvetica','normal');const pieces=pdf.splitTextToSize(String(value??'—'),108);pdf.text(pieces,82,y);y+=Math.max(7,pieces.length*5+2);if(y>262){pdf.addPage();y=22;}};
  const cents=v=>'PHP '+(Number(v||0)/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  pdf.setFillColor(31,18,31);pdf.rect(0,0,W,48,'F');pdf.setTextColor(238,185,205);pdf.setFont('times','bold');pdf.setFontSize(32);pdf.text('RA',left,26);pdf.setFontSize(15);pdf.text('CREATIONS BY ROMA APUYAN',47,22);pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.text('PHOTOGRAPHY & VIDEOGRAPHY',47,30);
  pdf.setTextColor(38,29,37);y=64;pdf.setFont('times','bold');pdf.setFontSize(21);pdf.text(booking.status==='rejected'?'BOOKING REJECTION NOTICE':'OFFICIAL BOOKING SLIP',left,y);y+=11;
  pdf.setDrawColor(210,169,189);pdf.line(left,y-3,right,y-3);pdf.setFontSize(11);
  line('Booking reference',booking.reference_number);line('Current status',booking.status==='rejected'?'REJECTED':booking.status==='completed'?'COMPLETED':'APPROVED');line('Payment status',booking.approval_payment_label?.replaceAll('_',' ').toUpperCase()||'NOT YET APPROVED');line('Customer',profile?.full_name||'');line('Email',profile?.email||'');line('Phone',profile?.phone||'');line('Service',booking.service_name_snapshot);line('Event',booking.event_name||'');line('Location',booking.event_location||'');line('Date',booking.event_date||'');line('Time',booking.event_start_time||'');line('Duration',booking.event_duration_minutes?`${booking.event_duration_minutes} minutes`:'');line('Payment arrangement',booking.option_code==='full_discount'?'PAY IN FULL - 10% DISCOUNT':booking.option_code==='deposit_25'?'25% DOWN PAYMENT':'AFTER SERVICE +10%');
  line('Original package price',cents(booking.original_price_centavos));line('Total contract amount',cents(booking.total_centavos));line('Verified amount paid',cents(booking.paid_centavos));line('Outstanding balance',cents(booking.total_centavos-booking.paid_centavos));
  if(booking.approved_at)line('Approved at',new Date(booking.approved_at).toLocaleString('en-PH'));
  if(booking.completed_at)line('Completed at',new Date(booking.completed_at).toLocaleString('en-PH'));
  if(booking.rejection_reason)line('Rejection reason',booking.rejection_reason);
  if(Array.isArray(booking.inclusions_snapshot)&&booking.inclusions_snapshot.length){y+=4;pdf.setFont('times','bold');pdf.setFontSize(15);pdf.text('PACKAGE INCLUSIONS',left,y);y+=8;for(const value of booking.inclusions_snapshot){pdf.setFontSize(10);pdf.setFont('helvetica','normal');const pieces=pdf.splitTextToSize('- '+String(value),165);pdf.text(pieces,left,y);y+=Math.max(7,pieces.length*5+2);if(y>262){pdf.addPage();y=22;}}}
  const pages=pdf.getNumberOfPages();for(let page=1;page<=pages;page++){pdf.setPage(page);pdf.setFontSize(8);pdf.setTextColor(110,98,108);pdf.text('Verify the current status and payment balance in your authenticated booking dashboard.',left,284);pdf.text(String(page)+' / '+String(pages),right,284,{align:'right'});}
  pdf.save(booking.reference_number+(booking.status==='rejected'?'-rejection-notice':'-booking-slip')+'.pdf');
}
return {build};
})();
