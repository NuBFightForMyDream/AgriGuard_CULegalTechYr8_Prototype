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

/** "เมื่อสักครู่", "5 นาทีที่แล้ว", "3 ชม.ที่แล้ว", "2 วันที่แล้ว", then a date. */
export function fmtAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const sec = Math.max(0, (Date.now() - toDate(value).getTime()) / 1000);
  if (sec < 60) return "เมื่อสักครู่";
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ชม.ที่แล้ว`;
  if (sec < 7 * 86400) return `${Math.floor(sec / 86400)} วันที่แล้ว`;
  return fmtDate(value);
}

/** Clock time today, else a short date — for chat lists. */
export function fmtChatTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  const sameDay = d.toLocaleDateString("en-CA", { timeZone: TZ }) === todayISO();
  return sameDay
    ? d.toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH", { timeZone: TZ, day: "numeric", month: "short" });
}

/** Short money for tight tiles: ฿120,000 · ฿1.25 ล้าน */
export function fmtTHBShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `฿${(v / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ล้าน`;
  return `฿${v.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`;
}
