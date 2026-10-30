/// <reference types="vite/client" />

interface ManagerOutcome<T = unknown> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
}

interface Window {
  veloriaManager?: {
    appInfo(): Promise<ManagerOutcome>;
    keyStatus(): Promise<ManagerOutcome>;
    keyImport(p?: unknown): Promise<ManagerOutcome>;
    licensesList(p?: unknown): Promise<ManagerOutcome>;
    licenseDetail(p: unknown): Promise<ManagerOutcome>;
    licenseCreate(p: unknown): Promise<ManagerOutcome>;
    licenseExport(p: unknown): Promise<ManagerOutcome>;
    licenseRenew(p: unknown): Promise<ManagerOutcome>;
    licenseTransfer(p: unknown): Promise<ManagerOutcome>;
    licenseRevoke(p: unknown): Promise<ManagerOutcome>;
    licenseCapabilities(p: unknown): Promise<ManagerOutcome>;
    licenseStanding(p: unknown): Promise<ManagerOutcome>;
    backup(): Promise<ManagerOutcome>;
    backups(): Promise<ManagerOutcome>;
    restore(p: unknown): Promise<ManagerOutcome>;
  };
}
