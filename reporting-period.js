function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00');
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

function quarterFromValue(value) {
  const match = /^(\d{4})-Q([1-4])$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const end = quarter === 4 ? `${year + 1}-01-01` : `${year}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
  return { value, start, end, label: `Q${quarter} ${year}`, includes(date) { return validDate(date) && date >= start && date < end; } };
}

function quarterValue(date) {
  if (!validDate(date)) return null;
  return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
}

function currentQuarter() {
  return quarterFromValue(quarterValue(localDate()));
}

function availableQuarters(invoices, receipts) {
  const values = new Set();
  const current = currentQuarter();
  const start = new Date(current.start + 'T12:00:00');
  for (let offset = 0; offset < 8; offset++) {
    values.add(quarterValue(localDate(new Date(start.getFullYear(), start.getMonth() - offset * 3, 1))));
  }
  invoices.forEach(invoice => [invoice.date, invoice.paidDate].forEach(date => {
    const value = quarterValue(date);
    if (value) values.add(value);
  }));
  receipts.forEach(receipt => {
    const value = quarterValue(receipt.date);
    if (value) values.add(value);
  });
  return [...values].sort().reverse().map(quarterFromValue);
}
