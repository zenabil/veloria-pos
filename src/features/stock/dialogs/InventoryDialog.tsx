// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useMemo, useState } from "react";

import { api } from "@shared/types/ipc-client.ts";

import { newOperationId } from "@domain/common/ids.ts";

import { Button, Field, Modal, TextInput, cn } from "@shared/ui/primitives.tsx";
import type { InventoryPreset } from "../StockScreen.tsx";
import { parseQuantityInput } from "@domain/common/quantity.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

// ---------------------------------------------------------------------------
// Inventaire (comptage) : système vs réel.
// ---------------------------------------------------------------------------

interface InventoryRowState extends InventoryPreset {
  actual: string;
}

export function InventoryDialog({
  initial,
  onClose,
  onSaved,
  notify,
}: {
  initial: InventoryPreset[];
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<InventoryRowState[]>(initial.map((r) => ({ ...r, actual: "" })));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(
    () => (needle === "" ? rows : rows.filter((r) => r.name.toLowerCase().includes(needle))),
    [rows, needle],
  );

  function diffOf(r: InventoryRowState): number | null {
    if (r.actual.trim() === "") return null;
    const v = parseQuantityInput(r.actual, { allowZero: true });
    return v == null ? null : Math.round((v - r.systemQty) * 1000) / 1000;
  }

  const counted = rows.filter((r) => diffOf(r) !== null);
  const withGap = counted.filter((r) => (diffOf(r) ?? 0) !== 0);

  function setActual(id: number, value: string): void {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, actual: value } : r)));
  }

  async function validate(): Promise<void> {
    if (reason.trim().length < 2) {
      notify("Motif d'inventaire requis (2 lettres min.).", "err");
      return;
    }
    const items: { productId: number; actualQty: number }[] = [];
    for (const r of rows) {
      if (r.actual.trim() === "") continue;
      const v = parseQuantityInput(r.actual);
      if (v == null) {
        notify(`Quantité invalide pour « ${r.name} ».`, "err");
        return;
      }
      items.push({ productId: r.id, actualQty: v });
    }
    if (items.length === 0) {
      notify("Comptez au moins un produit.", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.stockInventory({
        operationId: newOperationId(),
        items,
        reason: reason.trim(),
      })) as {
        applied: number;
        skipped: number;
      };
      notify(`Inventaire validé : ${res.applied} écart(s), ${res.skipped} conforme(s).`, "ok");
      onSaved();
    } catch (e) {
      notify(frError(e, "Inventaire impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Inventaire" title="Inventaire (comptage)" onClose={onClose} wide>
      <div className="space-y-4">
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer la liste…"
          aria-label="Filtrer les produits"
        />
        <div className="max-h-[40vh] overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Produit</th>
                <th className="px-3 py-2.5 text-right">Système</th>
                <th className="px-3 py-2.5 text-right">Réel</th>
                <th className="px-3 py-2.5 text-right">Écart</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const d = diffOf(r);
                return (
                  <tr key={r.id} className="border-t border-white/[0.06]">
                    <td className="max-w-[220px] truncate px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {r.systemQty} {r.unit}
                    </td>
                    <td className="w-32 px-3 py-2">
                      <TextInput
                        value={r.actual}
                        onChange={(e) => setActual(r.id, e.target.value)}
                        inputMode="decimal"
                        placeholder="—"
                        aria-label={`Stock réel ${r.name}`}
                        className="py-1.5 text-right"
                      />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-bold tabular-nums",
                        d == null || d === 0
                          ? "text-slate-500"
                          : d > 0
                            ? "text-emerald-300"
                            : "text-red-300",
                      )}
                    >
                      {d == null ? "—" : `${d > 0 ? "+" : ""}${d}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          {counted.length} compté(s) · {withGap.length} écart(s). Les lignes sans écart sont
          ignorées (conformes).
        </p>
        <Field label="Motif d'inventaire *">
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. : inventaire mensuel…"
            aria-label="Motif d'inventaire"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void validate()} disabled={busy} className="flex-[2]">
            {busy ? "Validation…" : "Valider l'inventaire"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Écarts + audit = une transaction atomique. « Aucun écart » refuse la validation.
        </p>
      </div>
    </Modal>
  );
}
