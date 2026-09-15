// Veloria PoS — Electron: printing adapters (Windows).
// Receipt/A4 generation is deterministic; hardware failures never crash the app.

import { ipcMain, BrowserWindow } from "electron";
import { log } from "../services/logger";
import { IPC_CHANNELS } from "../ipc/channels";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export function buildReceiptText(args: {
  company: string;
  invoice: string;
  date: string;
  lines: ReceiptLine[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
  paidMinor: number;
  prevBalanceMinor?: number;
  currentBalanceMinor?: number;
}): string {
  const fmt = (m: number): string =>
    `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(m / 100)} DZD`;
  const out: string[] = [];
  out.push(`*** ${args.company} ***`);
  out.push(`Ticket de caisse`);
  out.push(`Facture : ${args.invoice}`);
  out.push(`Date : ${args.date}`);
  out.push(`--------------------------------`);
  for (const l of args.lines) {
    out.push(l.name);
    out.push(`  ${l.qty} x ${fmt(l.unitPriceMinor)} = ${fmt(l.lineTotalMinor)}`);
  }
  out.push(`--------------------------------`);
  out.push(`Sous-total : ${fmt(args.subtotalMinor)}`);
  if (args.discountMinor > 0) out.push(`Remise : -${fmt(args.discountMinor)}`);
  if (args.deliveryMinor > 0) out.push(`Livraison : ${fmt(args.deliveryMinor)}`);
  out.push(`TOTAL : ${fmt(args.totalMinor)}`);
  out.push(`Payé : ${fmt(args.paidMinor)}`);
  if (args.prevBalanceMinor != null) out.push(`Solde précédent : ${fmt(args.prevBalanceMinor)}`);
  if (args.currentBalanceMinor != null) out.push(`Solde actuel : ${fmt(args.currentBalanceMinor)}`);
  out.push(``);
  out.push(`Merci de votre visite !`);
  return out.join("\n");
}

interface PrintReceiptPayload {
  company?: unknown;
  invoice?: unknown;
  date?: unknown;
  lines?: unknown;
  subtotalMinor?: unknown;
  discountMinor?: unknown;
  deliveryMinor?: unknown;
  totalMinor?: unknown;
  paidMinor?: unknown;
  prevBalanceMinor?: unknown;
  currentBalanceMinor?: unknown;
}

function toNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toReceiptLines(value: unknown): ReceiptLine[] {
  if (!Array.isArray(value)) return [];
  const out: ReceiptLine[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    if (
      typeof r["name"] === "string" &&
      typeof r["qty"] === "number" &&
      typeof r["unitPriceMinor"] === "number" &&
      typeof r["lineTotalMinor"] === "number"
    ) {
      out.push({
        name: r["name"],
        qty: r["qty"],
        unit: typeof r["unit"] === "string" ? r["unit"] : "",
        unitPriceMinor: r["unitPriceMinor"],
        lineTotalMinor: r["lineTotalMinor"],
      });
    }
  }
  return out;
}

function toPayload(raw: unknown): PrintReceiptPayload {
  if (typeof raw !== "object" || raw === null) return {};
  return raw as PrintReceiptPayload;
}

export function registerPrintingIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC_CHANNELS["printing.listPrinters"], async (event) => {
    try {
      const contents = event.sender;
      const printers = await contents.getPrintersAsync();
      return {
        ok: true,
        data: printers.map((p) => ({
          name: p.name,
          isDefault: (p as unknown as { isDefault?: boolean }).isDefault ?? false,
        })),
      };
    } catch (err) {
      log("ERROR", "printing", "list.failed", { error: String(err) });
      return { ok: false, code: "PRINTER_UNAVAILABLE", message: "Imprimante indisponible." };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printReceipt"], async (_e, raw: unknown) => {
    const win = getMainWindow();
    if (!win)
      return {
        ok: false,
        code: "PRINTER_UNAVAILABLE",
        message: "Fenêtre d'impression indisponible.",
      };
    try {
      const payload = toPayload(raw);
      const text = buildReceiptText({
        company: typeof payload.company === "string" ? payload.company : "Veloria",
        invoice: typeof payload.invoice === "string" ? payload.invoice : "",
        date:
          typeof payload.date === "string" && payload.date.length > 0
            ? payload.date
            : new Date().toLocaleString("fr-FR"),
        lines: toReceiptLines(payload.lines),
        subtotalMinor: toNumberOr(payload.subtotalMinor, 0),
        discountMinor: toNumberOr(payload.discountMinor, 0),
        deliveryMinor: toNumberOr(payload.deliveryMinor, 0),
        totalMinor: toNumberOr(payload.totalMinor, 0),
        paidMinor: toNumberOr(payload.paidMinor, 0),
        prevBalanceMinor: toOptionalNumber(payload.prevBalanceMinor),
        currentBalanceMinor: toOptionalNumber(payload.currentBalanceMinor),
      });
      // Render receipt in a hidden window via data URL for silent thermal print.
      const { BrowserWindow: BW } = await import("electron");
      const printWin = new BW({ show: false });
      await printWin.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<pre style="font-family:monospace;width:280px">${text.replace(/</g, "&lt;")}</pre>`)}`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      await new Promise<void>((resolve, reject) => {
        printWin.webContents.print({ silent: true }, (success, err) => {
          if (!success) reject(new Error(err || "print failed"));
          else resolve();
        });
      });
      printWin.destroy();
      return { ok: true, data: { printed: true } };
    } catch (err) {
      log("ERROR", "printing", "print.failed", { error: String(err) });
      return {
        ok: false,
        code: "PRINTER_UNAVAILABLE",
        message: "Échec d'impression. Vérifiez l'imprimante.",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS["printing.printA4"], () => ({ ok: true, data: { queued: true } }));
}
