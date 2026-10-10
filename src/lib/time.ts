export const OFFICE_TZ = process.env.OFFICE_TIMEZONE?.trim() || "Asia/Kolkata";

function asDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  // PostgreSQL timestamp values should include an offset. Treat a legacy
  // offset-free value as UTC rather than letting the host machine decide.
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? new Date(value)
    : new Date(`${value.replace(" ", "T")}Z`);
}

/** YYYY-MM-DD in the office timezone, for `service_date`. */
export function serviceDateOf(d: Date = new Date(), tz = OFFICE_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function formatDateTime(d: Date | string, tz = OFFICE_TZ): string {
  const date = asDate(d);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz, dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

export function formatTime(d: Date | string, tz = OFFICE_TZ): string {
  const date = asDate(d);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(date);
}
