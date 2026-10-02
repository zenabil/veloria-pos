// Veloria PoS — Retours : tiroir détail + création (client/fournisseur) + remboursement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";

import { formatDzd } from "@domain/money/money.ts";
import { strictOrNeg } from "@shared/money/parse.ts";
import { newOperationId } from "@domain/common/ids.ts";

import { RETURN_REASONS } from "@domain/returns/return-rules.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { Button, EmptyState, Field, Select, TextInput, cn } from "@shared/ui/primitives.tsx";
import { type ItemCondition } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Retour fournisseur (depuis un bon d'achat).
// ---------------------------------------------------------------------------

interface IntakeLine {
  product_id: number | null;
  product_name_snapshot: string;
  purchase_price_minor: number;
  quantity_received: number;
  already_returned: number;
  eligible: number;
}

export function SupplierReturnDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [supplierQ, setSupplierQ] = useState("");
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [intakes, setIntakes] = useState<
    { id: number; invoice_number: string | null; total_minor: number; created_at: string }[]
  >([]);
  const [intakeId, setIntakeId] = useState<number | null>(null);
  const [lines, setLines] = useState<(IntakeLine & { qty: string; condition: ItemCondition })[]>(
    [],
  );
  const [recoverText, setRecoverText] = useState("");
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [reason, setReason] = useState<string>(RETURN_REASONS[0] as string);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(todayUtcDate());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function searchSuppliers(): Promise<void> {
    if (supplierQ.trim().length < 2) {
      notify("Nom fournisseur requis (2 lettres min.).", "err");
      return;
    }
    setLoading(true);
    try {
      const res = (await api.supplierSearch({
        query: supplierQ.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; name: string }[] };
      setSuppliers(res.rows);
      if (res.rows.length === 0) notify("Aucun fournisseur.", "err");
    } catch (e) {
      notify(frError(e, "Recherche impossible."), "err");
    } finally {
      setLoading(false);
    }
  }

  async function pickSupplier(id: number, name: string): Promise<void> {
    setSupplierId(id);
    setSupplierName(name);
    setSuppliers([]);
    setSupplierQ(name);
    setLoading(true);
    try {
      const st = (await api.supplierStatement({ id })) as {
        intakes: {
          id: number;
          invoice_number: string | null;
          total_minor: number;
          created_at: string;
          status: string;
        }[];
      };
      setIntakes(st.intakes.filter((i) => i.status !== "cancelled"));
    } catch (e) {
      notify(frError(e, "Bons indisponibles."), "err");
    } finally {
      setLoading(false);
    }
  }

  async function pickIntake(id: number): Promise<void> {
    setIntakeId(id);
    setLoading(true);
    try {
      const det = (await api.returnIntakeItems({ id })) as { items: IntakeLine[] };
      setLines(det.items.map((l) => ({ ...l, qty: "", condition: "good" as ItemCondition })));
    } catch (e) {
      notify(frError(e, "Lignes indisponibles."), "err");
    } finally {
      setLoading(false);
    }
  }

  function setLineQty(idx: number, v: string): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: v } : l)));
  }

  function setLineCondition(idx: number, v: ItemCondition): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, condition: v } : l)));
  }

  const parsed = lines.map((l) => {
    const n = Number(l.qty.replace(",", ".").trim());
    const q = l.qty.trim() === "" ? 0 : Math.round(n * 1000) / 1000;
    return {
      ...l,
      wanted: Number.isFinite(q) && q > 0 ? Math.min(q, l.eligible) : 0,
      over: Number.isFinite(q) && q > l.eligible,
    };
  });
  const chosen = parsed.filter((l) => l.wanted > 0);
  const total = chosen.reduce((a, l) => a + Math.round(l.purchase_price_minor * l.wanted), 0);
  const recover = strictOrNeg(recoverText, "Montant récupéré");

  async function save(): Promise<void> {
    if (intakeId == null) {
      notify("Choisissez d'abord le bon d'achat.", "err");
      return;
    }
    if (chosen.length === 0) {
      notify("Saisissez au moins une quantité.", "err");
      return;
    }
    if (parsed.some((l) => l.over)) {
      notify("Quantité supérieure à l'éligible.", "err");
      return;
    }
    if (!Number.isInteger(recover) || recover < 0 || recover > total) {
      notify("Montant récupéré invalide.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.returnCreate({
        operationId: newOperationId(),
        kind: "supplier",
        intakeId,
        items: chosen.map((l) => ({
          productId: l.product_id,
          quantity: l.wanted,
          restocked: false,
          condition: l.condition,
        })),
        refundMinor: recover,
        creditMinor: 0,
        refundMethod: recover > 0 ? method : null,
        reason,
        notes: notes.trim() === "" ? null : notes.trim(),
        returnDate: date,
      })) as { number: string };
      notify(`Retour ${res.number} enregistré.`, "ok");
      // P5 : retour créé = succès.
      playSound("success");
      onSaved();
    } catch (e) {
      notify(frError(e, "Création impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {supplierId == null ? (
        <>
          <div className="flex gap-2">
            <div className="flex-1">
              <TextInput
                value={supplierQ}
                onChange={(e) => setSupplierQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchSuppliers();
                  }
                }}
                placeholder="Nom du fournisseur…"
                aria-label="Rechercher un fournisseur"
              />
            </div>
            <Button variant="secondary" onClick={() => void searchSuppliers()} disabled={loading}>
              <Search size={15} aria-hidden="true" /> {loading ? "…" : "Rechercher"}
            </Button>
          </div>
          {suppliers.length > 0 ? (
            <ul className="max-h-36 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
              {suppliers.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => void pickSupplier(s.id, s.name)}
                    className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          <dl className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-3 text-sm">
            <div className="min-w-0">
              <dt className="truncate font-bold">{supplierName}</dt>
              <dd className="text-xs text-slate-500">Bon d'achat à retourner</dd>
            </div>
            <button
              type="button"
              onClick={() => {
                setSupplierId(null);
                setSupplierQ("");
                setIntakes([]);
                setIntakeId(null);
                setLines([]);
              }}
              className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Changer
            </button>
          </dl>
          <Field label="Bon d'achat">
            <Select
              value={intakeId == null ? "" : String(intakeId)}
              onChange={(e) => void pickIntake(Number(e.target.value))}
              aria-label="Bon d'achat"
            >
              <option value="">— Choisir —</option>
              {intakes.map((i) => (
                <option key={i.id} value={String(i.id)}>
                  {(i.invoice_number ?? `BON-${i.id}`).toString()} · {formatDzd(i.total_minor)} ·{" "}
                  {i.created_at.slice(0, 10)}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {intakeId != null ? (
        <>
          <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Produit</th>
                  <th className="px-3 py-2 text-right">Reçu</th>
                  <th className="px-3 py-2 text-right">Qté retour</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((l, i) => (
                  <tr key={i} className="border-t border-white/[0.06]">
                    <td className="max-w-[180px] truncate px-3 py-2">{l.product_name_snapshot}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {l.quantity_received}{" "}
                      <span className="text-[11px]">(restant {l.eligible})</span>
                    </td>
                    <td className="w-24 px-3 py-2">
                      <TextInput
                        value={l.qty}
                        onChange={(e) => setLineQty(i, e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`Quantité ${l.product_name_snapshot}`}
                        className={cn("py-1.5 text-right", l.over && "border-red-400/60")}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">
                      {formatDzd(Math.round(l.purchase_price_minor * l.wanted))}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={l.condition}
                        onChange={(e) => setLineCondition(i, e.target.value as ItemCondition)}
                        aria-label={`État ${l.product_name_snapshot}`}
                        className="py-1.5 text-xs"
                      >
                        <option value="good">Bon état</option>
                        <option value="defective">Défectueux</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Motif">
              <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif">
                {RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date de retour">
              <TextInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date de retour"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant récupéré (DZD)" hint="Sommes rendues par le fournisseur.">
              <TextInput
                value={recoverText}
                onChange={(e) => setRecoverText(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant récupéré"
              />
            </Field>
            <Field label="Moyen">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de récupération"
              >
                <option value="cash">Espèces</option>
                <option value="cheque">Chèque</option>
                <option value="transfer">Virement</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes" hint="Optionnel.">
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détail libre…"
              aria-label="Notes"
            />
          </Field>
          <p className="rounded-xl bg-black/25 px-4 py-3 text-xs text-slate-400">
            Le stock diminue des quantités retournées et la dette envers « {supplierName} » diminue
            de {formatDzd(total)}.
          </p>

          <dl className="flex items-baseline justify-between rounded-xl bg-black/25 px-4 py-3">
            <dt className="font-extrabold">Total retour</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzd(total)}
            </dd>
          </dl>
        </>
      ) : supplierId != null ? (
        <EmptyState title="Aucun bon" hint="Choisissez le bon d'achat d'origine ci-dessus." />
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
          Annuler
        </Button>
        <Button
          onClick={() => void save()}
          disabled={busy || intakeId == null}
          className="flex-[2]"
        >
          {busy ? "Enregistrement…" : `Valider le retour · ${formatDzd(total)}`}
        </Button>
      </div>
    </div>
  );
}
