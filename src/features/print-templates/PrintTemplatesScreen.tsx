// Veloria PoS — Écran : Impression (centre de contrôle réel).
// Zéro maquette, zéro drapeau décoratif : chaque action appelle un canal IPC
// testé (imprimante, page de test, réglages facture). La matrice documents
// indique pour chaque document où l'apercevoir, l'imprimer et l'exporter.
// La personnalisation réelle vit dans Paramètres → Facturation (SQLite,
// appliquée par le main à chaque impression) — rappelée ici en lecture seule.
import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { useAppSettings } from "@shared/settings/use-app-settings.ts";
import { Button, Card, Field, PageHeader, Select, type Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

interface InvoiceSettingsView {
  showLogo: boolean;
  showCustomerBalance: boolean;
  showPreviousBalance: boolean;
  footerText: string;
  thankYouMessage: string;
  vatRate?: number;
  defaultSeller?: string;
}

interface PrintingSettingsView {
  silent?: boolean;
  thermalWidth?: string;
}

const DOCUMENTS: { doc: string; formats: string; where: string }[] = [
  {
    doc: "Ticket 80mm",
    formats: "Aperçu · Impression · PDF",
    where: "Vente · Historique · Clients · Dettes · Retours",
  },
  {
    doc: "Facture A4",
    formats: "Aperçu · Impression · PDF",
    where: "Vente · Historique · Clients · Dettes · Retours",
  },
  {
    doc: "Devis (proforma)",
    formats: "Aperçu 80mm/A4 · Impression · PDF",
    where: "Vente (F4) · Proformas",
  },
  {
    doc: "Reçu de règlement",
    formats: "Aperçu 80mm/A4 · Impression · PDF",
    where: "Dettes · Clients · Fournisseurs · Pain",
  },
  {
    doc: "Rapport / Zakat / Bord",
    formats: "Aperçu A4 · Impression · PDF",
    where: "Rapports · Tableau de bord · Zakat",
  },
  {
    doc: "Étiquettes code-barres",
    formats: "Aperçu A4 · Impression · PDF",
    where: "Catalogue → Étiquettes",
  },
  { doc: "Bon pain", formats: "Aperçu A4 · Impression · PDF", where: "Pain → fiche commande" },
  {
    doc: "Bon de livraison",
    formats: "Aperçu · Impression",
    where: "Vente · Historique",
  },
  {
    doc: "Bon de retour",
    formats: "Aperçu · Impression",
    where: "Retours",
  },
  {
    doc: "Bon de commande",
    formats: "Aperçu · Impression",
    where: "Fournisseurs → Bons de commande",
  },
];

export function PrintTemplatesScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const { value: invoice } = useAppSettings<InvoiceSettingsView>("invoice");
  const { value: printing } = useAppSettings<PrintingSettingsView>("printing");
  const thermalWidth = printing?.thermalWidth === "58" ? "58" : "80";

  async function refreshPrinters(): Promise<void> {
    try {
      const current = (await api.printerGet()) as { name: string | null };
      setSelected(current.name ?? "");
      const r = (await api.printersList()) as {
        printers: { name: string; isDefault: boolean }[];
        selected: string | null;
      };
      setPrinters(r.printers);
      if (r.selected) setSelected(r.selected);
    } catch (e) {
      notify(frError(e, "Imprimantes indisponibles."), "err");
    }
  }

  useEffect(() => {
    void refreshPrinters();
  }, []);

  async function savePrinter(name: string): Promise<void> {
    setSelected(name);
    setBusy(true);
    try {
      await api.printerSave({ name: name === "" ? null : name, operationId: newOperationId() });
      notify("Imprimante enregistrée.", "ok");
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function saveThermalWidth(v: string): Promise<void> {
    setBusy(true);
    try {
      await api.settingsSave({
        key: "printing",
        value: { silent: printing?.silent ?? true, thermalWidth: v === "58" ? "58" : "80" },
      });
      notify("Largeur thermique enregistrée.", "ok");
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function testPage(): Promise<void> {
    setBusy(true);
    try {
      await api.printerTest();
      notify("Page de test envoyée.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Impression"
        module="DOCUMENTS RÉELS · 80MM / A4"
        period="Chaque document s'aperçoit, s'imprime et s'exporte depuis son écran — sans valeur fiscale pour les devis."
        actions={
          <Button variant="secondary" onClick={() => void testPage()} disabled={busy}>
            <Printer size={15} aria-hidden="true" /> Page de test
          </Button>
        }
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="text-[15px] font-bold text-[#ffe1a7]">Imprimante active</div>
          <Field label="Imprimante">
            <Select
              value={selected}
              onChange={(e) => void savePrinter(e.target.value)}
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
          <Field label="Largeur thermique" hint="Format des tickets (58 ou 80mm).">
            <Select
              value={thermalWidth}
              onChange={(e) => void saveThermalWidth(e.target.value)}
              aria-label="Largeur thermique"
              disabled={busy}
            >
              <option value="58">58mm</option>
              <option value="80">80mm</option>
            </Select>
          </Field>
          <p className="text-xs text-slate-500">
            Une imprimante configurée mais introuvable bloque l'impression (refus explicite — jamais
            d'envoi silencieux ailleurs).
          </p>
          <p className="text-xs text-slate-500">
            Thermique 58/80mm · étiquettes 30x20 / 50x30 / 58x40 / personnalisé · impression N&amp;B
            avec QR · TVA selon Paramètres → Facturation.
          </p>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="text-[15px] font-bold text-[#ffe1a7]">
            Personnalisation appliquée (Paramètres → Facturation)
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Logo</dt>
              <dd>{invoice == null ? "—" : invoice.showLogo ? "Oui" : "Non"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Solde client</dt>
              <dd>{invoice == null ? "—" : invoice.showCustomerBalance ? "Oui" : "Non"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Solde précédent</dt>
              <dd>{invoice == null ? "—" : invoice.showPreviousBalance ? "Oui" : "Non"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Pied de page</dt>
              <dd className="max-w-[60%] truncate">
                {invoice == null ? "—" : invoice.footerText || "Mentions légales seules"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Remerciement</dt>
              <dd className="max-w-[60%] truncate">
                {invoice == null ? "—" : invoice.thankYouMessage || "Texte par défaut"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">TVA</dt>
              <dd>
                {invoice == null || invoice.vatRate == null
                  ? "—"
                  : invoice.vatRate === 0
                    ? "Sans TVA"
                    : `${String(invoice.vatRate).replace(".", ",")} %`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Vendeur par défaut</dt>
              <dd className="max-w-[60%] truncate">
                {invoice == null ? "—" : invoice.defaultSeller || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Largeur thermique</dt>
              <dd>{thermalWidth}mm</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">
            Montant en lettres, signatures et mentions RC/NIF toujours imprimés. Montants à 2
            décimales. TVA selon le taux réglé dans Paramètres → Facturation (0 = sans TVA).
          </p>
        </Card>
      </div>

      <Card className="space-y-2 p-4">
        <div className="text-[15px] font-bold text-[#ffe1a7]">
          Documents — où les apercevoir, imprimer, exporter
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-2 py-1">Document</th>
              <th className="px-2 py-1">Formats réels</th>
              <th className="px-2 py-1">Écrans</th>
            </tr>
          </thead>
          <tbody>
            {DOCUMENTS.map((d) => (
              <tr key={d.doc} className="border-t border-white/[0.06]">
                <td className="px-2 py-1.5 font-semibold">{d.doc}</td>
                <td className="px-2 py-1.5 text-slate-300">{d.formats}</td>
                <td className="px-2 py-1.5 text-slate-300">{d.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
