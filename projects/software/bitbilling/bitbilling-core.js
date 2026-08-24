(() => {
  "use strict";
  function totals(invoices){const billed=invoices.reduce((s,i)=>s+i.amountSats,0),paid=invoices.reduce((s,i)=>s+i.payments.reduce((a,p)=>a+p.amountSats,0),0);return{billed,paid,outstanding:Math.max(0,billed-paid)};}
  function status(i){const paid=i.payments.reduce((s,p)=>s+p.amountSats,0);if(paid>=i.amountSats)return"paid";if(paid>0)return"partial";if(i.dueDate&&new Date(i.dueDate+"T23:59:59")<new Date())return"overdue";return"open";}
  function invoiceText(i){return`BITBILLING INVOICE\n\nInvoice: ${i.id}\nClient: ${i.client}\nDescription: ${i.description}\nType: ${i.type}\nAmount: ${i.amountSats.toLocaleString()} sats\nDue: ${i.dueDate||"unspecified"}\nBitcoin payment reference: ${i.address||"not assigned"}\nStatus: ${status(i)}\n`;}
  window.BitBillingCore=Object.freeze({totals,status,invoiceText});
})();
