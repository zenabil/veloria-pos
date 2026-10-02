// Veloria PoS — Stock : import depuis facture via OCR 100 % local.
// Pipeline : fichier → OCR main → texte → parsing/matching (domaine, ici) →
// RELECTURE humaine obligatoire → `stock.intake` existant (transaction).
// L'OCR ne crée ni produit ni fournisseur sans validation explicite.

import { useEffect, useRef, useState } from "react";
import { FileScan, Plus, Search, Trash2, X } from "lucide-react";
import { api, ocrOnProgress } from "@shared/types/ipc-client.ts";
import { callChecked, productsMatchBatchSchema } from "@shared/types/ipc-contracts.ts";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { formatBytes } from "@shared/formatters/files.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
import { parseInvoiceText } from "@domain/ocr/parser.ts";
import { confidenceLabelFr, matchByName, normalizeProductName } from "@domain/ocr/matcher.ts";
import { parseOcrQuantity } from "@domain/ocr/numbers.ts";
import type {
  OcrConfidence,
  OcrInvoice,
  OcrMatchCandidate,
  OcrMatchKind,
} from "@domain/ocr/types.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  TextInput,
  cn,
} from "@shared/ui/primitives.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { frError } from "@shared/errors/fr-map.ts";

type Step = "fichier" | "analyse" | "verification";

interface OcrFileMeta {
  fileId: string;
  name: string;
  size: number;
  kind: "image" | "pdf";
  pageCount: number | null;
  previewDataUrl: string | null;
}

interface ReviewRow {
  key: number;
  ocrName: string;
  ocrBarcode: string | null;
  productId: number | null;
  productLabel: string;
  productPriceMinor: number | null;
  qtyText: string;
  purchaseText: string;
  sellingText: string;
  unit: string;
  confidence: OcrConfidence;
  matchKind: OcrMatchKind;
  createNew: boolean;
}

interface ProductHit {
  id: number;
  name: string;
  selling_price_minor: number;
  purchase_price_minor: number;
  quantity: number;
  unit_code: string;
}

let rowSeq = 0;
const nextKey = (): number => {
  rowSeq += 1;
  return rowSeq;
};

const MAX_REVIEW_ROWS = 150;

function minorToFixedInput(minor: number | null): string {
  if (minor === null) return "";
  // Saisie OCR : 2 décimales fixes (« 12,50 ») — distinct de `minorToInput`
  // du domaine (« 12,5 ») ; les deux se reconvertissent via parseDzdInputStrict.
  // RADICAL-FIX: arithmétique entière (pas de float) — centimes → « dzd,cc ».
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const dzd = Math.trunc(abs / 100);
  const cc = String(abs % 100).padStart(2, "0");
  return `${sign}${dzd},${cc}`;
}

function toneFor(c: OcrConfidence): "green" | "amber" | "grey" {
  if (c === "high") return "green";
  if (c === "medium") return "amber";
  return "grey";
}

function matchLabel(kind: OcrMatchKind): string {
  if (kind === "barcode") return "Code-barres";
  if (kind === "exact") return "Exact";
  if (kind === "normalized") return "Normalisé";
  if (kind === "fuzzy") return "Approximatif";
  return "Aucun";
}

export function OcrImportDialog({
  onClose,
  onSaved,
  notify,
}: {
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [step, setStep] = useState<Step>("fichier");
  const [file, setFile] = useState<OcrFileMeta | null>(null);
  const [picking, setPicking] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ phase: "", page: 0, pages: 1, ratio: 0 });
  const [parsed, setParsed] = useState<OcrInvoice | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayUtcDate());
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierLabel, setSupplierLabel] = useState("");
  const [supplierQ, setSupplierQ] = useState("");
  const [supplierResults, setSupplierResults] = useState<{ id: number; name: string }[]>([]);
  const [duplicateWarn, setDuplicateWarn] = useState(false);
  // Anti-tempête : la vérification de doublon (100 réceptions) est débouncée,
  // jamais à chaque frappe (même idiome que les recherches des écrans).
  const duplicateTimer = useDebouncedTimer();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickerQ, setPickerQ] = useState("");
  const [pickerResults, setPickerResults] = useState<ProductHit[]>([]);
  // Ergonomie relecture : filtre confiance + sélection groupée.
  const [rowFilter, setRowFilter] = useState<"all" | "review" | "unmatched">("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const mounted = useRef(true);
  const fileRef = useRef<string | null>(null);
  /** Lecture anti-rétrécissement TS : muté par le démontage (autre flux). */
  const alive = (): boolean => mounted.current;

  useEffect(() => {
    mounted.current = true;
    let off: (() => void) | undefined;
    try {
      off = ocrOnProgress((v) => {
        if (v.fileId !== fileRef.current) return;
        setProgress({ phase: v.phase, page: v.page, pages: v.pages, ratio: v.progress });
      });
    } catch {
      off = undefined;
    }
    return () => {
      mounted.current = false;
      try {
        off?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function safeClose(): void {
    const id = fileRef.current;
    fileRef.current = null;
    if (id !== null) void api.ocrDispose({ fileId: id }).catch(() => undefined);
    onClose();
  }

  async function pick(): Promise<void> {
    if (picking) return;
    setPicking(true);
    try {
      if (fileRef.current !== null) {
        await api.ocrDispose({ fileId: fileRef.current }).catch(() => undefined);
        fileRef.current = null;
      }
      const res = (await api.ocrSelectFile()) as {
        cancelled: boolean;
        fileId?: string;
        name?: string;
        size?: number;
        kind?: "image" | "pdf";
        pageCount?: number | null;
        previewDataUrl?: string | null;
      };
      if (res.cancelled || !mounted.current) return;
      if (typeof res.fileId !== "string") throw new Error("Sélection du document impossible.");
      fileRef.current = res.fileId;
      setFile({
        fileId: res.fileId,
        name: typeof res.name === "string" ? res.name : "facture",
        size: typeof res.size === "number" ? res.size : 0,
        kind: res.kind === "pdf" ? "pdf" : "image",
        pageCount: typeof res.pageCount === "number" ? res.pageCount : null,
        previewDataUrl: typeof res.previewDataUrl === "string" ? res.previewDataUrl : null,
      });
      setParsed(null);
      setRows([]);
      setStep("fichier");
    } catch (e) {
      notify(frError(e, "Sélection du document impossible."), "err");
    } finally {
      if (mounted.current) setPicking(false);
    }
  }

  function toCandidate(h: ProductHit): OcrMatchCandidate {
    return {
      productId: h.id,
      name: h.name,
      sellingPriceMinor: h.selling_price_minor,
      purchasePriceMinor: h.purchase_price_minor,
      quantity: h.quantity,
    };
  }

  /**
   * Appariement par lot : UNE traversée IPC pour toutes les lignes (au lieu
   * d'un aller-retour code-barres + recherche par ligne). Le main retourne les
   * candidats, le flou (`matchByName`) reste local. Contrat validé.
   */
  async function matchBatch(
    lines: { name: string; barcode: string | null }[],
  ): Promise<{ product: ProductHit | null; kind: OcrMatchKind; confidence: OcrConfidence }[]> {
    if (lines.length === 0) return [];
    try {
      const res = await callChecked(
        (a) =>
          a.products.matchBatch({
            items: lines.map((l) => ({ barcode: l.barcode, name: l.name.slice(0, 60) })),
          }),
        productsMatchBatchSchema,
      );
      return res.results.map((r, i) => {
        const line = lines[i] as { name: string; barcode: string | null };
        if (r.barcodeHit !== null) {
          return {
            product: r.barcodeHit as unknown as ProductHit,
            kind: "barcode" as OcrMatchKind,
            confidence: "high" as OcrConfidence,
          };
        }
        if (line.name.trim().length < 2) {
          return {
            product: null,
            kind: "none" as OcrMatchKind,
            confidence: "low" as OcrConfidence,
          };
        }
        const m = matchByName(
          line.name,
          r.candidates.map((c) => toCandidate(c as unknown as ProductHit)),
        );
        if (m.product === null) {
          return {
            product: null,
            kind: "none" as OcrMatchKind,
            confidence: "low" as OcrConfidence,
          };
        }
        const full =
          (r.candidates.find((x) => x.id === m.product?.productId) as unknown as
            | ProductHit
            | undefined) ?? null;
        return { product: full, kind: m.kind, confidence: m.confidence };
      });
    } catch {
      // Repli : aucune correspondance, relecture manuelle des lignes.
      return lines.map(() => ({
        product: null,
        kind: "none" as OcrMatchKind,
        confidence: "low" as OcrConfidence,
      }));
    }
  }

  async function analyze(): Promise<void> {
    if (file === null || analyzing) return;
    setAnalyzing(true);
    setProgress({ phase: "preparation", page: 0, pages: 1, ratio: 0 });
    setStep("analyse");
    try {
      const res = (await api.ocrAnalyze({ fileId: file.fileId, languages: ["fra", "eng"] })) as {
        text: string;
      };
      const invoice = parseInvoiceText(typeof res.text === "string" ? res.text : "");
      if (!mounted.current) return;
      if (invoice.lines.length === 0) {
        notify("Aucune ligne produit détectée : vérifiez l'image.", "err");
        setStep("fichier");
        return;
      }
      const usable = invoice.lines.slice(0, MAX_REVIEW_ROWS);
      if (invoice.lines.length > MAX_REVIEW_ROWS) {
        notify(`Facture longue : ${MAX_REVIEW_ROWS} premières lignes conservées.`, "err");
      }
      const matched = (
        await matchBatch(usable.map((l) => ({ name: l.name, barcode: l.barcode })))
      ).map((m, i) => {
        const l = usable[i] as (typeof usable)[number];
        const row: ReviewRow = {
          key: nextKey(),
          ocrName: l.name,
          ocrBarcode: l.barcode,
          productId: m.product?.id ?? null,
          productLabel: m.product?.name ?? "",
          productPriceMinor: m.product?.selling_price_minor ?? null,
          qtyText: l.quantity === null ? "" : String(l.quantity),
          purchaseText: minorToFixedInput(l.unitPriceMinor),
          sellingText: "",
          unit: l.unit,
          confidence: m.product === null ? l.confidence : m.confidence,
          matchKind: m.product === null ? "none" : m.kind,
          createNew: false,
        };
        return row;
      });
      if (!alive()) return;
      setParsed(invoice);
      setRows(matched);
      setInvoiceNumber(invoice.number ?? "");
      setInvoiceDate(invoice.date ?? todayUtcDate());
      setSupplierId(null);
      setSupplierLabel("");
      setDuplicateWarn(false);
      if (invoice.supplierName) {
        void suggestSupplier(invoice.supplierName);
      }
      void checkDuplicate(null, invoice.number);
      setStep("verification");
    } catch (e) {
      if (!mounted.current) return;
      notify(frError(e, "Analyse OCR impossible."), "err");
      setStep("fichier");
    } finally {
      if (mounted.current) setAnalyzing(false);
    }
  }

  async function suggestSupplier(name: string): Promise<void> {
    try {
      const res = (await api.supplierSearch({
        query: name.slice(0, 60),
        page: 1,
        pageSize: 5,
      })) as {
        rows: { id: number; name: string }[];
      };
      const hit = res.rows.find((r) => normalizeProductName(r.name) === normalizeProductName(name));
      if (hit && mounted.current) {
        setSupplierId(hit.id);
        setSupplierLabel(hit.name);
        void checkDuplicate(hit.id, invoiceNumber || parsed?.number);
      }
    } catch {
      /* suggestion optionnelle */
    }
  }

  async function checkDuplicate(
    supId: number | null,
    number: string | null | undefined,
  ): Promise<void> {
    try {
      if (supId === null || !number || number.trim().length < 2) {
        if (mounted.current) setDuplicateWarn(false);
        return;
      }
      const res = (await api.stockIntakes({ page: 1, pageSize: 100 })) as {
        rows: { invoice_number: string | null; supplier_id: number | null }[];
      };
      const norm = number.trim().toLowerCase();
      const found = res.rows.some(
        (r) =>
          r.supplier_id === supId &&
          typeof r.invoice_number === "string" &&
          r.invoice_number.trim().toLowerCase() === norm,
      );
      if (mounted.current) setDuplicateWarn(found);
    } catch {
      /* avertissement optionnel */
    }
  }

  async function searchSuppliers(): Promise<void> {
    if (supplierQ.trim().length < 2) return;
    try {
      const res = (await api.supplierSearch({ query: supplierQ.trim(), page: 1, pageSize: 8 })) as {
        rows: { id: number; name: string }[];
      };
      setSupplierResults(res.rows);
    } catch {
      setSupplierResults([]);
    }
  }

  async function searchProductsForPicker(q: string): Promise<void> {
    setPickerQ(q);
    if (q.trim().length < 2) {
      setPickerResults([]);
      return;
    }
    try {
      const res = (await api.productSearch({
        query: q.trim().slice(0, 60),
        page: 1,
        pageSize: 8,
      })) as {
        rows: ProductHit[];
      };
      setPickerResults(res.rows);
    } catch {
      setPickerResults([]);
    }
  }

  function patchRow(key: number, patch: Partial<ReviewRow>): void {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function assignProduct(key: number, h: ProductHit): void {
    patchRow(key, {
      productId: h.id,
      productLabel: h.name,
      productPriceMinor: h.selling_price_minor,
      confidence: "high",
      matchKind: "exact",
      createNew: false,
    });
    setPickerFor(null);
    setPickerQ("");
    setPickerResults([]);
  }

  /** Assignation groupée : même produit à toutes les lignes cochées. */
  function assignBulk(h: ProductHit): void {
    if (selected.size === 0) return;
    setRows((prev) =>
      prev.map((r) =>
        selected.has(r.key)
          ? {
              ...r,
              productId: h.id,
              productLabel: h.name,
              productPriceMinor: h.selling_price_minor,
              confidence: "high" as OcrConfidence,
              matchKind: "exact" as OcrMatchKind,
              createNew: false,
            }
          : r,
      ),
    );
    setSelected(new Set());
    setBulkOpen(false);
    setPickerQ("");
    setPickerResults([]);
    notify(`${selected.size} ligne(s) associée(s) à « ${h.name} ».`, "ok");
  }

  function toggleSelect(key: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function visibleRows(list: ReviewRow[]): ReviewRow[] {
    if (rowFilter === "unmatched") return list.filter((r) => r.productId === null);
    if (rowFilter === "review")
      return list.filter((r) => r.productId === null || r.confidence !== "high");
    return list;
  }

  function addManualRow(): void {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey(),
        ocrName: "",
        ocrBarcode: null,
        productId: null,
        productLabel: "",
        productPriceMinor: null,
        qtyText: "1",
        purchaseText: "",
        sellingText: "",
        unit: "PIECE",
        confidence: "low",
        matchKind: "none",
        createNew: false,
      },
    ]);
  }

  function parsedQty(r: ReviewRow): number | null {
    if (r.qtyText.trim() === "") return null;
    return parseOcrQuantity(r.qtyText);
  }

  function parsedPurchase(r: ReviewRow): number | null {
    if (r.purchaseText.trim() === "") return null;
    // P1-5 : strict (bornes H-1) ; invalide → null (ligne signalée).
    try {
      return parseDzdInputStrict(r.purchaseText, "Prix d'achat");
    } catch {
      return null;
    }
  }

  function parsedSelling(r: ReviewRow): number | null {
    if (r.sellingText.trim() === "") return null;
    try {
      return parseDzdInputStrict(r.sellingText, "Prix de vente");
    } catch {
      return null;
    }
  }

  function rowError(r: ReviewRow): string | null {
    if (r.createNew) {
      if (r.ocrName.trim().length < 2) return "Nom requis (création).";
    } else if (r.productId === null) {
      return "Produit non lié.";
    }
    if (parsedQty(r) === null) return "Quantité invalide.";
    if (r.purchaseText.trim() !== "" && parsedPurchase(r) === null) return "Prix d'achat invalide.";
    if (r.sellingText.trim() !== "" && parsedSelling(r) === null) return "Prix de vente invalide.";
    return null;
  }

  async function importIntoStock(): Promise<void> {
    if (importing) return;
    if (invoiceDate === "") {
      notify("Date de facture requise.", "err");
      return;
    }
    const usable = rows.filter((r) => rowError(r) === null);
    if (usable.length === 0) {
      notify("Aucune ligne valide à importer (liez chaque produit).", "err");
      return;
    }
    const bad = rows.length - usable.length;
    setImporting(true);
    try {
      const lines: {
        productId: number | null;
        productName: string;
        quantityReceived: number;
        quantityDamaged: number;
        purchasePriceMinor: number;
        sellingPriceMinor: number | null;
      }[] = [];
      for (const r of usable) {
        const qty = parsedQty(r);
        const purchase = parsedPurchase(r);
        const selling = parsedSelling(r);
        if (qty === null || purchase === null) continue;
        let pid = r.productId;
        if (r.createNew) {
          const created = (await api.productCreate({
            // Un UUID par produit créé (import rejoué = produits retrouvés).
            operationId: newOperationId(),
            name: r.ocrName.trim().slice(0, 200),
            purchasePriceMinor: purchase,
            sellingPriceMinor: selling ?? 0,
            quantity: 0,
          })) as { id: number };
          pid = created.id;
        }
        lines.push({
          productId: pid,
          productName:
            pid !== null ? (r.createNew ? r.ocrName.trim() : r.productLabel) : r.ocrName.trim(),
          quantityReceived: qty,
          quantityDamaged: 0,
          purchasePriceMinor: purchase,
          sellingPriceMinor: selling,
        });
      }
      if (lines.length === 0) throw new Error("Aucune ligne valide à importer.");
      const res = (await api.stockIntake({
        operationId: newOperationId(),
        supplierId,
        invoiceNumber: invoiceNumber.trim() === "" ? null : invoiceNumber.trim().slice(0, 100),
        invoiceDate,
        shippingMinor: 0,
        notes: file !== null ? `Import OCR — ${file.name}`.slice(0, 500) : "Import OCR",
        lines,
      })) as { intakeId: number; totalMinor: number };
      notify(
        `Réception #${res.intakeId} importée : ${formatDzd(res.totalMinor)}.${bad > 0 ? ` (${bad} ligne(s) ignorée(s))` : ""}`,
        "ok",
      );
      onSaved();
    } catch (e) {
      notify(frError(e, "Import impossible."), "err");
    } finally {
      if (mounted.current) setImporting(false);
    }
  }

  async function cancelAnalyze(): Promise<void> {
    if (file === null) return;
    try {
      await api.ocrCancel({ fileId: file.fileId });
    } catch {
      /* l'analyse se terminera avec l'erreur d'annulation */
    }
  }

  const validCount = rows.filter((r) => rowError(r) === null).length;

  return (
    <Modal
      label="Import OCR facture"
      title="Importer depuis facture (OCR local)"
      onClose={safeClose}
      wide
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Étapes : fichier → analyse locale → vérification → import. 100&nbsp;% hors-ligne, aucune
          donnée envoyée. L'OCR suggère, <strong>vous décidez</strong>.
        </p>

        {step === "fichier" ? (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void pick()} disabled={picking}>
                <FileScan size={16} aria-hidden="true" />
                {picking
                  ? "Ouverture…"
                  : file === null
                    ? "Choisir une image / PDF"
                    : "Choisir un autre"}
              </Button>
              {file !== null ? (
                <Button
                  variant="secondary"
                  onClick={() => void analyze()}
                  title="Lancer la reconnaissance locale"
                >
                  Analyser la facture
                </Button>
              ) : null}
            </div>
            {file === null ? (
              <EmptyState
                title="Aucun document"
                hint="JPG, PNG (recommandé) ou PDF avec texte — 15 Mo maximum, traité sur cet ordinateur."
              />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-semibold">{file.name}</span>
                  <span className="text-xs tabular-nums text-slate-400">
                    {formatBytes(file.size)}
                    {file.kind === "pdf" && file.pageCount !== null
                      ? ` · ${file.pageCount} page(s)`
                      : ""}
                  </span>
                </div>
                {file.kind === "image" && file.previewDataUrl ? (
                  <img
                    src={file.previewDataUrl}
                    alt={`Aperçu ${file.name}`}
                    className="max-h-72 w-full rounded-xl border border-white/10 bg-black/30 object-contain"
                    draggable={false}
                  />
                ) : (
                  <p className="rounded-xl bg-black/25 p-3 text-xs text-slate-400">
                    PDF : l'aperçu image n'est pas disponible — le texte extractible sera analysé
                    (les PDF scannés sans texte exigent une image JPG/PNG).
                  </p>
                )}
              </div>
            )}
          </Card>
        ) : null}

        {step === "analyse" ? (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-bold" role="status">
              Analyse en cours…{" "}
              <span className="font-normal text-slate-400">
                {progress.phase === "ocr"
                  ? `reconnaissance ${Math.round(progress.ratio * 100)} %`
                  : progress.phase === "pdf"
                    ? "lecture du PDF…"
                    : "préparation…"}
              </span>
            </p>
            <div
              className="h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={Math.round(progress.ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full bg-amber-400 transition-[width]",
                  progress.phase === "ocr" ? "" : "animate-pulse",
                )}
                style={{
                  width: progress.phase === "ocr" ? `${Math.round(progress.ratio * 100)}%` : "35%",
                }}
              />
            </div>
            <div>
              <Button
                variant="secondary"
                onClick={() => void cancelAnalyze()}
                disabled={!analyzing}
              >
                <X size={15} aria-hidden="true" /> Annuler
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Le traitement reste sur cet ordinateur ; l'interface reste utilisable.
            </p>
          </Card>
        ) : null}

        {step === "verification" && parsed !== null ? (
          <div className="space-y-4">
            <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <Field label="N° facture (détecté)">
                <TextInput
                  value={invoiceNumber}
                  onChange={(e) => {
                    setInvoiceNumber(e.target.value);
                    const v = e.target.value;
                    duplicateTimer.schedule(400, () => {
                      void checkDuplicate(supplierId, v);
                    });
                  }}
                  aria-label="Numéro de facture"
                />
              </Field>
              <Field label="Date facture">
                <TextInput
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  aria-label="Date de facture"
                />
              </Field>
              <Field label="Total TTC (lu)">
                <TextInput
                  value={parsed.totalTtcMinor !== null ? formatDzd(parsed.totalTtcMinor) : "—"}
                  readOnly
                  aria-label="Total TTC détecté"
                />
              </Field>
              <Field label="Fournisseur (détecté)">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <TextInput
                      value={supplierQ}
                      onChange={(e) => {
                        setSupplierQ(e.target.value);
                        if (e.target.value.trim().length >= 2) void searchSuppliers();
                        else setSupplierResults([]);
                      }}
                      placeholder={parsed.supplierName ?? "Rechercher…"}
                      aria-label="Rechercher un fournisseur"
                    />
                  </div>
                </div>
              </Field>
            </Card>
            {supplierResults.length > 0 ? (
              <ul className="max-h-28 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                {supplierResults.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierLabel(s.name);
                        setSupplierResults([]);
                        setSupplierQ("");
                        void checkDuplicate(s.id, invoiceNumber || parsed.number);
                      }}
                      className="w-full px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-amber-400/10"
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={supplierId !== null ? "green" : "grey"}>
                {supplierId !== null ? `Fournisseur : ${supplierLabel}` : "Fournisseur : à choisir"}
              </Badge>
              {supplierId !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setSupplierId(null);
                    setSupplierLabel("");
                    void checkDuplicate(null, invoiceNumber);
                  }}
                  className="text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Retirer
                </button>
              ) : null}
              {duplicateWarn ? <Badge tone="red">Cette facture semble déjà importée</Badge> : null}
              {parsed.supplierName ? (
                <span className="text-xs text-slate-500">Détecté : {parsed.supplierName}</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold">
                Lignes ({rows.length}) · {validCount} valide(s)
                {selected.size > 0 ? ` · ${selected.size} cochée(s)` : ""}
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={rowFilter}
                  onChange={(e) => setRowFilter(e.target.value as "all" | "review" | "unmatched")}
                  aria-label="Filtrer les lignes par confiance"
                  title="Filtrer les lignes par confiance"
                  className="cursor-pointer rounded-lg border border-white/10 bg-[#010f1f] px-2 py-1.5 text-xs text-slate-100 [&>option]:bg-[#010f1f]"
                >
                  <option value="all">Toutes les lignes</option>
                  <option value="review">À vérifier (douteuses)</option>
                  <option value="unmatched">Non appariées</option>
                </select>
                <Button type="button" variant="secondary" onClick={addManualRow}>
                  <Plus size={15} aria-hidden="true" /> Ligne manuelle
                </Button>
              </div>
            </div>

            {selected.size > 0 ? (
              <Card className="space-y-2 border-amber-400/30 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>{selected.size} ligne(s) cochée(s)</strong>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setBulkOpen((o) => !o);
                      setPickerQ("");
                      setPickerResults([]);
                    }}
                  >
                    <Search size={13} aria-hidden="true" /> Associer un produit
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setRows((prev) => prev.filter((x) => !selected.has(x.key)));
                      setSelected(new Set());
                    }}
                    className="text-xs font-semibold text-red-300 hover:text-red-200"
                  >
                    Supprimer la sélection
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Tout désélectionner
                  </button>
                </div>
                {bulkOpen ? (
                  <div className="space-y-2 rounded-xl bg-black/25 p-3">
                    <TextInput
                      value={pickerQ}
                      onChange={(e) => void searchProductsForPicker(e.target.value)}
                      placeholder="Rechercher un produit… (min. 2 lettres)"
                      aria-label="Rechercher un produit pour la sélection"
                    />
                    {pickerResults.length > 0 ? (
                      <ul className="max-h-36 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                        {pickerResults.map((h) => (
                          <li key={h.id}>
                            <button
                              type="button"
                              onClick={() => assignBulk(h)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                            >
                              <span className="truncate font-semibold">{h.name}</span>
                              <span className="shrink-0 text-xs tabular-nums text-slate-400">
                                {formatDzd(h.purchase_price_minor)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            ) : null}

            <div className="space-y-3">
              {visibleRows(rows).map((r) => {
                const err = rowError(r);
                return (
                  <Card key={r.key} className="space-y-2.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.key)}
                          onChange={() => toggleSelect(r.key)}
                          aria-label={`Cocher ${r.ocrName || "ligne"}`}
                          title="Cocher pour action groupée"
                          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-amber-400"
                        />
                        <div className="min-w-0">
                          <strong
                            className="block truncate text-sm"
                            title={r.ocrName || "Ligne manuelle"}
                          >
                            {r.ocrName || "Ligne manuelle"}
                          </strong>
                          <span className="block text-xs text-slate-500">
                            {matchLabel(r.matchKind)} · unité lue : {r.unit}
                            {r.ocrBarcode ? ` · code : ${r.ocrBarcode}` : ""}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge tone={toneFor(r.confidence)}>
                          {confidenceLabelFr(r.confidence)}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                          aria-label={`Supprimer ${r.ocrName || "ligne"}`}
                          title="Supprimer la ligne"
                          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-300"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={r.productId !== null ? "green" : "grey"}>
                        {r.createNew
                          ? `Sera créé : ${r.ocrName || "—"}`
                          : r.productId !== null
                            ? r.productLabel
                            : "Produit non trouvé"}
                      </Badge>
                      {r.productPriceMinor !== null && !r.createNew ? (
                        <span className="text-xs tabular-nums text-slate-500">
                          actuel : {formatDzd(r.productPriceMinor)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setPickerFor(r.key);
                          setPickerQ("");
                          setPickerResults([]);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white"
                      >
                        <Search size={13} aria-hidden="true" /> Choisir
                      </button>
                      {r.productId === null && !r.createNew && r.ocrName.trim().length >= 2 ? (
                        <button
                          type="button"
                          onClick={() => patchRow(r.key, { createNew: true })}
                          className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                          title="Créera le produit à l'import (prix saisis ci-dessous)"
                        >
                          Créer ce produit
                        </button>
                      ) : null}
                      {r.createNew ? (
                        <button
                          type="button"
                          onClick={() => patchRow(r.key, { createNew: false })}
                          className="text-xs font-semibold text-slate-400 hover:text-white"
                        >
                          Annuler la création
                        </button>
                      ) : null}
                      {r.productId !== null ? (
                        <button
                          type="button"
                          onClick={() =>
                            patchRow(r.key, {
                              productId: null,
                              productLabel: "",
                              productPriceMinor: null,
                              confidence: "low",
                              matchKind: "none",
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
                        >
                          <X size={13} aria-hidden="true" /> Dissocier
                        </button>
                      ) : null}
                    </div>

                    {pickerFor === r.key ? (
                      <div className="space-y-2 rounded-xl bg-black/25 p-3">
                        <TextInput
                          value={pickerQ}
                          onChange={(e) => void searchProductsForPicker(e.target.value)}
                          placeholder="Rechercher un produit… (min. 2 lettres)"
                          aria-label="Rechercher un produit Veloria"
                        />
                        {pickerResults.length > 0 ? (
                          <ul className="max-h-36 divide-y divide-white/[0.06] overflow-auto rounded-xl border border-white/10">
                            {pickerResults.map((h) => (
                              <li key={h.id}>
                                <button
                                  type="button"
                                  onClick={() => assignProduct(r.key, h)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-400/10"
                                >
                                  <span className="truncate font-semibold">{h.name}</span>
                                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                                    {formatDzd(h.purchase_price_minor)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Quantité *">
                        <TextInput
                          value={r.qtyText}
                          onChange={(e) => patchRow(r.key, { qtyText: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Quantité ${r.ocrName || r.key}`}
                        />
                      </Field>
                      <Field label="Prix achat (DZD)">
                        <TextInput
                          value={r.purchaseText}
                          onChange={(e) => patchRow(r.key, { purchaseText: e.target.value })}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`Prix d'achat ${r.ocrName || r.key}`}
                        />
                      </Field>
                      <Field label="Prix vente (DZD)" hint="Vide = conserver.">
                        <TextInput
                          value={r.sellingText}
                          onChange={(e) => patchRow(r.key, { sellingText: e.target.value })}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`Prix de vente ${r.ocrName || r.key}`}
                        />
                      </Field>
                    </div>
                    {err ? (
                      <p role="alert" className="text-xs font-semibold text-red-300">
                        {err}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
              {rows.length > 0 && visibleRows(rows).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aucune ligne ne correspond au filtre — choisissez « Toutes les lignes ».
                </p>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs font-semibold text-slate-400 hover:text-white"
                aria-expanded={showRaw}
              >
                {showRaw ? "Masquer le texte brut OCR" : "Voir le texte brut OCR"}
              </button>
              {showRaw ? (
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
                  {parsed.rawText}
                </pre>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setStep("fichier");
                  setParsed(null);
                }}
                className="flex-1"
              >
                Retour
              </Button>
              <Button
                onClick={() => void importIntoStock()}
                disabled={importing}
                className="flex-[2]"
              >
                {importing ? "Import…" : `Importer dans le stock (${validCount})`}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Import atomique via la réception existante (mêmes contrôles, FIFO, dette fournisseur).
              Aucune écriture avant ce clic.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
