// Veloria PoS — Electron: hardware ports (scanner / drawer / scale).
// USB HID scanners act as keyboard input (renderer handles rapid keystrokes).
// Drawer + scale go through adapter boundaries; disconnected hardware never crashes.

export interface CashDrawerPort {
  open(): Promise<{ opened: boolean }>;
}

export interface ScalePort {
  readGrams(): Promise<{ grams: number | null; connected: boolean }>;
}

export class NoopCashDrawer implements CashDrawerPort {
  open(): Promise<{ opened: boolean }> {
    // Default: ESC/POS via printer pathway would be implemented with a real driver.
    return Promise.resolve({ opened: false });
  }
}

export class NoopScale implements ScalePort {
  readGrams(): Promise<{ grams: number | null; connected: boolean }> {
    return Promise.resolve({ grams: null, connected: false });
  }
}

/** Barcode scanner input helper (renderer-side contract documented here). */
export function isScannerBurst(keyIntervalsMs: number[], thresholdMs = 30): boolean {
  if (keyIntervalsMs.length < 4) return false;
  const avg = keyIntervalsMs.reduce((a, b) => a + b, 0) / keyIntervalsMs.length;
  return avg < thresholdMs;
}
