// Veloria PoS — Proformas : tiroir détail + formulaire + conversion.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Copy, FileCheck, FileDown, Pencil, Printer, Search, Trash2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useCompany } from "@shared/company/use-company.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd } from "@domain/money/money.ts";
import { formatDzdSafe } from "@shared/formatters/format.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { computeLineTotal } from "@domain/sales/sale-rules.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  InfoRow,
  Modal,
  Select,
  TextArea,
  TextInput,
} from "@shared/ui/primitives.tsx";
import type { ProformaDetailData } from "./ProformasScreen.tsx";
import {
  isProformaConvertible,
  isProformaEditable,
  proformaStatusLabel,
  proformaStatusTone,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Tiroir de détail devis.
// ---------------------------------------------------------------------------

export function ProformaDetailsDrawer({
  data,
  onClose,
  onEdit,
  onConvert,
  onDuplicate,
  onChanged,
  notify,
}: {
  data: ProformaDetailData;
  onClose: () => void;
  onEdit: (d: ProformaDetailData) => void;
  onConvert: (d: ProformaDetailData) => void;
  onDuplicate: (d: ProformaDetailData) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const p = data.proforma;
  const [busy, setBusy] = useState(false);
  // Fiche entreprise : source unique partagée (devis).
  const { record: companyRecord } = useCompany();
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();
  const [preview, setPreview] = useState<{
    htmlA4: string;
    text80: string;
    payload: Record<string, unknown>;
  } | null>(null);
  const [previewFormat, setPreviewFormat] = useState<"A4" | "80mm">("A4");

  async function setStatus(to: "sent" | "cancelled"): Promise<void> {
    setBusy(true);
    try {
      await api.proformaStatus({ id: p.id, to });
      notify(to === "sent" ? "Devis envoyé." : "Devis annulé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Transition impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!(await confirmAsync(`Supprimer le devis ${p.proforma_number} ?`))) return;
    setBusy(true);
    try {
      // M-2: caller-owned operation (one confirmed action = one operation).
      await api.proformaDelete({ id: p.id, operationId: newOperationId() });
      notify("Devis supprimé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const co = companyRecord;
      const payload: Record<string, unknown> = {
        company: co?.["company_name"] ?? "Veloria",
        companyPhone: co?.["phone"] ?? "",
        companyAddress: co?.["address"] ?? "",
        companyCity: co?.["city"] ?? "",
        companyEmail: co?.["email"] ?? "",
        customerName: p.customer_name ?? "",
        invoice: p.proforma_number,
        date: String(p.created_at).slice(0, 10),
        dueDate: p.due_date ? String(p.due_date).slice(0, 10) : "",
        notes: p.notes ?? "",
        lines: data.items.map((l) => ({
          name: String(l.product_name_snapshot),
          qty: Number(l.quantity),
          unit: "",
          unitPriceMinor: Number(l.unit_price_minor),
          lineTotalMinor: Number(l.line_total_minor),
          ref:
            typeof l.product_id === "number" && l.product_id > 0
              ? String(l.product_id).padStart(5, "0")
              : "—",
        })),
        subtotalMinor: Number(p.subtotal_minor),
        discountMinor: Number(p.discount_amount_minor),
        deliveryMinor: Number(p.delivery_fee_minor),
        totalMinor: Number(p.total_minor),
        paidMinor: 0,
      };
      const pv = (await api.proformaPreview(payload)) as { htmlA4: string; text80: string };
      setPreview({ htmlA4: pv.htmlA4, text80: pv.text80, payload });
    } catch (e) {
      notify(frError(e, "Aperçu indisponible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function print(): Promise<void> {
    if (!preview) return;
    try {
      await api.proformaPrintA4(preview.payload);
      notify("Devis envoyé (A4).", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  async function print80(): Promise<void> {
    if (!preview) return;
    try {
      await api.proformaPrint80mm(preview.payload);
      notify("Devis envoyé (80mm).", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    }
  }

  async function exportPdf(): Promise<void> {
    if (!preview) return;
    try {
      const res = (await api.proformaExportPdf(preview.payload)) as { path: string };
      notify(`PDF enregistré : ${res.path}`, "ok");
    } catch (e) {
      notify(frError(e, "Export PDF impossible."), "err");
    }
  }

  const editable = isProformaEditable(p.status);
  const convertible = isProformaConvertible(p.status);

  return (
    <>
      <Drawer
        label={p.proforma_number}
        title={p.proforma_number}
        sub={`Devis · ${String(p.created_at).slice(0, 10)}`}
        onClose={onClose}
      >
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={proformaStatusTone(p.status)}>{proformaStatusLabel(p.status)}</Badge>
          {p.customer_name ? <Badge tone="grey">{p.customer_name}</Badge> : null}
        </div>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Numéro" value={p.proforma_number} />
          <InfoRow label="Date" value={String(p.created_at).slice(0, 10)} num />
          <InfoRow
            label="Validité"
            value={p.due_date ? String(p.due_date).slice(0, 10) : "30 jours"}
            num
          />
          <InfoRow label="Client" value={p.customer_name ?? "—"} />
          {p.customer_phone ? <InfoRow label="Téléphone" value={p.customer_phone} /> : null}
        </Card>

        <Card className="space-y-2 p-4 text-sm">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Articles ({data.items.length})
          </div>
          <table className="w-full text-xs">
            <thead className="text-left uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="py-1 pr-2">Produit</th>
                <th className="py-1 pr-2 text-right">Qté</th>
                <th className="py-1 pr-2 text-right">Prix unit.</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((l, idx) => (
                <tr key={idx} className="border-t border-white/[0.06]">
                  <td className="py-1 pr-2">{l.product_name_snapshot}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{Number(l.quantity)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDzdSafe(l.unit_price_minor)}
                  </td>
                  <td className="py-1 text-right font-bold tabular-nums">
                    {formatDzdSafe(l.line_total_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow label="Sous-total" value={formatDzdSafe(p.subtotal_minor)} num />
          <InfoRow label="Remise" value={formatDzdSafe(p.discount_amount_minor)} num />
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Total</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzdSafe(p.total_minor)}
            </dd>
          </div>
          {p.notes ? <InfoRow label="Notes" value={String(p.notes)} /> : null}
          {p.terms ? <InfoRow label="Conditions" value={String(p.terms)} /> : null}
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void openPreview()} disabled={busy}>
            <Printer size={15} aria-hidden="true" /> {busy ? "…" : "Imprimer"}
          </Button>
          <Button variant="secondary" onClick={() => onDuplicate(data)}>
            <Copy size={15} aria-hidden="true" /> Dupliquer
          </Button>
        </div>
        {editable ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                onEdit(data);
              }}
            >
              <Pencil size={15} aria-hidden="true" /> Modifier
            </Button>
            <Button variant="secondary" onClick={() => void setStatus("sent")} disabled={busy}>
              Envoyer
            </Button>
          </div>
        ) : null}
        {convertible ? (
          <Button
            onClick={() => {
              onConvert(data);
            }}
          >
            <FileCheck size={15} aria-hidden="true" /> Convertir en facture
          </Button>
        ) : null}
        {p.status === "draft" || p.status === "sent" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => void setStatus("cancelled")} disabled={busy}>
              Annuler le devis
            </Button>
            <Button variant="secondary" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={15} aria-hidden="true" /> {busy ? "…" : "Supprimer"}
            </Button>
          </div>
        ) : null}
      </Drawer>

      {preview ? (
        <Modal
          label="Aperçu devis"
          title={`Devis ${p.proforma_number}`}
          onClose={() => setPreview(null)}
          wide
        >
          <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format d'aperçu">
            {(["A4", "80mm"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={previewFormat === f}
                onClick={() => setPreviewFormat(f)}
                className={
                  previewFormat === f
                    ? "rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-black"
                    : "rounded-lg border border-white/10 px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
                }
              >
                {f === "A4" ? "Devis A4" : "Ticket 80mm"}
              </button>
            ))}
          </div>
          {previewFormat === "A4" ? (
            <iframe
              sandbox=""
              srcDoc={preview.htmlA4}
              title="Aperçu devis"
              className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <pre
              className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
              aria-label="Aperçu devis 80mm"
            >
              {preview.text80}
            </pre>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => void print80()}>
              <Printer size={15} aria-hidden="true" /> Imprimer 80mm
            </Button>
            <Button onClick={() => void print()}>
              <Printer size={15} aria-hidden="true" /> Imprimer A4
            </Button>
            <Button variant="secondary" onClick={() => void exportPdf()}>
              <FileDown size={15} aria-hidden="true" /> PDF A4
            </Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulaire création / édition / duplication (brouillons uniquement).
// ---------------------------------------------------------------------------

interface FormLine {
  key: string;
  productId: number | null;
  name: string;
  unitPriceMinor: number;
  qty: string;
}

let lineSeq = 0;

export function ProformaFormDialog({
  editing,
  duplicating,
  onClose,
  onSaved,
  notify,
}: {
  editing: ProformaDetailData | null;
  duplicating: ProformaDetailData | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const source = editing ?? duplicating;
  const [customerId, setCustomerId] = useState<number | null>(source?.proforma.customer_id ?? null);
  const [customerLabel, setCustomerLabel] = useState(source?.proforma.customer_name ?? "");
  const [customerQ, setCustomerQ] = useState("");
  const [customerResults, setCustomerResults] = useState<{ id: number; name: string }[]>([]);
  const [dueDate, setDueDate] = useState(
    source?.proforma.due_date ? String(source.proforma.due_date).slice(0, 10) : "",
  );
  const [lines, setLines] = useState<FormLine[]>(
    (source?.items ?? []).map((l) => ({
      key: `l${(lineSeq += 1)}`,
      productId: typeof l.product_id === "number" ? l.product_id : null,
      name: String(l.product_name_snapshot),
      unitPriceMinor: Number(l.unit_price_minor),
      qty: String(Number(l.quantity)),
    })),
  );
  const [productQ, setProductQ] = useState("");
  const [productResults, setProductResults] = useState<
    { id: number; name: string; price: number; unit: string }[]
  >([]);
  const [discountText, setDiscountText] = useState(
    source && Number(source.proforma.discount_amount_minor) > 0
      ? (Number(source.proforma.discount_amount_minor) / 100).toString().replace(".", ",")
      : "",
  );
  const [notes, setNotes] = useState(
    typeof source?.proforma.notes === "string" ? source.proforma.notes : "",
  );
  const [terms, setTerms] = useState(
    typeof source?.proforma.terms === "string" ? source.proforma.terms : "",
  );
  const [busy, setBusy] = useState(false);

  async function searchCustomers(): Promise<void> {
    if (customerQ.trim().length < 2) return;
    try {
      const res = (await api.customerSearch({
        query: customerQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; first_name: string; last_name: string }[] };
      setCustomerResults(
        res.rows.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })),
      );
    } catch {
      setCustomerResults([]);
    }
  }

  async function searchProducts(): Promise<void> {
    if (productQ.trim().length < 2) return;
    try {
      const res = (await api.productSearch({ query: productQ.trim(), page: 1, pageSize: 8 })) as {
        rows: { id: number; name: string; selling_price_minor: number; unit_code: string }[];
      };
      setProductResults(
        res.rows.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.selling_price_minor,
          unit: p.unit_code,
        })),
      );
    } catch {
      setProductResults([]);
    }
  }

  function addProduct(p: { id: number; name: string; price: number }): void {
    setLines((prev) => [
      ...prev,
      {
        key: `l${(lineSeq += 1)}`,
        productId: p.id,
        name: p.name,
        unitPriceMinor: p.price,
        qty: "1",
      },
    ]);
    setProductQ("");
    setProductResults([]);
  }

  function setLineQty(key: string, v: string): void {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: v } : l)));
  }

  function removeLine(key: string): void {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const parsed = lines.map((l) => {
    const n = Number(l.qty.replace(",", ".").trim());
    const q = l.qty.trim() === "" ? 0 : Math.round(n * 1000) / 1000;
    return { ...l, wanted: Number.isFinite(q) && q > 0 ? q : 0 };
  });
  const subtotal = parsed.reduce((a, l) => a + computeLineTotal(l.unitPriceMinor, l.wanted), 0);
  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → -1 = refusé par les gardes.
  const discount = strictOrNeg(discountText, "Remise");
  const total = Math.max(0, subtotal - (Number.isInteger(discount) ? discount : 0));

  async function save(send: boolean): Promise<void> {
    if (parsed.some((l) => l.name.trim() === "")) {
      notify("Ligne sans nom.", "err");
      return;
    }
    if (!parsed.some((l) => l.wanted > 0)) {
      notify("Ajoutez au moins un article.", "err");
      return;
    }
    if (!Number.isInteger(discount) || discount < 0 || discount > subtotal) {
      notify("Remise invalide.", "err");
      return;
    }
    if (terms.trim().length > 2000) {
      notify("Conditions trop longues.", "err");
      return;
    }
    const payload = {
      operationId: newOperationId(),
      customerId,
      lines: parsed
        .filter((l) => l.wanted > 0)
        .map((l) => ({
          productId: l.productId,
          productName: l.name.trim(),
          unitPriceMinor: l.unitPriceMinor,
          quantity: l.wanted,
        })),
      discountMinor: discount,
      deliveryMinor: 0,
      dueDate: dueDate === "" ? null : dueDate,
      notes: notes.trim() === "" ? null : notes.trim(),
      terms: terms.trim() === "" ? null : terms.trim(),
    };
    setBusy(true);
    try {
      if (editing) {
        await api.proformaUpdate({ ...payload, id: editing.proforma.id });
        notify(`Devis ${editing.proforma.proforma_number} enregistré.`, "ok");
      } else {
        const res = (await api.proformaCreate(payload)) as { number: string; id: number };
        if (send) {
          try {
            await api.proformaStatus({ id: res.id, to: "sent" });
          } catch {
            notify(`Devis ${res.number} créé (envoi impossible).`, "err");
            onSaved();
            return;
          }
        }
        notify(`Devis ${res.number} ${send ? "envoyé." : "créé (brouillon)."}`, "ok");
      }
      // P5 : devis enregistré = succès.
      playSound("success");
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={editing ? "Modifier le devis" : "Nouveau devis"}
      title={
        editing
          ? `Modifier ${editing.proforma.proforma_number}`
          : duplicating
            ? `Dupliquer ${duplicating.proforma.proforma_number}`
            : "Nouveau devis"
      }
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <Field label="Client" hint="Vide = comptant/passage.">
          {customerId != null ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-2.5 text-sm">
              <span className="truncate font-semibold">{customerLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setCustomerId(null);
                  setCustomerLabel("");
                }}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Retirer
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <div className="flex-1">
                  <TextInput
                    value={customerQ}
                    onChange={(e) => setCustomerQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchCustomers();
                      }
                    }}
                    placeholder="Rechercher… (min. 2 lettres)"
                    aria-label="Rechercher un client"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void searchCustomers()}>
                  <Search size={15} aria-hidden="true" />
                </Button>
              </div>
              {customerResults.length > 0 ? (
                <ul className="mt-2 max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerId(c.id);
                          setCustomerLabel(c.name);
                          setCustomerResults([]);
                          setCustomerQ("");
                        }}
                        className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Validité (échéance)" hint="Vide = 30 jours.">
            <TextInput
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Validité"
            />
          </Field>
          <Field label="Remise globale (DZD)">
            <TextInput
              value={discountText}
              onChange={(e) => setDiscountText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Remise globale"
            />
          </Field>
        </div>

        <Field label="Articles">
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchProducts();
                  }
                }}
                placeholder="Rechercher un produit… (min. 2 lettres)"
                aria-label="Rechercher un produit"
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void searchProducts()}>
              <Search size={15} aria-hidden="true" />
            </Button>
          </div>
          {productResults.length > 0 ? (
            <ul className="mt-2 max-h-32 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
              {productResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                  >
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-400">
                      {formatDzd(p.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Field>

        {parsed.length > 0 ? (
          <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2 text-right">Prix unit.</th>
                  <th className="px-3 py-2 text-right">Qté</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {parsed.map((l) => (
                  <tr key={l.key} className="border-t border-white/[0.06]">
                    <td className="max-w-[180px] truncate px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {formatDzd(l.unitPriceMinor)}
                    </td>
                    <td className="w-24 px-3 py-2">
                      <TextInput
                        value={l.qty}
                        onChange={(e) => setLineQty(l.key, e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Quantité ${l.name}`}
                        className="py-1.5 text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(computeLineTotal(l.unitPriceMinor, l.wanted))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        aria-label={`Retirer ${l.name}`}
                        className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Notes" hint="Optionnel.">
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détail libre…"
              aria-label="Notes"
            />
          </Field>
          <Field label="Conditions" hint="Optionnel.">
            <TextArea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Ex. : paiement à 30 jours…"
              aria-label="Conditions"
            />
          </Field>
        </div>

        <dl className="flex items-baseline justify-between rounded-xl bg-black/25 px-4 py-3">
          <dt className="text-sm text-slate-400">Sous-total : {formatDzd(subtotal)}</dt>
          <dd className="text-xl font-extrabold tabular-nums text-amber-300">
            Total : {formatDzd(total)}
          </dd>
        </dl>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          {editing ? (
            <Button onClick={() => void save(false)} disabled={busy} className="flex-[2]">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void save(false)}
                disabled={busy}
                className="flex-1"
              >
                {busy ? "…" : "Brouillon"}
              </Button>
              <Button onClick={() => void save(true)} disabled={busy} className="flex-[2]">
                {busy ? "Enregistrement…" : "Enregistrer et envoyer"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Conversion en facture.
// ---------------------------------------------------------------------------

export function ProformaConversionDialog({
  data,
  onClose,
  onSaved,
  notify,
}: {
  data: ProformaDetailData;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const p = data.proforma;
  const total = Number(p.total_minor);
  const [amountText, setAmountText] = useState((total / 100).toString().replace(".", ","));
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer" | null>("cash");
  const [busy, setBusy] = useState(false);
  const amount = strictOrNeg(amountText, "Montant");
  const valid = Number.isInteger(amount) && amount >= 0 && amount <= total;

  async function convert(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.proformaConvert({
        operationId: newOperationId(),
        proformaId: p.id,
        amountPaidMinor: amount,
        paymentMethod: amount > 0 ? method : null,
      })) as { invoiceNumber: string };
      notify(`Facture ${res.invoiceNumber} créée.`, "ok");
      // P5 : conversion en facture = succès.
      playSound("success");
      onSaved();
    } catch (e) {
      notify(frError(e, "Conversion impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Conversion en facture" title={`Convertir ${p.proforma_number}`} onClose={onClose}>
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Devis</dt>
            <dd className="font-mono font-bold">{p.proforma_number}</dd>
          </div>
          <div className="flex justify-between text-slate-300">
            <dt>Client</dt>
            <dd className="font-semibold">{p.customer_name ?? "Passage"}</dd>
          </div>
          <div className="flex justify-between text-slate-300">
            <dt>Articles</dt>
            <dd className="tabular-nums">{data.items.length} ligne(s)</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Total</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzd(total)}
            </dd>
          </div>
          <div className="flex justify-between font-bold text-sky-300">
            <dt>Reste (crédit)</dt>
            <dd className="tabular-nums">{formatDzd(valid ? total - amount : total)}</dd>
          </div>
        </dl>
        {!p.customer_id && valid && total - amount > 0 ? (
          <p role="alert" className="text-xs font-bold text-red-300">
            Crédit sans client : la conversion exige un client autorisé (crédit refusé sinon).
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Montant reçu (DZD)">
            <TextInput
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Montant reçu"
            />
          </Field>
          <Field label="Moyen de paiement">
            <Select
              value={method ?? "cash"}
              onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
              aria-label="Moyen de paiement"
            >
              <option value="cash">Espèces</option>
              <option value="cheque">Chèque</option>
              <option value="transfer">Virement</option>
            </Select>
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void convert()} disabled={busy || !valid} className="flex-[2]">
            {busy ? "Conversion…" : "Convertir en facture"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Le devis passe à « Converti » (figé) et la facture suit les mêmes règles que la caisse
          (crédit réservé aux clients autorisés).
        </p>
      </div>
    </Modal>
  );
}
