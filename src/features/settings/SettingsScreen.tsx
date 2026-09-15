// Veloria PoS — Screen: Paramètres (entreprise, base, sauvegardes, impression, diagnostics).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { Button, Card, TextInput, Field } from "@shared/ui/primitives.tsx";

interface BackupRow {
  file: string;
  size: number;
  createdAt: string;
}

export function SettingsScreen({
  notify,
}: {
  notify: (m: string, k?: "ok" | "err") => void;
}): React.JSX.Element {
  const [loc, setLoc] = useState<{ path?: string; logicalName?: string } | null>(null);
  const [health, setHealth] = useState<string>("");
  const [diag, setDiag] = useState<Record<string, string> | null>(null);
  const [company, setCompany] = useState({ company_name: "", phone: "", address: "", city: "" });
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [allowNeg, setAllowNeg] = useState(false);

  async function load(): Promise<void> {
    try {
      const l = (await window.veloria?.database.location()) as {
        ok: boolean;
        data?: typeof loc;
      };
      if (l.ok) setLoc(l.data ?? null);
      const h = (await window.veloria?.database.health()) as {
        ok: boolean;
        data?: { integrity?: string };
      };
      if (h.ok) setHealth(JSON.stringify(h.data?.integrity ?? h.data));
      const d = (await window.veloria?.app.diagnostics()) as {
        ok: boolean;
        data?: Record<string, string>;
      };
      if (d.ok) setDiag(d.data ?? null);
      const c = (await api.companyGet()) as {
        company: Record<string, string> | null;
      };
      if (c.company) {
        setCompany({
          company_name: String(c.company["company_name"] ?? ""),
          phone: String(c.company["phone"] ?? ""),
          address: String(c.company["address"] ?? ""),
          city: String(c.company["city"] ?? ""),
        });
      }
      const b = (await window.veloria?.backup.list()) as { ok: boolean; data?: BackupRow[] };
      if (b.ok) setBackups(b.data ?? []);
      const p = (await window.veloria?.printing.listPrinters()) as {
        ok: boolean;
        data?: typeof printers;
      };
      if (p.ok) setPrinters(p.data ?? []);
      const s = (await api.settingsGet({ key: "inventory" })) as {
        value: { allowNegativeStock: boolean };
      };
      setAllowNeg(Boolean(s.value.allowNegativeStock));
    } catch {
      /* états partiels affichés */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveCompany(): Promise<void> {
    try {
      await window.veloria?.company.update(company);
      notify("Profil entreprise enregistré.", "ok");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Enregistrement impossible.", "err");
    }
  }

  async function backupNow(): Promise<void> {
    try {
      await api.backupCreate();
      notify("Sauvegarde créée.", "ok");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Sauvegarde impossible.", "err");
    }
  }

  async function restore(file: string): Promise<void> {
    if (!window.confirm("Restaurer cette sauvegarde ? Un instantané de sécurité sera créé."))
      return;
    try {
      const r = (await window.veloria?.backup.restore({ file })) as {
        ok: boolean;
        message?: string;
      };
      if (!r.ok) throw new Error(r.message ?? "Restauration impossible.");
      notify("Sauvegarde validée. Redémarrez pour finaliser.", "ok");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Restauration impossible.", "err");
    }
  }

  async function saveInventory(v: boolean): Promise<void> {
    try {
      await api.settingsSave({ key: "inventory", value: { allowNegativeStock: v } });
      setAllowNeg(v);
      notify("Politique de stock enregistrée.", "ok");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Enregistrement impossible.", "err");
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">Paramètres</h1>
      <div className="grid grid-cols-2 gap-3">
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Profil entreprise (tickets & factures A4)</h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nom">
              <TextInput
                value={company.company_name}
                onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
              />
            </Field>
            <Field label="Téléphone">
              <TextInput
                value={company.phone}
                onChange={(e) => setCompany({ ...company, phone: e.target.value })}
              />
            </Field>
            <Field label="Adresse">
              <TextInput
                value={company.address}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
              />
            </Field>
            <Field label="Ville">
              <TextInput
                value={company.city}
                onChange={(e) => setCompany({ ...company, city: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => void saveCompany()}>Enregistrer</Button>
          </div>
        </Card>
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Base de données — {loc?.logicalName ?? "veloria POS DB"}</h2>
          <p className="break-all font-mono text-xs text-slate-400">{loc?.path ?? "…"}</p>
          <p className="text-xs text-slate-500">Intégrité : {health || "vérification…"}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void window.veloria?.system.openDataFolder()}>
              Ouvrir le dossier
            </Button>
            <Button variant="outline" onClick={() => void backupNow()}>
              Sauvegarder maintenant
            </Button>
          </div>
          <div className="border-t border-white/5 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Sauvegardes ({backups.length}/30)
            </h3>
            {backups.slice(0, 5).map((b) => (
              <div key={b.file} className="flex items-center justify-between py-1 text-xs">
                <span className="truncate font-mono text-slate-400" title={b.file}>
                  {b.file.split(/[/\\]/).pop()} · {(b.size / 1024).toFixed(0)} Ko
                </span>
                <Button variant="ghost" onClick={() => void restore(b.file)}>
                  Restaurer
                </Button>
              </div>
            ))}
          </div>
        </Card>
        <Card className="space-y-2 p-4">
          <h2 className="font-bold">Inventaire & impression</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowNeg}
              onChange={(e) => void saveInventory(e.target.checked)}
            />
            Autoriser le stock négatif (ventes à découvert)
          </label>
          <p className="text-xs text-slate-500">
            Par défaut : vente bloquée si stock insuffisant. Imprimantes détectées :{" "}
            {printers.length === 0 ? "aucune" : printers.map((p) => p.name).join(", ")}
          </p>
        </Card>
        <Card className="space-y-1 p-4 text-xs text-slate-400">
          <h2 className="font-bold text-slate-200">Diagnostics</h2>
          {diag ? (
            <dl>
              {Object.entries(diag).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt>{k}</dt>
                  <dd className="truncate font-mono">{String(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Chargement…</p>
          )}
          <p className="pt-2">
            La désinstallation conserve la base et les sauvegardes (deleteAppDataOnUninstall:false).
          </p>
        </Card>
      </div>
    </div>
  );
}
