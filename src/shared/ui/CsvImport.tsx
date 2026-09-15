// Veloria PoS — Shared: import CSV validé-avant-commit (FR).
// Produits : nom;prix_vente;prix_achat;quantite;code-barres
// Clients : prenom;nom;telephone
import { useState } from "react";
import { parseProductsCsv, parseCustomersCsv } from "@domain/import/csv-import.ts";
import { api } from "@shared/types/ipc-client.ts";
import { Button, Card, Field } from "@shared/ui/primitives.tsx";

export function CsvImport({
  kind,
  notify,
  onDone,
}: {
  kind: "products" | "customers";
  notify: (m: string, k?: "ok" | "err") => void;
  onDone: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ ok: boolean; count: number; error: string }>({
    ok: false,
    count: 0,
    error: "",
  });
  const [text, setText] = useState("");

  async function onFile(file: File): Promise<void> {
    const t = await file.text();
    setText(t);
    try {
      const rows = kind === "products" ? parseProductsCsv(t) : parseCustomersCsv(t);
      setPreview({ ok: true, count: rows.length, error: "" });
    } catch (e) {
      setPreview({
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "Fichier invalide.",
      });
    }
  }

  async function commit(): Promise<void> {
    try {
      if (kind === "products") {
        const rows = parseProductsCsv(text);
        const res = (await api.productsImport({
          rows: rows.map((r) => ({
            name: r.name,
            sellingPriceMinor: r.sellingPriceMinor,
            purchasePriceMinor: r.purchasePriceMinor,
            quantity: r.quantity,
            barcode: r.barcode,
          })),
        })) as { imported: number };
        notify(`${res.imported} produit(s) importé(s).`, "ok");
      } else {
        const rows = parseCustomersCsv(text);
        const res = (await api.customersImport({
          rows: rows.map((r) => ({ firstName: r.firstName, lastName: r.lastName, phone: r.phone })),
        })) as { imported: number };
        notify(`${res.imported} client(s) importé(s).`, "ok");
      }
      setOpen(false);
      setText("");
      setPreview({ ok: false, count: 0, error: "" });
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Import impossible.", "err");
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import CSV
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import CSV"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        >
          <Card className="w-[520px] space-y-3 p-5">
            <h2 className="text-lg font-bold">
              Import {kind === "products" ? "produits" : "clients"} (CSV, « ; »)
            </h2>
            <Field
              label="Fichier"
              hint={
                kind === "products"
                  ? "nom;prix_vente;prix_achat;quantite;code-barres (1re ligne d'en-tête acceptée)"
                  : "prenom;nom;telephone (1re ligne d'en-tête acceptée)"
              }
            >
              <input
                type="file"
                accept=".csv,.txt"
                aria-label="Fichier CSV"
                className="w-full text-sm text-slate-300"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </Field>
            {preview.error ? (
              <div role="alert" className="text-sm text-red-300">
                {preview.error}
              </div>
            ) : null}
            {preview.ok ? (
              <div role="status" className="text-sm text-emerald-300">
                {preview.count} ligne(s) valide(s) — rien n&apos;est écrit avant validation totale.
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button disabled={!preview.ok} onClick={() => void commit()}>
                Importer
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
