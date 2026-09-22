// Veloria License Manager — Canaux IPC internes (outil vendor, pas de run-sql).
export const MANAGER_CHANNELS = {
  "manager.appInfo": "manager.appInfo",
  "manager.licensesList": "manager.licensesList",
  "manager.licenseDetail": "manager.licenseDetail",
  "manager.licenseCreate": "manager.licenseCreate",
  "manager.licenseExport": "manager.licenseExport",
  "manager.licenseRenew": "manager.licenseRenew",
  "manager.licenseTransfer": "manager.licenseTransfer",
  "manager.licenseRevoke": "manager.licenseRevoke",
  "manager.licenseCapabilities": "manager.licenseCapabilities",
  "manager.licenseStanding": "manager.licenseStanding",
  "manager.keyStatus": "manager.keyStatus",
  "manager.backup": "manager.backup",
} as const;
