// Veloria PoS — Shared: dates (UTC ISO consistently).

export function nowIsoUtc(date: Date = new Date()): string {
  return date.toISOString();
}

export function todayBusinessDate(date: Date = new Date()): string {
  // YYYY-MM-DD local business date
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidBusinessDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
