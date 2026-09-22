// Veloria PoS — Stock : réception + détail + ajustement + historique + inventaire.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useRef, useState } from "react";
import { PackagePlus, Search } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";

import { Button, Card, Field, Modal, TextArea, TextInput } from "@shared/ui/primitives.tsx";

import { parseQtyInput, suggestIntakeInvoiceNumber } from "../types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";

// ---------------------------------------------------------------------------
// Réception fournisseur : facture directe + livraison + coût unitaire.
// Backend atomique existant (stock.intake) : entrée + lignes + mouvements +
// quantités + solde fournisseur + audit = 1 transaction.
// ---------------------------------------------------------------------------

interface IntakeLine {
  key: number;
  productId: number | null;
  productName: string;
  unit: string;
  received: string;
  damaged: string;
  price: string;
  /** Prix de vente par ligne (DZD, saisie FR) : vide = conserver l'actuel. */
  selling: string;
  search: string;
  results: { id: number; name: string; unit_code: string; quantity: number }[];
}

let intakeKey = 1;

function emptyIntakeLine(): IntakeLine {
  intakeKey += 1;
  return {
    key: intakeKey,
    productId: null,
    productName: "",
    unit: "PIECE",
    received: "1",
    damaged: "0",
    price: "",
    selling: "",
    search: "",
    results: [],
  };
}

export function StockIntakeDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierLabel, setSupplierLabel] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<
    { id: number; name: string; code: string | null }[]
  >([]);
  const supplierTimer = useRef<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayUtcDate());
  const [shipping, setShipping] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<IntakeLine[]>([emptyIntakeLine()]);
  const [busy, setBusy] = useState(false);
  // Clé d'idempotence stable par facture (générée à l'ouverture) : un double-clic
  // ou un retry IPC rejoue le même operationId → la réception n'est créée qu'une fois.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  async function searchSuppliers(q: string = supplierQ): Promise<void> {
    try {
      const res = (await api.supplierSearch({
        query: q.trim(),
        page: 1,
        pageSize: 8,
      })) as { rows: { id: number; name: string; code: string | null }[] };
      setSupplierResults(res.rows.map((s) => ({ id: s.id, name: s.name, code: s.code ?? null })));
    } catch {
      setSupplierResults([]);
    }
  }

  // Liste initiale : les premiers fournisseurs sont visibles dès l'ouverture
  // (un clic suffit quand il y en a peu). Recherche en direct au-delà.
  useEffect(() => {
    void searchSuppliers("");
    return () => {
      if (supplierTimer.current != null) window.clearTimeout(supplierTimer.current);
    };
  }, []);

  function onSupplierQChange(q: string): void {
    setSupplierQ(q);
    if (supplierTimer.current != null) window.clearTimeout(supplierTimer.current);
    // Vide = retour à la liste initiale ; 1 lettre = on garde la liste ;
    // 2+ = recherche serveur (debounce comme les autres écrans).
    if (q.trim() === "") {
      supplierTimer.current = window.setTimeout(() => {
        void searchSuppliers("");
      }, 150);
    } else if (q.trim().length >= 2) {
      supplierTimer.current = window.setTimeout(() => {
        void searchSuppliers(q);
      }, 250);
    }
  }

  function pickSupplier(s: { id: number; name: string; code: string | null }): void {
    setSupplierId(s.id);
    setSupplierLabel(s.name);
    setSupplierResults([]);
    setSupplierQ("");
    // Numéro de facture suggéré à la sélection (modififiable) — seulement
    // si le champ est encore vide (ne jamais écraser la saisie).
    if (invoiceNumber.trim() === "") {
      setInvoiceNumber(suggestIntakeInvoiceNumber(s.code));
    }
  }

  async function searchProducts(key: number, q: string): Promise<void> {
    if (q.trim().length < 2) {
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: [] } : l)));
      return;
    }
    try {
      const res = (await api.stockProducts({ query: q.trim(), page: 1, pageSize: 8 })) as {
        rows: { id: number; name: string; unit_code: string; quantity: number }[];
      };
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: res.rows } : l)));
    } catch {
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, results: [] } : l)));
    }
  }

  function patchLine(key: number, patch: Partial<IntakeLine>): void {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  // P1-5 : parse strict (bornes H-1, jamais NaN). Invalide → -1 sentinelle :
  // tous les gardes existants (`isInteger && >= 0`) le rejettent, le type
  // reste `number` pour les calculs aval.
  function strictOrNum(raw: string): number {
    try {
      return parseDzdInputStrict(raw, "Montant");
    } catch {
      return -1;
    }
  }

  const parsed = lines.map((l) => {
    const received = parseQtyInput(l.received.trim() === "" ? "0" : l.received);
    const damaged = parseQtyInput(l.damaged.trim() === "" ? "0" : l.damaged);
    const price = strictOrNum(l.price.trim() === "" ? "0" : l.price);
    // Saisie vide = null (conserver) ; sinon centimes validés (>= 0).
    const sellingRaw = l.selling.trim();
    const selling = sellingRaw === "" ? null : strictOrNum(sellingRaw);
    const sellingOk = selling === null || (Number.isInteger(selling) && selling >= 0);
    const net =
      received != null && damaged != null ? Math.round((received - damaged) * 1000) / 1000 : null;
    const lineTotal =
      net != null && Number.isInteger(price) && price >= 0 && net > 0 ? Math.round(price * net) : 0;
    const name = l.productId != null ? l.productName : l.productName.trim();
    const valid =
      name.length > 0 &&
      received != null &&
      received > 0 &&
      damaged != null &&
      damaged >= 0 &&
      (net ?? 0) >= 0 &&
      damaged <= received &&
      Number.isInteger(price) &&
      price >= 0 &&
      sellingOk;
    return { ...l, received, damaged, price, selling, net, lineTotal, valid, sellingOk };
  });
  const subtotal = parsed.reduce((a, l) => a + (l.valid ? l.lineTotal : 0), 0);
  const shippingMinor = shipping.trim() === "" ? 0 : strictOrNum(shipping);
  const shippingOk = Number.isInteger(shippingMinor) && shippingMinor >= 0;
  const total = shippingOk ? subtotal + shippingMinor : subtotal;
  const withLanding = parsed.map((l) => {
    if (!l.valid || (l.net ?? 0) <= 0) return { ...l, share: 0, landing: l.price };
    const share =
      subtotal > 0 && shippingOk ? Math.round((shippingMinor * l.lineTotal) / subtotal) : 0;
    const landing = Math.round((l.lineTotal + share) / (l.net as number));
    return { ...l, share, landing };
  });

  async function save(): Promise<void> {
    if (busy) return;
    if (invoiceDate === "") {
      notify("Date de facture requise.", "err");
      return;
    }
    if (!shippingOk) {
      notify("Frais de livraison invalides.", "err");
      return;
    }
    const badSelling = withLanding.find((l) => l.valid && !l.sellingOk);
    if (badSelling) {
      notify("Prix de vente invalide (montant >= 0 ou vide).", "err");
      return;
    }
    const clean = withLanding.filter((l) => l.valid);
    if (clean.length === 0) {
      notify("Ajoutez au moins une ligne valide (produit + quantité + prix).", "err");
      return;
    }
    setBusy(true);
    try {
      const res = (await api.stockIntake({
        operationId,
        supplierId,
        invoiceNumber: invoiceNumber.trim() === "" ? null : invoiceNumber.trim(),
        invoiceDate,
        shippingMinor,
        notes: notes.trim() === "" ? null : notes.trim(),
        lines: clean.map((l) => ({
          productId: l.productId,
          productName: l.productId != null ? l.productName : l.productName.trim(),
          quantityReceived: Number(l.received),
          quantityDamaged: typeof l.damaged === "number" ? l.damaged : 0,
          purchasePriceMinor: l.price,
          sellingPriceMinor: l.selling,
        })),
      })) as { intakeId: number; totalMinor: number };
      notify(`Réception #${res.intakeId} enregistrée : ${formatDzd(res.totalMinor)}.`, "ok");
      // P5 : réception validée = succès.
      playSound("success");
      // Facture suivante = nouvelle clé (la clé actuelle reste liée à la facture créée).
      setOperationId(newOperationId());
      onSaved();
    } catch (e) {
      // Échec : on conserve le même operationId pour que le retry soit idempotent.
      notify(frError(e, "Réception impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Réception fournisseur" title="Réception — facture directe" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Fournisseur" hint="Optionnel (alimente sa dette).">
          {supplierId != null ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-4 py-2.5 text-sm">
              <span className="truncate font-semibold">{supplierLabel}</span>
              <button
                type="button"
                onClick={() => {
                  setSupplierId(null);
                  setSupplierLabel("");
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
                    value={supplierQ}
                    onChange={(e) => onSupplierQChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void searchSuppliers(supplierQ);
                      }
                    }}
                    placeholder="Rechercher… (liste affichée par défaut)"
                    aria-label="Rechercher un fournisseur"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void searchSuppliers(supplierQ)}
                >
                  <Search size={15} aria-hidden="true" />
                </Button>
              </div>
              {supplierResults.length > 0 ? (
                <ul className="mt-2 max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                  {supplierResults.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => pickSupplier(s)}
                        className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : supplierQ.trim().length >= 2 ? (
                <p className="mt-2 text-xs text-slate-400">
                  Aucun fournisseur trouvé — créez-le dans « Fournisseurs ».
                </p>
              ) : null}
            </>
          )}
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="N° facture" hint="Optionnel (suggéré au choix du fournisseur).">
            <TextInput
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Ex. : FAC-FOU-001"
              aria-label="Numéro de facture"
            />
          </Field>
          <Field label="Date facture *">
            <TextInput
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              aria-label="Date de facture"
            />
          </Field>
          <Field label="Livraison (DZD) *" hint="Répartie au prorata.">
            <TextInput
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Frais de livraison"
            />
          </Field>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold">Lignes ({lines.length})</h4>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setLines((p) => [...p, emptyIntakeLine()])}
            >
              <PackagePlus size={15} aria-hidden="true" /> Ligne
            </Button>
          </div>
          {withLanding.map((l, idx) => (
            <Card key={l.key} className="space-y-2.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">Ligne {idx + 1}</strong>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    className="text-xs font-semibold text-red-300 hover:text-red-200"
                  >
                    Retirer
                  </button>
                ) : null}
              </div>
              {l.productId == null ? (
                <>
                  <TextInput
                    value={l.search}
                    onChange={(e) => {
                      patchLine(l.key, { search: e.target.value });
                      void searchProducts(l.key, e.target.value);
                    }}
                    placeholder="Rechercher un produit… ou saisir un nom libre ci-dessous"
                    aria-label={`Rechercher produit ligne ${idx + 1}`}
                  />
                  {l.results.length > 0 ? (
                    <ul className="max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                      {l.results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() =>
                              patchLine(l.key, {
                                productId: r.id,
                                productName: r.name,
                                unit: r.unit_code,
                                results: [],
                                search: "",
                              })
                            }
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
                </>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">{l.productName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      patchLine(l.key, { productId: null, productName: "", search: "" })
                    }
                    className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Changer
                  </button>
                </div>
              )}
              <Field label="Produit (libre si besoin)">
                <TextInput
                  value={lines[idx]?.productName ?? ""}
                  onChange={(e) => patchLine(l.key, { productName: e.target.value })}
                  placeholder="Nom du produit"
                  aria-label={`Produit ligne ${idx + 1}`}
                  disabled={l.productId != null}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="Reçue *">
                  <TextInput
                    value={lines[idx]?.received ?? ""}
                    onChange={(e) => patchLine(l.key, { received: e.target.value })}
                    inputMode="decimal"
                    aria-label={`Quantité reçue ligne ${idx + 1}`}
                  />
                </Field>
                <Field label="Abîmée">
                  <TextInput
                    value={lines[idx]?.damaged ?? ""}
                    onChange={(e) => patchLine(l.key, { damaged: e.target.value })}
                    inputMode="decimal"
                    aria-label={`Quantité abîmée ligne ${idx + 1}`}
                  />
                </Field>
                <Field label="Prix achat (DZD) *">
                  <TextInput
                    value={lines[idx]?.price ?? ""}
                    onChange={(e) => patchLine(l.key, { price: e.target.value })}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label={`Prix achat ligne ${idx + 1}`}
                  />
                </Field>
                <Field label="Prix de vente (DZD)" hint="Vide = conserver.">
                  <TextInput
                    value={lines[idx]?.selling ?? ""}
                    onChange={(e) => patchLine(l.key, { selling: e.target.value })}
                    inputMode="decimal"
                    placeholder="—"
                    aria-label={`Prix de vente ligne ${idx + 1}`}
                  />
                </Field>
              </div>
              <p className="text-xs tabular-nums text-slate-400">
                Net : {l.net ?? "—"} · Ligne : {formatDzd(l.valid ? l.lineTotal : 0)} · Livraison :{" "}
                {formatDzd(l.share)} ·{" "}
                <strong className="text-amber-200">Coût unitaire : {formatDzd(l.landing)}</strong> ·
                Vente :{" "}
                {l.selling == null ? (
                  <span title="Prix actuel conservé">conservé</span>
                ) : (
                  <strong className="text-emerald-200">{formatDzd(l.selling)}</strong>
                )}
              </p>
            </Card>
          ))}
        </div>
        <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
          <div className="flex justify-between text-slate-300">
            <dt>Sous-total</dt>
            <dd className="font-bold tabular-nums">{formatDzd(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-slate-300">
            <dt>Livraison</dt>
            <dd className="font-bold tabular-nums">
              {shippingOk ? formatDzd(shippingMinor) : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
            <dt className="font-extrabold">Total réception</dt>
            <dd className="text-xl font-extrabold tabular-nums text-amber-300">
              {formatDzd(total)}
            </dd>
          </div>
        </dl>
        <Field label="Notes" hint="Optionnel.">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Détail libre…"
            aria-label="Notes de réception"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={() => void save()} disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : "Valider la réception"}
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Réception atomique : stock + mouvements + dette fournisseur + audit. La correction se fait
          depuis « Ajustement » ou « Inventaire ».
        </p>
      </div>
    </Modal>
  );
}
