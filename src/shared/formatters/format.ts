// Veloria PoS — Shared formatters (French, DZD).

export { formatDzd } from "@domain/money/money.ts";

const frDate = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const frDateTime = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return frDate.format(d);
}

export function formatDateTimeFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return frDateTime.format(d);
}

export function formatQty(qty: number, unit: string): string {
  const n = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(qty);
  return `${n} ${unit}`;
}
