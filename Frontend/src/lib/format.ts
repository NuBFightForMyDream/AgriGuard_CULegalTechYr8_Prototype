const TZ = "Asia/Bangkok";

/** API datetimes from SQLite have no offset; they are UTC. */
function toDate(value: string): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(isDateOnly || hasZone ? value : `${value}Z`);
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("th-TH", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtKg(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${fmtNum(n)} กก.`;
}

export function fmtTHB(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(n));
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return toDate(value).toLocaleDateString("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return toDate(value).toLocaleString("th-TH", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtRange(a: string, b: string): string {
  return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
}

/** Today's date (YYYY-MM-DD) in Asia/Bangkok, for date input defaults. */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}
