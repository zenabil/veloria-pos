// License Manager — client IPC renderer (jamais de clé/fs ici).
function bridge(): NonNullable<Window["veloriaManager"]> {
  if (!window.veloriaManager) throw new Error("Pont manager indisponible.");
  return window.veloriaManager;
}

export async function mcall<T>(
  fn: (api: NonNullable<Window["veloriaManager"]>) => Promise<ManagerOutcome>,
): Promise<T> {
  const res = await fn(bridge());
  if (!res.ok) throw new Error(res.message || "Erreur inattendue.");
  return res.data as T;
}

export const mapi = {
  appInfo: () => mcall((a) => a.appInfo()),
  keyStatus: () => mcall((a) => a.keyStatus()),
  keyImport: (p?: unknown) => mcall((a) => a.keyImport(p)),
  licensesList: (p?: unknown) => mcall((a) => a.licensesList(p)),
  licenseDetail: (p: unknown) => mcall((a) => a.licenseDetail(p)),
  licenseCreate: (p: unknown) => mcall((a) => a.licenseCreate(p)),
  licenseExport: (p: unknown) => mcall((a) => a.licenseExport(p)),
  licenseRenew: (p: unknown) => mcall((a) => a.licenseRenew(p)),
  licenseTransfer: (p: unknown) => mcall((a) => a.licenseTransfer(p)),
  licenseRevoke: (p: unknown) => mcall((a) => a.licenseRevoke(p)),
  licenseCapabilities: (p: unknown) => mcall((a) => a.licenseCapabilities(p)),
  licenseStanding: (p: unknown) => mcall((a) => a.licenseStanding(p)),
  backup: () => mcall((a) => a.backup()),
  backups: () => mcall((a) => a.backups()),
  restore: (p: unknown) => mcall((a) => a.restore(p)),
};
