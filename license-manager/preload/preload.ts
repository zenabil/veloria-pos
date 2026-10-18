// Veloria License Manager — Preload : pont minimal (jamais de clé/fs au renderer).
import { contextBridge, ipcRenderer } from "electron";
import { MANAGER_CHANNELS } from "../ipc/channels";

type Channel = (typeof MANAGER_CHANNELS)[keyof typeof MANAGER_CHANNELS];

async function invoke<T>(channel: Channel, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  keyStatus: () => invoke(MANAGER_CHANNELS["manager.keyStatus"]),
  keyImport: (p?: unknown) => invoke(MANAGER_CHANNELS["manager.keyImport"], p),
  licensesList: (p?: unknown) => invoke(MANAGER_CHANNELS["manager.licensesList"], p),
  licenseDetail: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseDetail"], p),
  licenseCreate: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseCreate"], p),
  licenseExport: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseExport"], p),
  licenseRenew: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseRenew"], p),
  licenseTransfer: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseTransfer"], p),
  licenseRevoke: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseRevoke"], p),
  licenseCapabilities: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseCapabilities"], p),
  licenseStanding: (p: unknown) => invoke(MANAGER_CHANNELS["manager.licenseStanding"], p),
  backup: () => invoke(MANAGER_CHANNELS["manager.backup"]),
  backups: () => invoke(MANAGER_CHANNELS["manager.backups"]),
  restore: (p: unknown) => invoke(MANAGER_CHANNELS["manager.restore"], p),
};

contextBridge.exposeInMainWorld("veloriaManager", api);
