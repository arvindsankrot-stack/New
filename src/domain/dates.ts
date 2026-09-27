// Calendar-day helpers. Days are local (device timezone — IST for this user)
// YYYY-MM-DD strings; arithmetic is done in UTC on those strings so DST or
// timezone offsets can never shift a day.

const DAY = 86_400_000;

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(utc(iso) + n * DAY);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(utc(iso)).getUTCDay();
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(iso: string): string {
  return WEEKDAYS[weekday(iso)];
}

/** Monday that starts the ISO week containing `iso`. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Date(utc(iso)).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

export function fmtTime(isoTs: string): string {
  return new Date(isoTs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function isoDateOf(ts: string): string {
  return toISO(new Date(ts));
}
