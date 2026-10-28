// Veloria PoS — Domain: libellés des statuts de bon de commande fournisseur
// (framework-free). Le cycle draft → ordered → partially_received → received
// est EXÉCUTÉ côté main : `PO_TRANSITIONS` + refus dans
// `electron/ipc/handlers/purchases.repo.ts` (ADR-153 lot C : la copie domaine
// non branchée et son cumul de totaux ont été retirés).

export function poStatusLabelFr(s: string): string {
  if (s === "draft") return "Brouillon";
  if (s === "ordered") return "Commandée";
  if (s === "partially_received") return "Partiellement reçue";
  if (s === "received") return "Reçue";
  if (s === "cancelled") return "Annulée";
  return "—";
}
