// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";

import { newOperationId } from "@domain/common/ids.ts";
import { buildAdjustStockPayload } from "@/application/stock/adjust-stock.ts";

import {
  adjustmentReasonCode,
  computeAdjustmentNewStock,
  type AdjustmentKind,
} from "@domain/inventory/stock-rules.ts";
import { adjustmentReasonFr } from "@shared/formatters/format.ts";
import {
  Button,
  Field,
  Modal,
  SearchField,
  Select,
  TextArea,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";

import { parseQuantityInput } from "@domain/common/quantity.ts";
import { type StockRow } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// FIX racine (audit) : le kind « inventory » est retiré — doublon du
// dialogue Inventaire (comptage complet) ; ici uniquement des mouvements unitaires.
type DialogKind = "in" | "out" | "correction";

// ---------------------------------------------------------------------------
// Ajustement de stock (avec sélecteur produit si aucun imposé).
// ---------------------------------------------------------------------------

interface PickRow {
  id: number;
  name: string;
  quantity: number;
  unit_code: string;
}

export function StockAdjustmentDialog({
  product,
  onClose,
  onSaved,
  notify,
}: {
  product: StockRow | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [picked, setPicked] = useState<StockRow | null>(product);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PickRow[]>([]);
  const [kind, setKind] = useState<DialogKind>("in");
  const [qtyText, setQtyText] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const searchTimer = useDebouncedTimer();

  useEffect(() => {
    setPicked(product);
  }, [product]);

  function onSearchChange(q: string): void {
    setSearch(q);
    if (q.trim().length < 2) {
      searchTimer.cancel();
      setResults([]);
      return;
    }
    searchTimer.schedule(250, () => {
      void api
        .stockProducts({ query: q.trim(), page: 1, pageSize: 8 })
        .then((res) => {
          setResults((res as { rows: PickRow[] }).rows);
        })
        .catch((err: unknown) => {
          console.error("[Veloria] ajustement : recherche produit illisible", err);
          setResults([]);
        });
    });
  }

  const qty = parseQuantityInput(qtyText.trim() === "" ? "0" : qtyText, { allowZero: true });
  const toKind: AdjustmentKind = kind === "in" ? "in" : kind === "out" ? "out" : "set";
  let newStock: number | null = null;
  let previewErr = "";
  if (picked && qty != null) {
    try {
      newStock = computeAdjustmentNewStock({
        currentQty: picked.quantity,
        kind: toKind,
        quantity: qty,
      });
    } catch (e) {
      previewErr = frError(e, "Ajustement invalide.");
    }
  }

  async function save(): Promise<void> {
    if (!picked) {
      notify("Choisissez un produit.", "err");
      return;
    }
    if (qty == null) {
      notify("Quantité invalide (0 – 1 000 000).", "err");
      return;
    }
    // Slice stock : la charge `stock.adjust` est construite par le use-case
    // applicatif (mêmes règles, mêmes messages — aucun changement de comportement).
    const prefix = adjustmentReasonFr(adjustmentReasonCode(toKind, "adjust"));
    let payload: {
      operationId: string;
      productId: number;
      newQuantity: number;
      reason: string;
      reference: string | null;
    };
    try {
      payload = buildAdjustStockPayload({
        productId: picked.id,
        currentQty: picked.quantity,
        kind: toKind,
        quantity: qty,
        reasonPrefix: prefix,
        reason,
        notes,
        reference,
        operationId: newOperationId(),
      });
    } catch (e) {
      notify(frError(e, "Ajustement invalide."), "err");
      return;
    }
    const target = payload.newQuantity;
    setBusy(true);
    try {
      await api.stockAdjust(payload);
      notify(`Stock ajusté : ${picked.name} → ${target}.`, "ok");
      // P5 : ajustement validé = succès.
      playSound("success");
      onSaved();
    } catch (e) {
      notify(frError(e, "Ajustement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label="Ajustement de stock"
      title={picked ? `Ajuster — ${picked.name}` : "Ajustement de stock"}
      onClose={onClose}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {picked ? (
          <dl className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-3 text-sm">
            <div className="min-w-0">
              <dt className="truncate font-bold">{picked.name}</dt>
              <dd className="text-xs text-slate-500">
                Stock actuel :{" "}
                <strong className="tabular-nums text-slate-200">
                  {picked.quantity} {picked.unit_code}
                </strong>
              </dd>
            </div>
            {product == null ? (
              <button
                type="button"
                onClick={() => {
                  setPicked(null);
                  setSearch("");
                  setResults([]);
                }}
                className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Changer
              </button>
            ) : null}
          </dl>
        ) : (
          <Field label="Produit">
            <SearchField
              value={search}
              onChange={onSearchChange}
              placeholder="Rechercher un produit… (min. 2 lettres)"
              ariaLabel="Rechercher un produit"
            />
            {results.length > 0 ? (
              <ul className="mt-2 max-h-36 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(r as StockRow);
                        setSearch("");
                        setResults([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                    >
                      <span className="truncate font-semibold">{r.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400">
                        {r.quantity} {r.unit_code}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type d'ajustement">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as DialogKind)}
              aria-label="Type d'ajustement"
            >
              <option value="in">Entrée</option>
              <option value="out">Sortie</option>
              <option value="correction">Correction</option>
            </Select>
          </Field>
          <Field
            label={kind === "correction" ? "Nouveau stock" : "Quantité"}
            hint={
              kind === "correction" ? "Valeur absolue après comptage." : "Strictement positive."
            }
          >
            <TextInput
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label="Quantité"
            />
          </Field>
        </div>

        <dl className="flex items-baseline justify-between rounded-xl bg-black/25 px-4 py-3 text-sm">
          <dt className="font-extrabold">Nouveau stock</dt>
          <dd
            className={cn(
              "text-xl font-extrabold tabular-nums",
              previewErr !== "" ? "text-red-300" : "text-amber-300",
            )}
          >
            {previewErr !== ""
              ? previewErr
              : newStock == null
                ? "—"
                : `${newStock} ${picked?.unit_code ?? ""}`}
          </dd>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Motif *">
            <TextInput
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. : casse, don…"
              aria-label="Motif"
            />
          </Field>
          <Field label="Référence" hint="Optionnel (tracée).">
            <TextInput
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex. : INV-2026-09"
              aria-label="Référence"
            />
          </Field>
        </div>
        <Field label="Notes" hint="Optionnel (ajoutées au motif).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Précisez le motif…"
            aria-label="Notes"
          />
        </Field>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy || !picked || newStock == null} className="flex-[2]">
            {busy ? "Enregistrement…" : "Enregistrer l'ajustement"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Produit + mouvement + audit = une transaction atomique. La sortie ne passe jamais sous
          zéro.
        </p>
      </form>
    </Modal>
  );
}
