// Veloria PoS — Shared: carte imprimante unique (Paramètres + Studio).
// Source unique d'écriture (printerSave/settingsSave) et de lecture :
// les deux écrans montaient chacun leur implémentation.
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { saveAppSettings, useAppSettings } from "@shared/settings/use-app-settings.ts";
import { Button, Card, Field, Select, Switch, type Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

export interface PrinterSettingsView {
  printer: string;
  thermalWidth: "58mm" | "80mm";
  silent: boolean;
}

export function PrinterCard({
  notify,
  showSilent,
  showHardwareTest,
  showTestPage,
  onChange,
}: {
  notify: Notify;
  showSilent?: boolean;
  showHardwareTest?: boolean;
  showTestPage?: boolean;
  onChange?: (s: PrinterSettingsView) => void;
}): React.JSX.Element {
  const { value } = useAppSettings<{ silent: boolean; thermalWidth?: string }>("printing");
  const [silent, setSilent] = useState(true);
  const [thermalWidth, setThermalWidth] = useState<"58mm" | "80mm">("80mm");
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (value) {
      setSilent(value.silent);
      if (value.thermalWidth === "58mm" || value.thermalWidth === "80mm") {
        setThermalWidth(value.thermalWidth);
      }
    }
  }, [value]);

  useEffect(() => {
    api
      .printersList()
      .then((r) => {
        const d = r as {
          printers: { name: string; isDefault: boolean }[];
          selected: string | null;
        };
        setPrinters(d.printers);
        setSelected(d.selected ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    onChange?.({ printer: selected, thermalWidth, silent });
  }, [selected, thermalWidth, silent]);

  async function run(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  function savePrinter(name: string): void {
    setSelected(name);
    void run(async () => {
      try {
        await api.printerSave({ name: name === "" ? null : name, operationId: newOperationId() });
        notify("Imprimante enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function saveWidth(v: "58mm" | "80mm"): void {
    setThermalWidth(v);
    void run(async () => {
      try {
        await saveAppSettings("printing", { silent, thermalWidth: v });
        notify("Largeur thermique enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function saveSilent(v: boolean): void {
    setSilent(v);
    void run(async () => {
      try {
        await saveAppSettings("printing", { silent: v, thermalWidth });
        notify("Impression enregistrée.", "ok");
      } catch (e) {
        notify(frError(e, "Enregistrement impossible."), "err");
      }
    });
  }

  function testPage(): void {
    void run(async () => {
      try {
        await api.printerTest();
        notify("Page de test envoyée.", "ok");
      } catch (e) {
        notify(frError(e, "Impression impossible."), "err");
      }
    });
  }

  function testHardware(): void {
    void run(async () => {
      const parts: string[] = [];
      try {
        const r = (await api.printersList()) as {
          printers: { name: string; isDefault: boolean }[];
        };
        parts.push(`Imprimantes détectées : ${r.printers.length}`);
      } catch {
        parts.push("Imprimantes : échec de détection");
      }
      try {
        const h = (await api.dbIntegrity()) as { integrity?: string };
        parts.push(`Base : ${h.integrity === "ok" ? "saine" : "à contrôler"}`);
      } catch {
        parts.push("Base : contrôle impossible");
      }
      try {
        const s = (await api.backupStatus()) as { count?: number; lastAt?: string | null };
        parts.push(`Sauvegardes : ${s.count ?? 0} (dernière ${s.lastAt ?? "—"})`);
      } catch {
        parts.push("Sauvegardes : état inconnu");
      }
      notify(`Matériel — ${parts.join(" · ")}.`, "ok");
    });
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="text-[15px] font-bold text-[#ffe1a7]">Imprimante active</div>
      <Field label="Imprimante">
        <Select
          value={selected}
          onChange={(e) => savePrinter(e.target.value)}
          aria-label="Imprimante active"
          disabled={busy}
        >
          <option value="">Imprimante système par défaut</option>
          {printers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.isDefault ? " (défaut)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Largeur thermique par défaut" hint="Repli quand le modèle ne l'impose pas.">
        <Select
          value={thermalWidth}
          onChange={(e) => saveWidth(e.target.value === "58mm" ? "58mm" : "80mm")}
          aria-label="Largeur thermique"
          disabled={busy}
        >
          <option value="58mm">58mm</option>
          <option value="80mm">80mm</option>
        </Select>
      </Field>
      {showSilent ? (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>
            Impression silencieuse
            <span className="block text-xs font-normal text-slate-500">
              Coupé = dialogue système à chaque fois.
            </span>
          </span>
          <Switch
            checked={silent}
            onChange={saveSilent}
            ariaLabel="Impression silencieuse"
            disabled={busy}
          />
        </label>
      ) : null}
      {showTestPage || showHardwareTest ? (
        <div className="flex flex-wrap gap-2">
          {showTestPage ? (
            <Button
              type="button"
              variant="secondary"
              onClick={testPage}
              disabled={busy}
              className="flex-1"
            >
              <Printer size={15} aria-hidden="true" /> Page de test
            </Button>
          ) : null}
          {showHardwareTest ? (
            <Button
              type="button"
              variant="secondary"
              onClick={testHardware}
              disabled={busy}
              className="flex-1"
            >
              Tester les connexions matériel
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
