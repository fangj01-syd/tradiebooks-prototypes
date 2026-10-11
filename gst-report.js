function gstBasis() {
  return localStorage.getItem('gstBasis') === 'cash' ? 'cash' : 'noncash';
}

function receiptReviewText(count) {
  return `${count} receipt${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} GST review`;
}

function paymentReviewText(count) {
  return `${count} paid invoice${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} a payment date`;
}

function gstEstimate(invoices, receipts, period, basis = gstBasis()) {
  const sales = invoices.filter(invoice => {
    const date = basis === 'cash'
      ? (invoice.paid ? invoice.paidDate : null)
      : (invoice.paid && validDate(invoice.paidDate) && invoice.paidDate < invoice.date ? invoice.paidDate : invoice.date);
    return period.includes(date);
  });
  const purchases = receipts.filter(receipt => period.includes(receipt.date));
  const purchaseGst = receiptGstSummary(purchases);
  const totalSales = sales.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const salesGst = sales.reduce((sum, invoice) => sum + (Number(invoice.gst) || 0), 0);
  const missingPaymentDates = basis === 'cash'
    ? invoices.filter(invoice => invoice.paid && !validDate(invoice.paidDate)).length
    : 0;
  return {
    totalSales,
    salesGst,
    purchaseGst: purchaseGst.total,
    pendingReceipts: purchaseGst.pending,
    missingPaymentDates,
    net: salesGst - purchaseGst.total
  };
}
