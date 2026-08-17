export const IST_OFFSET_MINUTES = 330;
export const LIBRARY_OPEN_MINUTES = 9 * 60;
export const LIBRARY_CLOSE_MINUTES = 18 * 60;

function istShift(date: Date) {
  return new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
}

export function istParts(date: Date) {
  const d = istShift(date);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
  };
}

export function istDateKey(date: Date) {
  const p = istParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function dayBoundsIST(date: Date) {
  const key = istDateKey(date);
  return {
    key,
    start: new Date(`${key}T00:00:00+05:30`),
    open: new Date(`${key}T09:00:00+05:30`),
    close: new Date(`${key}T18:00:00+05:30`),
    end: new Date(`${key}T23:59:59.999+05:30`),
  };
}

export function isWithinLibraryHours(date: Date) {
  const p = istParts(date);
  const mins = p.hour * 60 + p.minute;
  return mins >= LIBRARY_OPEN_MINUTES && mins < LIBRARY_CLOSE_MINUTES;
}

export function isDayClosed(scanDay: Date, now = new Date()) {
  const scan = dayBoundsIST(scanDay);
  const today = dayBoundsIST(now);
  if (scan.key < today.key) return true;
  return scan.key === today.key && now >= scan.close;
}

export function formatIST(date: Date | string | null | undefined, withSeconds = false) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit", minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: true,
  }).format(new Date(date));
}

export function formatDateIST(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(date));
}
