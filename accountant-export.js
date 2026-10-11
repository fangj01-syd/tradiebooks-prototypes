// A small, dependency-free ZIP writer. Entries are stored without compression so
// the accountant pack works offline and can be opened by standard ZIP tools.
function zipBytes(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const directory = [];
  let offset = 0;
  const write16 = (view, at, value) => view.setUint16(at, value, true);
  const write32 = (view, at, value) => view.setUint32(at, value >>> 0, true);
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  files.forEach(file => {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034B50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800); // UTF-8 filenames
    write32(localView, 14, crc);
    write32(localView, 18, content.length);
    write32(localView, 22, content.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    chunks.push(local, content);
    directory.push({ name, content, crc, offset });
    offset += local.length + content.length;
  });
  const directoryStart = offset;
  directory.forEach(entry => {
    const central = new Uint8Array(46 + entry.name.length);
    const view = new DataView(central.buffer);
    write32(view, 0, 0x02014B50);
    write16(view, 4, 20);
    write16(view, 6, 20);
    write16(view, 8, 0x0800);
    write32(view, 16, entry.crc);
    write32(view, 20, entry.content.length);
    write32(view, 24, entry.content.length);
    write16(view, 28, entry.name.length);
    write32(view, 42, entry.offset);
    central.set(entry.name, 46);
    chunks.push(central);
    offset += central.length;
  });
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054B50);
  write16(endView, 8, directory.length);
  write16(endView, 10, directory.length);
  write32(endView, 12, offset - directoryStart);
  write32(endView, 16, directoryStart);
  chunks.push(end);
  return new Blob(chunks, { type: 'application/zip' });
}

function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value ?? '');
  // Spreadsheet apps can execute formula-looking text supplied by a customer.
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvFile(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function accountantPack(invoices, receipts, basis, focusQuarterValue = currentQuarter().value, exportedAt = new Date()) {
  const amount = value => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
  };
  const invoiceRows = invoices.map(invoice => [
    invoice.id, invoice.number, invoice.date, invoice.dueDate, invoice.customer,
    invoice.paid ? 'Paid' : 'Unpaid', invoice.paidDate,
    amount(invoice.subtotal ?? (Number(invoice.total || 0) - Number(invoice.gst || 0))),
    amount(invoice.gst), amount(invoice.total), invoice.terms, invoice.abn, invoice.notes
  ]);
  const itemRows = invoices.flatMap(invoice => {
    const lines = Array.isArray(invoice.lines) && invoice.lines.length
      ? invoice.lines : [{ desc: invoice.desc || '', qty: 1, price: invoice.amount ?? invoice.subtotal ?? 0 }];
    return lines.map((line, index) => [invoice.number, invoice.id, index + 1, line.desc,
      Number(line.qty) || 0, amount(line.price), amount(line.amount ?? (Number(line.qty) || 0) * (Number(line.price) || 0))]);
  });
  const paymentRows = invoices.filter(invoice => invoice.paid).map(invoice => [
    invoice.number, invoice.id, invoice.paidDate, amount(invoice.total),
    validDate(invoice.paidDate) ? 'Recorded' : 'Payment date needed'
  ]);
  const receiptRows = receipts.map(receipt => [
    receipt.id, receipt.date, receipt.merchant, receipt.category, amount(receipt.amount),
    hasRecordedReceiptGst(receipt) ? amount(receipt.gst) : '',
    hasRecordedReceiptGst(receipt) ? 'Recorded' : 'GST to review'
  ]);
  const quarters = availableQuarters(invoices, receipts);
  const quarterRows = quarters.map(quarter => {
    const report = gstEstimate(invoices, receipts, quarter, basis);
    return [quarter.label, quarter.start, quarter.end, basis, amount(report.totalSales),
      amount(report.salesGst), amount(report.purchaseGst), amount(report.net),
      report.pendingReceipts, report.missingPaymentDates];
  });
  const issueRows = [
    ...receipts.filter(receipt => !hasRecordedReceiptGst(receipt)).map(receipt =>
      ['Receipt', receipt.id, receipt.merchant, receipt.date, 'GST amount needs review']),
    ...invoices.filter(invoice => invoice.paid && !validDate(invoice.paidDate)).map(invoice =>
      ['Invoice', invoice.id, invoice.number, invoice.date, 'Paid invoice needs payment date'])
  ];
  const focusQuarter = quarterFromValue(focusQuarterValue) || currentQuarter();
  const focusReport = gstEstimate(invoices, receipts, focusQuarter, basis);
  const summary = [
    'TradieBooks accountant handover',
    `Exported: ${exportedAt.toISOString()}`,
    'Coverage: all invoices and receipts recorded in this browser',
    `GST accounting basis selected: ${basis === 'cash' ? 'Cash' : 'Non-cash'}`,
    `Invoices: ${invoices.length}`,
    `Receipts: ${receipts.length}`,
    `Items needing review: ${issueRows.length}`,
    '',
    `Selected quarter: ${focusQuarter.label}`,
    `G1 total sales estimate: $${focusReport.totalSales.toFixed(2)}`,
    `1A GST on sales estimate: $${focusReport.salesGst.toFixed(2)}`,
    `1B GST on purchases estimate: $${focusReport.purchaseGst.toFixed(2)}`,
    `Net GST estimate (1A - 1B): $${focusReport.net.toFixed(2)}`,
    '',
    'FILES',
    'invoices.csv: one row per invoice',
    'invoice-items.csv: invoice line items',
    'payments.csv: recorded full payments; blank dates need review',
    'receipts.csv: expenses and recorded GST; blank GST needs review',
    'quarterly-gst.csv: selected-basis estimates for each listed quarter',
    'review-needed.csv: records to check before using the estimates',
    'tradiebooks-data.json: complete data backup for reference',
    '',
    'IMPORTANT',
    'These figures are estimates, not a lodged BAS or a GST credit eligibility decision.',
    'Cash basis supports full invoice payments only; partial payments are not recorded.',
    'Receipt dates are used for purchases under both bases. No receipt images are stored in TradieBooks.',
    'Please reconcile these records against bank transactions and supporting tax invoices.'
  ].join('\r\n') + '\r\n';
  const backup = {
    invoices, receipts, gstBasis: basis,
    lastInvoiceNumber: Number(localStorage.getItem('lastInvoiceNumber')) || 1000,
    exported: exportedAt.toISOString()
  };
  return zipBytes([
    { name: 'SUMMARY.txt', content: summary },
    { name: 'invoices.csv', content: csvFile(['ID', 'Invoice number', 'Invoice date', 'Due date', 'Customer', 'Status', 'Payment date', 'Subtotal AUD', 'GST AUD', 'Total AUD', 'Terms', 'ABN', 'Notes'], invoiceRows) },
    { name: 'invoice-items.csv', content: csvFile(['Invoice number', 'Invoice ID', 'Line', 'Description', 'Quantity', 'Unit price AUD', 'Amount AUD'], itemRows) },
    { name: 'payments.csv', content: csvFile(['Invoice number', 'Invoice ID', 'Payment date', 'Full payment AUD', 'Status'], paymentRows) },
    { name: 'receipts.csv', content: csvFile(['ID', 'Receipt date', 'Merchant', 'Category', 'Total paid AUD', 'GST recorded AUD', 'GST status'], receiptRows) },
    { name: 'quarterly-gst.csv', content: csvFile(['Quarter', 'Start inclusive', 'End exclusive', 'GST basis', 'G1 sales AUD', '1A sales GST AUD', '1B purchase GST AUD', 'Net GST AUD', 'Receipts needing GST review in quarter', 'Paid invoices needing payment date (all records)'], quarterRows) },
    { name: 'review-needed.csv', content: csvFile(['Type', 'ID', 'Reference', 'Date', 'Issue'], issueRows) },
    { name: 'tradiebooks-data.json', content: JSON.stringify(backup, null, 2) + '\n' }
  ]);
}

function downloadAccountantPack(focusQuarterValue = currentQuarter().value) {
  try {
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    const receipts = JSON.parse(localStorage.getItem('receipts') || '[]');
    if (!Array.isArray(invoices) || !Array.isArray(receipts)) throw new Error('Invalid saved data');
    const focusQuarter = quarterFromValue(focusQuarterValue) || currentQuarter();
    const blob = accountantPack(invoices, receipts, gstBasis(), focusQuarter.value);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tradiebooks-accountant-${focusQuarter.value}-${localDate()}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    alert('Could not create the accountant export. Check the saved data or restore a backup.');
    console.error(error);
  }
}
