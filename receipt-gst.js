function hasRecordedReceiptGst(receipt) {
  return typeof receipt.gst === 'number' && Number.isFinite(receipt.gst) && receipt.gst >= 0;
}

function receiptGstSummary(receipts) {
  return receipts.reduce((summary, receipt) => {
    if (hasRecordedReceiptGst(receipt)) summary.total += receipt.gst;
    else summary.pending++;
    return summary;
  }, { total: 0, pending: 0 });
}
