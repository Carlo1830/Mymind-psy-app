const dateFormatter = (zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(date: Date, zone: string) {
  const parts = dateFormatter(zone).formatToParts(date);
  const get = (name: string) => parts.find(p => p.type === name)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
// Finds the first instant of a local date, including dates whose midnight is skipped by DST.
export function dayStart(key: string, zone: string) {
  const formatter = dateFormatter(zone);
  const format = (value: number) => {
    const parts = formatter.formatToParts(new Date(value));
    return ['year', 'month', 'day'].map(k => parts.find(p => p.type === k)!.value).join('-');
  };
  const utc = Date.parse(key + 'T00:00:00Z');
  let lo = utc - 36 * 3600000, hi = utc + 36 * 3600000;
  while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (format(mid) < key) lo = mid + 1; else hi = mid; }
  return new Date(lo).toISOString();
}
export function dashboardPeriods(now: Date, zone: string) {
  const key = dayKey(now, zone);
  const date = new Date(key + 'T12:00:00Z');
  const monday = new Date(date); monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const nextMonday = new Date(monday); nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12));
  return { weekStart: dayStart(monday.toISOString().slice(0, 10), zone), weekEnd: dayStart(nextMonday.toISOString().slice(0, 10), zone), monthStart: dayStart(key.slice(0, 7) + '-01', zone), monthEnd: dayStart(nextMonth.toISOString().slice(0, 10), zone) };
}

