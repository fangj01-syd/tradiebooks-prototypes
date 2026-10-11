function nextInvoiceNumber(invoices) {
  const highestExisting = invoices.reduce((highest, invoice) => {
    const match = /^INV-(\d+)$/.exec(invoice.number || '');
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1000);
  const lastIssued = Number(localStorage.getItem('lastInvoiceNumber')) || 1000;
  const next = Math.max(highestExisting, lastIssued) + 1;
  localStorage.setItem('lastInvoiceNumber', String(next));
  return 'INV-' + String(next).padStart(4, '0');
}
