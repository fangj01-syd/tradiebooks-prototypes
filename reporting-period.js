function currentQuarter() {
  const now = new Date();
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3);
  const startMonth = quarter * 3 + 1;
  const endYear = quarter === 3 ? year + 1 : year;
  const endMonth = quarter === 3 ? 1 : startMonth + 3;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return {
    start,
    end,
    includes(date) { return typeof date === 'string' && date >= start && date < end; }
  };
}
