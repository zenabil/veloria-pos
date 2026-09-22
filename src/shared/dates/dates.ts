// Veloria PoS — Shared: dates (UTC ISO consistently).
// Les horodatages SQLite sont en UTC ; les requêtes comparent
// `substr(created_at,1,10)` (UTC), donc les défauts de formulaires utilisent
// la date UTC pour rester cohérents (pas la date locale).

export function todayUtcDate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
