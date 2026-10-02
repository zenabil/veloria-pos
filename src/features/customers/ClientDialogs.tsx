// Veloria PoS — Clients : tiroir détail + formulaire + règlement.
// Branchés sur le bridge window.veloria (jamais de SQLite côté renderer).
import { useEffect, useRef, useState } from "react";
import { Ban, Pencil, RefreshCw, RotateCcw, Smartphone, Trash2, Wallet } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { InvoicePreviewModal } from "@shared/documents/invoice-preview.tsx";
import { buildSaleTicketPayload } from "@shared/documents/sale-ticket.ts";
import { returnNumber, returnStatusLabel, returnStatusTone } from "@features/returns/types.ts";
import { debtStatusLabel } from "@features/debts/types.ts";
import { KIND_LABELS, kindTone, type HistoryKind } from "@features/history/types.ts";
import { PaymentTicketModal, type PaymentTicketInput } from "@shared/documents/payment-preview.tsx";
import {
  accessActivateResultSchema,
  accessQrSvgResultSchema,
  accessStatusResultSchema,
  callChecked,
  paymentAckSchema,
  syncEnqueueResultSchema,
} from "@shared/types/ipc-contracts.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { formatDzd, minorToInput, parseDzdInputStrict } from "@domain/money/money.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { selectDetailSaleIds } from "../../application/customers/client-access.ts";
import {
  PAYMENT_METHOD_LABELS,
  formatCustomerCode,
  formatDateTimeFr,
} from "@shared/formatters/format.ts";
import { todayUtcDate } from "@shared/dates/dates.ts";
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
  cn,
} from "@shared/ui/primitives.tsx";
import {
  debtLabel,
  debtTone,
  fullName,
  hasDebt,
  isArchived,
  splitFullName,
  type Customer,
  type EnrichedCustomer,
  type StatementSale,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

// Libellés des moyens de paiement : source unique partagée (format.ts).

// ---------------------------------------------------------------------------
// Fiche 360 : 5 onglets (relevé + retours + dettes + historique).
// Relevé via `customers.statement` ; retours / dettes / historique via les
// canaux existants, rapprochés côté renderer (nom normalisé FR) avec repli
// « toutes les lignes » quand aucun rapprochement n'est possible.
// ---------------------------------------------------------------------------

type ClientTabId = "factures" | "paiements" | "retours" | "dettes" | "historique";

const CLIENT_TABS: { id: ClientTabId; label: string }[] = [
  { id: "factures", label: "Factures" },
  { id: "paiements", label: "Paiements" },
  { id: "retours", label: "Retours" },
  { id: "dettes", label: "Dettes-Solde" },
  { id: "historique", label: "Historique" },
];

interface StatementPayment {
  id: number;
  sale_id: number | null;
  amount_minor: number;
  method: string;
  reference: string | null;
  payment_date: string;
  created_at: string;
}

interface ClientReturnItem {
  kind: string;
  entity_id: number;
  number: string | null;
  created_at: string;
  ref: string;
  party_name: string;
  total_minor: number;
  settled_minor: number;
  status: string;
}

interface ClientDebtItem {
  debt_type: string;
  entity_id: number;
  ref: string;
  party_name: string;
  original_minor: number;
  paid_minor: number;
  remaining_minor: number;
  due_date: string | null;
  created_at: string;
  status: string;
}

interface ClientHistoryItem {
  kind: string;
  entity_id: number;
  ref: string;
  label: string;
  entity_name: string | null;
  amount_minor: number | null;
  created_at: string;
  status: string;
}

type LazyState = "idle" | "loading" | "ready" | "error";

/** Normalisation FR insensible aux accents/casse (rapprochement renderer). */
function normFr(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Montant serveur → entier sûr (jamais NaN propagé à l'affichage). */
function asMinor(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Champ date serveur → chaîne sûre (jamais "[object Object]" à l'affichage). */
function asCreatedAt(row: Record<string, unknown>): string {
  const v = row["created_at"];
  return typeof v === "string" ? v : "";
}

function matchClient(nameNorm: string, candidates: (string | null | undefined)[]): boolean {
  const hay = normFr(candidates.filter((c) => c != null && c !== "").join(" "));
  if (nameNorm === "") return true;
  if (hay === "") return false;
  if (hay.includes(nameNorm)) return true;
  return nameNorm.split(" ").some((w) => w.length > 2 && hay.includes(w));
}

/** Rapproche les lignes au client ; repli = toutes (champ indisponible). */
function keepClient<T>(
  rows: T[],
  pick: (r: T) => (string | null | undefined)[],
  nameNorm: string,
): T[] {
  const kept = rows.filter((r) => matchClient(nameNorm, pick(r)));
  return kept.length > 0 ? kept : rows;
}

function historyKindOf(raw: string): HistoryKind | null {
  return Object.keys(KIND_LABELS).includes(raw) ? (raw as HistoryKind) : null;
}

/** Aperçu bon de retour (A4/80mm) + impression — même HTML côté main. */
function SlipPreviewModal({
  title,
  text80,
  htmlA4,
  busy,
  onClose,
  onPrint,
}: {
  title: string;
  text80: string;
  htmlA4: string;
  busy: boolean;
  onClose: () => void;
  onPrint: (mode: "80mm" | "A4") => void;
}): React.JSX.Element {
  const [format, setFormat] = useState<"80mm" | "A4">("A4");
  return (
    <Modal label={title} title={title} onClose={onClose} wide>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Format d'aperçu">
        {(["A4", "80mm"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={format === f}
            onClick={() => setFormat(f)}
            className={
              format === f
                ? "rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-black"
                : "rounded-lg border border-white/10 px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
            }
          >
            {f === "A4" ? "Bon A4" : "Ticket 80mm"}
          </button>
        ))}
      </div>
      {format === "A4" ? (
        <iframe
          sandbox=""
          srcDoc={htmlA4}
          title={`Aperçu ${title}`}
          className="h-[50vh] w-full rounded-xl border border-white/10 bg-white"
        />
      ) : (
        <pre
          className="h-[50vh] overflow-auto rounded-xl border border-white/10 bg-white p-4 font-mono text-[12px] leading-snug text-black"
          aria-label={`Aperçu ${title}`}
        >
          {text80}
        </pre>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => onPrint("80mm")}>
          Imprimer 80mm
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onPrint("A4")}>
          Imprimer A4
        </Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Application mobile (V1 lecture seule) : activation QR/PIN, révocation,
// mise en file des clichés vers le miroir. Le QR/code ne s'affiche qu'une
// fois pour la carte d'activation (condensats côté main, jamais en clair).
// ---------------------------------------------------------------------------

interface AccessStatus {
  active: boolean;
  revokedAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

function ClientMobileAccess({
  customer,
  notify,
}: {
  customer: EnrichedCustomer;
  notify: Notify;
}): React.JSX.Element {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"activate" | "revoke" | "sync" | null>(null);
  const [card, setCard] = useState<{ phone: string; pin: string; code: string } | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const confirmAsync = useConfirm();
  const seq = useRef(0);

  const hasPhone = (customer.phone ?? "").trim().length > 0;

  async function reload(): Promise<void> {
    const my = (seq.current += 1);
    setStatusLoading(true);
    try {
      const res = await callChecked(
        (a) => a.customers.accessStatus({ id: customer.id }),
        accessStatusResultSchema,
      );
      if (seq.current !== my) return;
      setStatus(res.status);
    } catch (e) {
      if (seq.current !== my) return;
      setStatus(null);
      notify(frError(e, "État de l'application indisponible."), "err");
    } finally {
      if (seq.current === my) setStatusLoading(false);
    }
  }

  useEffect(() => {
    setCard(null);
    setQrSvg(null);
    setPin("");
    void reload();
    return () => {
      seq.current += 1;
    };
  }, [customer.id]);

  async function activate(): Promise<void> {
    if (!hasPhone) {
      notify("Ajoutez d'abord un téléphone à la fiche du client.", "err");
      return;
    }
    if (!/^[0-9]{6}$/.test(pin)) {
      notify("PIN invalide : 6 chiffres.", "err");
      return;
    }
    setBusy("activate");
    try {
      const res = await callChecked(
        (a) =>
          a.customers.accessActivate({
            operationId: newOperationId(),
            customerId: customer.id,
            phone: (customer.phone ?? "").trim(),
            pin,
          }),
        accessActivateResultSchema,
      );
      setCard({ phone: (customer.phone ?? "").trim(), pin, code: res.activationCode });
      setQrSvg(null);
      setPin("");
      notify("Application activée : recopiez la carte d'activation.", "ok");
      // QR scannable (ADR-054) : meilleur effort, la carte texte reste valide.
      try {
        const qr = await callChecked(
          (a) =>
            a.customers.accessQrSvg({
              phone: (customer.phone ?? "").trim(),
              pin,
              code: res.activationCode,
            }),
          accessQrSvgResultSchema,
        );
        setQrSvg(qr.svg !== "" ? qr.svg : null);
      } catch {
        setQrSvg(null);
      }
      await reload();
    } catch (e) {
      notify(frError(e, "Activation impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(): Promise<void> {
    if (!(await confirmAsync(`Couper l'accès mobile de « ${fullName(customer)} » ?`))) return;
    setBusy("revoke");
    try {
      await api.customerAccessRevoke({ id: customer.id, operationId: newOperationId() });
      setCard(null);
      notify("Accès mobile coupé.", "ok");
      await reload();
    } catch (e) {
      notify(frError(e, "Révocation impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  async function syncNow(): Promise<void> {
    setBusy("sync");
    try {
      const month = new Date().toISOString().slice(0, 7);
      const kinds = ["customer_snapshot", "invoice_list", "payment_list"] as const;
      let done = 0;
      for (const kind of kinds) {
        const r = await callChecked(
          (a) =>
            a.sync.enqueue({
              operationId: newOperationId(),
              customerId: customer.id,
              kind,
              monthKey: kind === "customer_snapshot" ? month : null,
            }),
          syncEnqueueResultSchema,
        );
        if (r.queued) done += 1;
      }
      // Détails des factures ouvertes (page détail APK, cap 10, best-effort
      // par vente : un détail manquant n'échoue jamais toute la synchro).
      let details = 0;
      try {
        const st = (await api.customerStatement({ id: customer.id })) as {
          sales?: { id: number; is_cancelled: number; remaining_balance_minor: number }[];
        };
        const ids = selectDetailSaleIds(Array.isArray(st.sales) ? st.sales : [], 10);
        for (const saleId of ids) {
          try {
            const r = await callChecked(
              (a) =>
                a.sync.enqueue({
                  operationId: newOperationId(),
                  customerId: customer.id,
                  kind: "invoice_detail",
                  saleId,
                }),
              syncEnqueueResultSchema,
            );
            if (r.queued) details += 1;
          } catch {
            /* détail ignoré, les 3 clichés restent la priorité */
          }
        }
      } catch {
        /* relevé illisible : les 3 clichés restent la priorité */
      }
      notify(
        `Cliché mis en file (${done}/3${details > 0 ? ` + ${details} détail(s)` : ""}). Envoi vers le miroir à l'étape suivante.`,
        "ok",
      );
    } catch (e) {
      notify(frError(e, "Mise en file impossible."), "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-extrabold">
          <Smartphone size={16} aria-hidden="true" /> Application mobile
        </h3>
        {statusLoading ? (
          <span className="text-xs text-slate-500" role="status">
            Chargement…
          </span>
        ) : status?.active ? (
          <Badge tone="green">Activée</Badge>
        ) : status && (status.revokedAt != null || status.failedAttempts > 0) ? (
          <Badge tone="red">Coupée</Badge>
        ) : (
          <Badge tone="grey">Non activée</Badge>
        )}
      </div>

      {status?.lockedUntil ? (
        <p className="text-xs font-semibold text-red-300">
          Verrouillée jusqu'au {status.lockedUntil.slice(0, 16).replace("T", " ")} (5 échecs).
        </p>
      ) : null}

      {card ? (
        <div className="space-y-1 rounded-xl border border-amber-400/40 bg-amber-400/[0.07] p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-200">
            Carte d'activation — à recopier une seule fois
          </p>
          <p className="tabular-nums">
            Tél : <strong>{card.phone}</strong>
          </p>
          <p className="tabular-nums">
            PIN : <strong className="font-mono text-base">{card.pin}</strong>
          </p>
          <p className="break-all font-mono text-xs text-slate-300">QR : {card.code}</p>
          {qrSvg ? (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
              alt="QR d'activation à scanner"
              width={160}
              height={160}
              className="rounded-lg bg-white p-2"
            />
          ) : null}
          <p className="text-xs text-slate-400">
            QR valable 7 jours — à scanner depuis l'application. Ne pas photographier à côté.
          </p>
        </div>
      ) : null}

      {!status?.active ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void activate();
          }}
        >
          <Field label="PIN à 6 chiffres" hint="Communiqué au client avec le QR (valable 7 jours).">
            <TextInput
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Ex. : 482916"
              aria-label="PIN à 6 chiffres"
            />
          </Field>
          <Button type="submit" disabled={busy != null || !hasPhone} className="w-full">
            {busy === "activate" ? "Activation…" : "Activer l'application"}
          </Button>
          {!hasPhone ? (
            <p className="text-xs text-slate-500">
              Téléphone manquant sur la fiche (modifiez d'abord).
            </p>
          ) : null}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy != null} onClick={() => void syncNow()}>
            <RefreshCw size={15} aria-hidden="true" /> {busy === "sync" ? "File…" : "Synchroniser"}
          </Button>
          <Button variant="danger" disabled={busy != null} onClick={() => void revoke()}>
            <Ban size={15} aria-hidden="true" /> {busy === "revoke" ? "Coupe…" : "Couper l'accès"}
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        V1 lecture seule : le téléphone affiche dettes et factures, ne modifie rien.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tiroir de détail client.
// ---------------------------------------------------------------------------

export function ClientDetailsDrawer({
  customer,
  sales: initialSales,
  onClose,
  onEdit,
  onChanged,
  notify,
}: {
  customer: EnrichedCustomer;
  sales: StatementSale[];
  onClose: () => void;
  onEdit: (c: EnrichedCustomer) => void;
  onChanged: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [tab, setTab] = useState<ClientTabId>("factures");
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Requête 2 : aperçu facture (80mm/A4) + réimpression depuis la fiche.
  const [previewSaleId, setPreviewSaleId] = useState<number | null>(null);
  // Impression directe d'une ligne facture (bouton « Imprimer »).
  const [printId, setPrintId] = useState<number | null>(null);
  // Reçu d'une ligne paiement (soldes reconstitués, jamais inventés).
  const [receiptTicket, setReceiptTicket] = useState<PaymentTicketInput | null>(null);
  const [receiptBusyId, setReceiptBusyId] = useState<number | null>(null);
  // Bon de retour d'une ligne retours (aperçu A4/80mm + impression).
  const [slip, setSlip] = useState<{
    payload: Record<string, unknown>;
    text80: string;
    htmlA4: string;
    title: string;
  } | null>(null);
  const [slipBusyKey, setSlipBusyKey] = useState<string | null>(null);
  const [slipBusy, setSlipBusy] = useState(false);
  // Relevé rechargé à l'ouverture (ventes + paiements).
  const [sales, setSales] = useState<StatementSale[]>(initialSales);
  const [payments, setPayments] = useState<StatementPayment[]>([]);
  const [statementLoading, setStatementLoading] = useState(true);
  // Listes chargées paresseusement à l'activation de l'onglet.
  const [returnsRows, setReturnsRows] = useState<ClientReturnItem[]>([]);
  const [returnsState, setReturnsState] = useState<LazyState>("idle");
  const [debtsRows, setDebtsRows] = useState<ClientDebtItem[]>([]);
  const [debtsState, setDebtsState] = useState<LazyState>("idle");
  const [historyRows, setHistoryRows] = useState<ClientHistoryItem[]>([]);
  const [historyState, setHistoryState] = useState<LazyState>("idle");
  const archived = isArchived(customer);
  const confirmAsync = useConfirm();
  const seq = useRef(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const clientName = fullName(customer);
  const clientNorm = normFr(clientName);

  // Relevé : rechargé à l'ouverture et au changement de fiche (le tiroir
  // reste monté quand on navigue d'un client à l'autre depuis la table).
  useEffect(() => {
    const my = (seq.current += 1);
    setStatementLoading(true);
    // Listes d'onglets : réinitialisées (nouvelle fiche = nouveau rapprochement).
    setReturnsRows([]);
    setReturnsState("idle");
    setDebtsRows([]);
    setDebtsState("idle");
    setHistoryRows([]);
    setHistoryState("idle");
    setTab("factures");
    api
      .customerStatement({ id: customer.id })
      .then((st) => {
        if (seq.current !== my) return;
        const s = st as { sales?: StatementSale[]; payments?: Record<string, unknown>[] };
        setSales(Array.isArray(s.sales) ? s.sales : initialSales);
        setPayments(
          Array.isArray(s.payments)
            ? s.payments.map((p) => ({
                id: asMinor(p["id"]),
                sale_id: typeof p["sale_id"] === "number" ? p["sale_id"] : null,
                amount_minor: asMinor(p["amount_minor"]),
                method: typeof p["method"] === "string" ? p["method"] : "",
                reference: typeof p["reference"] === "string" ? p["reference"] : null,
                payment_date: typeof p["payment_date"] === "string" ? p["payment_date"] : "",
                created_at: typeof p["created_at"] === "string" ? p["created_at"] : "",
              }))
            : [],
        );
      })
      .catch((e: unknown) => {
        if (seq.current !== my) return;
        setSales(initialSales);
        setPayments([]);
        notify(frError(e, "Relevé indisponible."), "err");
      })
      .finally(() => {
        if (seq.current === my) setStatementLoading(false);
      });
    return () => {
      seq.current += 1;
    };
    // `notify`/`initialSales` : stables pour la durée du tiroir.
  }, [customer.id]);

  async function loadReturns(): Promise<void> {
    if (returnsState === "loading" || returnsState === "ready") return;
    setReturnsState("loading");
    try {
      const res = (await api.returnsList({
        query: clientName,
        typeFilter: "customer",
        statusFilter: "all",
        from: null,
        to: null,
        sort: "date_desc",
        page: 1,
        pageSize: 50,
      })) as { rows: ClientReturnItem[] };
      const rows = Array.isArray(res.rows) ? res.rows : [];
      setReturnsRows(keepClient(rows, (r) => [r.party_name, r.ref], clientNorm));
      setReturnsState("ready");
    } catch (e) {
      setReturnsState("error");
      notify(frError(e, "Retours indisponibles."), "err");
    }
  }

  async function loadDebts(): Promise<void> {
    if (debtsState === "loading" || debtsState === "ready") return;
    setDebtsState("loading");
    try {
      const res = (await api.debtsList({
        query: clientName,
        typeFilter: "customer",
        statusFilter: "all",
        dueFilter: "all",
        settleFilter: "all",
        sort: "date_desc",
        page: 1,
        pageSize: 50,
      })) as { rows: ClientDebtItem[] };
      const rows = Array.isArray(res.rows) ? res.rows : [];
      setDebtsRows(keepClient(rows, (r) => [r.party_name, r.ref], clientNorm));
      setDebtsState("ready");
    } catch (e) {
      setDebtsState("error");
      notify(frError(e, "Dettes indisponibles."), "err");
    }
  }

  async function loadHistory(): Promise<void> {
    if (historyState === "loading" || historyState === "ready") return;
    setHistoryState("loading");
    try {
      const res = (await api.historyList({
        query: clientName,
        op: "all",
        user: "all",
        from: null,
        to: null,
        sort: "date_desc",
        page: 1,
        pageSize: 50,
      })) as { rows: ClientHistoryItem[] };
      const rows = Array.isArray(res.rows) ? res.rows : [];
      setHistoryRows(keepClient(rows, (r) => [r.entity_name, r.label, r.ref], clientNorm));
      setHistoryState("ready");
    } catch (e) {
      setHistoryState("error");
      notify(frError(e, "Historique indisponible."), "err");
    }
  }

  useEffect(() => {
    if (tab === "retours") void loadReturns();
    else if (tab === "dettes") void loadDebts();
    else if (tab === "historique") void loadHistory();
    // Chargements paresseux à l'activation de l'onglet.
  }, [tab]);

  /** Impression directe 80mm d'une facture (sans passer par l'aperçu). */
  async function printDirect(saleId: number): Promise<void> {
    if (printId != null) return;
    setPrintId(saleId);
    try {
      const d = (await api.saleGet({ id: saleId })) as {
        sale: Record<string, string | number | null>;
        items: Record<string, string | number | null>[];
      };
      let co: Record<string, string> | null = null;
      try {
        const cg = (await api.companyGet()) as { company: Record<string, string> | null };
        co = cg.company;
      } catch {
        /* repli "Veloria" du builder */
      }
      const customerId = typeof d.sale["customer_id"] === "number" ? d.sale["customer_id"] : 0;
      let beneficiary: {
        search_name: string;
        phone: string | null;
        address: string | null;
      } | null = null;
      if (customerId > 0) {
        try {
          const st = (await api.customerStatement({ id: customerId })) as {
            customer: { search_name: string; phone: string | null; address: string | null };
          };
          beneficiary = st.customer;
        } catch {
          /* impression sans coordonnées plutôt que pas d'impression */
        }
      }
      await api.printReceipt(buildSaleTicketPayload(d, co, beneficiary, customerId));
      notify("Ticket envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setPrintId(null);
    }
  }

  /** Reçu d'une ligne paiement : soldes reconstitués côté main (jamais inventés). */
  async function openReceipt(paymentId: number): Promise<void> {
    if (receiptBusyId != null) return;
    setReceiptBusyId(paymentId);
    try {
      const r = (await api.customerPaymentReceipt({ id: paymentId })) as {
        payment: Record<string, unknown>;
        customer: Record<string, unknown>;
        prevBalanceMinor: number;
        newBalanceMinor: number;
      };
      const p = r.payment;
      const methodRaw = typeof p["method"] === "string" ? p["method"] : "";
      const method: "cash" | "cheque" | "transfer" | null =
        methodRaw === "cash" || methodRaw === "cheque" || methodRaw === "transfer"
          ? methodRaw
          : null;
      const dateRaw = typeof p["payment_date"] === "string" ? p["payment_date"] : "";
      setReceiptTicket({
        kind: "customer",
        partyLabel: `${clientName} — ${formatCustomerCode(customer.id)}`,
        reference: typeof p["reference"] === "string" ? p["reference"] : "",
        date: dateRaw !== "" ? dateRaw : formatDateTimeFr(asCreatedAt(p)),
        amountMinor: asMinor(p["amount_minor"]),
        method,
        prevBalanceMinor: asMinor(r.prevBalanceMinor),
        newBalanceMinor: asMinor(r.newBalanceMinor),
        notes: typeof p["notes"] === "string" ? p["notes"] : "",
      });
    } catch (e) {
      notify(frError(e, "Reçu indisponible."), "err");
    } finally {
      setReceiptBusyId(null);
    }
  }

  /** Bon de retour d'une ligne retours (aperçu A4/80mm + impression). */
  async function openSlip(kind: string, entityId: number): Promise<void> {
    const key = `${kind}:${entityId}`;
    if (slipBusyKey != null) return;
    setSlipBusyKey(key);
    try {
      const rk = kind === "supplier" ? "supplier" : "customer";
      const d = (await api.returnDetail({ kind: rk, id: entityId })) as {
        header: Record<string, unknown>;
        items: Record<string, unknown>[];
        party: Record<string, unknown> | null;
      };
      let co: Record<string, string> | null = null;
      try {
        const cg = (await api.companyGet()) as { company: Record<string, string> | null };
        co = cg.company;
      } catch {
        /* repli "Veloria" côté main */
      }
      const h = d.header;
      const num =
        typeof h["return_number"] === "string" && h["return_number"] !== ""
          ? h["return_number"]
          : returnNumber(rk, typeof h["number"] === "string" ? h["number"] : null, entityId);
      const lines: Record<string, unknown>[] = [];
      for (const it of d.items) {
        const qty =
          typeof it["quantity"] === "number" ? it["quantity"] : Number(it["quantity"] ?? 0);
        const unit =
          typeof it["unit_price_minor"] === "number"
            ? it["unit_price_minor"]
            : Number(it["unit_price_minor"] ?? 0);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(unit) || unit < 0) continue;
        const pid = typeof it["product_id"] === "number" ? it["product_id"] : null;
        lines.push({
          name:
            typeof it["product_name_snapshot"] === "string"
              ? it["product_name_snapshot"]
              : "Article",
          qty,
          unit: "",
          unitPriceMinor: unit,
          lineTotalMinor: Math.round(unit * qty),
          ref: pid != null && pid > 0 ? String(pid).padStart(5, "0") : "—",
        });
      }
      if (lines.length === 0) {
        notify("Aucune ligne à imprimer.", "err");
        return;
      }
      const total = asMinor(h["total_return_value_minor"]);
      const refund = asMinor(h["amount_refunded_minor"] ?? h["amount_recovered_minor"] ?? 0);
      const payload: Record<string, unknown> = {
        company: co?.["company_name"] ?? "Veloria",
        companyPhone: co?.["phone"] ?? "",
        companyAddress: co?.["address"] ?? "",
        companyCity: co?.["city"] ?? "",
        companyEmail: co?.["email"] ?? "",
        companyRc: co?.["rc_number"] ?? "",
        companyNif: co?.["nif"] ?? "",
        customerName: rk === "customer" ? clientName : "",
        invoice: num,
        date: formatDateTimeFr(asCreatedAt(h)),
        lines,
        subtotalMinor: total,
        discountMinor: 0,
        deliveryMinor: 0,
        totalMinor: total,
        paidMinor: 0,
        returnNumber: num,
        reason: typeof h["reason"] === "string" ? h["reason"] : "",
        refundMinor: refund,
      };
      const pv = (await api.returnSlipPreview(payload)) as { text80: string; htmlA4: string };
      setSlip({ payload, text80: pv.text80, htmlA4: pv.htmlA4, title: `Bon de retour ${num}` });
    } catch (e) {
      notify(frError(e, "Bon de retour indisponible."), "err");
    } finally {
      setSlipBusyKey(null);
    }
  }

  async function printSlip(mode: "80mm" | "A4"): Promise<void> {
    if (!slip || slipBusy) return;
    setSlipBusy(true);
    try {
      await api.returnSlipPrint(mode === "A4" ? { ...slip.payload, format: "A4" } : slip.payload);
      notify(mode === "A4" ? "Bon de retour A4 envoyé." : "Bon de retour envoyé.", "ok");
    } catch (e) {
      notify(frError(e, "Impression impossible."), "err");
    } finally {
      setSlipBusy(false);
    }
  }

  function onTabListKey(e: React.KeyboardEvent): void {
    const ids = CLIENT_TABS.map((t) => t.id);
    const cur = ids.indexOf(tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (cur + 1) % ids.length;
    else if (e.key === "ArrowLeft") next = (cur - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    if (next == null) return;
    e.preventDefault();
    const id = ids[next];
    if (id == null) return;
    setTab(id);
    const btn = tabRefs.current[next];
    if (btn) btn.focus();
  }

  function tabLabel(t: ClientTabId): string {
    const base = CLIENT_TABS.find((x) => x.id === t)?.label ?? t;
    if (t === "factures") return `${base} (${sales.length})`;
    if (t === "paiements") return `${base} (${payments.length})`;
    if (t === "retours" && returnsState === "ready") return `${base} (${returnsRows.length})`;
    if (t === "dettes" && debtsState === "ready") return `${base} (${debtsRows.length})`;
    if (t === "historique" && historyState === "ready") return `${base} (${historyRows.length})`;
    return base;
  }

  const activeSales = sales.filter((s) => s.is_cancelled !== 1);
  const salesTotal = activeSales.reduce((a, s) => a + s.total_minor, 0);
  const salesRest = activeSales.reduce((a, s) => a + s.remaining_balance_minor, 0);
  const payTotal = payments.reduce((a, p) => a + p.amount_minor, 0);
  const debtsRest = debtsRows.reduce((a, d) => a + asMinor(d.remaining_minor), 0);

  async function remove(): Promise<void> {
    if (!(await confirmAsync(`Archiver « ${fullName(customer)} » ? Historique conservé.`))) return;
    setBusy(true);
    try {
      await api.customerArchive({ id: customer.id, operationId: newOperationId() });
      notify("Client archivé.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Archivage impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function restore(): Promise<void> {
    setBusy(true);
    try {
      await api.customerRestore({ id: customer.id, operationId: newOperationId() });
      notify("Client restauré.", "ok");
      onChanged();
      onClose();
    } catch (e) {
      notify(frError(e, "Restauration impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Drawer
        label={`Détail ${fullName(customer)}`}
        title={fullName(customer)}
        sub={`Client #${customer.id}`}
        below={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={debtTone(customer)}>{debtLabel(customer)}</Badge>
            {customer.phone ? <Badge tone="grey">{customer.phone}</Badge> : null}
          </div>
        }
        footer={
          <>
            {!archived && hasDebt(customer) ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => setPayOpen(true)}
                className="w-full"
              >
                <Wallet size={15} aria-hidden="true" /> Encaisser un paiement
              </Button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy || archived}
                onClick={() => onEdit(customer)}
                title="Modifier le client"
              >
                <Pencil size={15} aria-hidden="true" /> Modifier
              </Button>
              {archived ? (
                <Button variant="secondary" disabled={busy} onClick={() => void restore()}>
                  <RotateCcw size={15} aria-hidden="true" /> Restaurer
                </Button>
              ) : (
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                  <Trash2 size={15} aria-hidden="true" /> Supprimer
                </Button>
              )}
            </div>
          </>
        }
        onClose={onClose}
      >
        <Card
          className={cn(
            "p-4 text-center",
            hasDebt(customer) ? "border-red-400/25" : "border-emerald-400/20",
          )}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Dette actuelle
          </div>
          <div
            className={cn(
              "mt-1 text-3xl font-extrabold tabular-nums tracking-tight",
              hasDebt(customer) ? "text-red-300" : "text-emerald-300",
            )}
          >
            {formatDzd(customer.outstanding_balance_minor)}
          </div>
          {customer.credit_limit_minor > 0 ? (
            <div className="mt-1 text-xs text-slate-500">
              Plafond : {formatDzd(customer.credit_limit_minor)}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-2.5 p-4 text-sm">
          <InfoRow
            label="Vente à crédit"
            value={customer.credit_allowed === 1 ? "Autorisée" : "Comptant uniquement"}
          />
          <InfoRow
            label="Règlement mensuel"
            value={customer.settlement_day != null ? `Chaque ${customer.settlement_day}` : "—"}
          />
          <InfoRow label="Téléphone" value={customer.phone || "—"} />
          <InfoRow label="Adresse" value={customer.address || "—"} />
          <InfoRow
            label="Achats cumulés"
            value={formatDzd(customer.totalPurchasesMinor)}
            num
            strong
          />
          <InfoRow label="Factures" value={String(customer.invoiceCount)} num />
          <InfoRow
            label="Dernière vente"
            value={customer.lastSaleAt ? formatDateTimeFr(customer.lastSaleAt) : "—"}
          />
          {customer.notes ? <InfoRow label="Notes" value={customer.notes} /> : null}
        </Card>

        {!archived ? <ClientMobileAccess customer={customer} notify={notify} /> : null}

        <div
          role="tablist"
          aria-label={`Fiche 360 — ${clientName}`}
          onKeyDown={onTabListKey}
          className="flex flex-wrap gap-1.5"
        >
          {CLIENT_TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`client-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`client-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-black"
                  : "rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white"
              }
            >
              {tabLabel(t.id)}
            </button>
          ))}
        </div>

        {tab === "factures" ? (
          <div role="tabpanel" id="client-panel-factures" aria-labelledby="client-tab-factures">
            {statementLoading ? (
              <p className="py-4 text-center text-sm text-slate-500" role="status">
                Chargement…
              </p>
            ) : sales.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aucune facture.</p>
            ) : (
              <>
                <dl className="mb-2 space-y-1 rounded-xl bg-black/25 p-3 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <dt>Factures (hors annulées)</dt>
                    <dd className="font-bold tabular-nums">{activeSales.length}</dd>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <dt>Total facturé</dt>
                    <dd className="font-bold tabular-nums">{formatDzd(salesTotal)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-white/10 pt-1.5">
                    <dt className="font-extrabold">Reste dû</dt>
                    <dd className="font-extrabold tabular-nums text-amber-300">
                      {formatDzd(salesRest)}
                    </dd>
                  </div>
                </dl>
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                  {sales.map((s) => (
                    <li key={s.id} className="space-y-1 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-slate-400">{s.invoice_number}</span>
                        <span className="font-bold tabular-nums">{formatDzd(s.total_minor)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{formatDateTimeFr(s.created_at)}</span>
                        {s.is_cancelled === 1 ? (
                          <Badge tone="grey">Annulée</Badge>
                        ) : s.remaining_balance_minor > 0 ? (
                          <span className="font-semibold tabular-nums text-amber-300">
                            Reste {formatDzd(s.remaining_balance_minor)}
                          </span>
                        ) : (
                          <Badge tone="green">Payée</Badge>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewSaleId(s.id)}
                          title={`Ouvrir le détail ${s.invoice_number} (aperçu + réimpression)`}
                          aria-label={`Ouvrir la facture ${s.invoice_number}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200"
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          onClick={() => void printDirect(s.id)}
                          disabled={printId != null || s.is_cancelled === 1}
                          title={`Imprimer directement ${s.invoice_number} (ticket 80mm)`}
                          aria-label={`Imprimer la facture ${s.invoice_number}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs font-semibold text-slate-300 transition-colors hover:border-amber-400/40 hover:text-amber-200 disabled:opacity-50"
                        >
                          {printId === s.id ? "Impression…" : "Imprimer"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {tab === "paiements" ? (
          <div role="tabpanel" id="client-panel-paiements" aria-labelledby="client-tab-paiements">
            {statementLoading ? (
              <p className="py-4 text-center text-sm text-slate-500" role="status">
                Chargement…
              </p>
            ) : payments.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aucun paiement.</p>
            ) : (
              <>
                <dl className="mb-2 flex items-baseline justify-between rounded-xl bg-black/25 p-3 text-sm">
                  <dt className="font-extrabold">Total encaissé</dt>
                  <dd className="font-extrabold tabular-nums text-emerald-300">
                    {formatDzd(payTotal)}
                  </dd>
                </dl>
                <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                  {payments.map((p) => (
                    <li key={p.id} className="space-y-1 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-300">
                          {PAYMENT_METHOD_LABELS[p.method] ?? (p.method === "" ? "—" : p.method)}
                        </span>
                        <span className="font-bold tabular-nums text-emerald-300">
                          {formatDzd(p.amount_minor)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{formatDateTimeFr(p.payment_date || p.created_at)}</span>
                        <span className="font-mono">{p.reference || "—"}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {p.sale_id != null ? (
                          <button
                            type="button"
                            onClick={() => setPreviewSaleId(p.sale_id)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                            title={`Ouvrir la facture liée (${p.reference || "sans réf."})`}
                            aria-label={`Ouvrir la facture du paiement ${p.reference || p.id}`}
                          >
                            Facture
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void openReceipt(p.id)}
                          disabled={receiptBusyId != null}
                          className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                          title={`Reçu de règlement ${p.reference || "sans réf."} (soldes reconstitués)`}
                          aria-label={`Imprimer le reçu du paiement ${p.reference || p.id}`}
                        >
                          {receiptBusyId === p.id ? "Chargement…" : "Reçu"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}

        {tab === "retours" ? (
          <div role="tabpanel" id="client-panel-retours" aria-labelledby="client-tab-retours">
            {returnsState === "loading" || returnsState === "idle" ? (
              <p className="py-4 text-center text-sm text-slate-500" role="status">
                Chargement…
              </p>
            ) : returnsState === "error" ? (
              <div className="space-y-2 py-4 text-center">
                <p className="text-sm text-slate-500">Retours indisponibles.</p>
                <Button variant="secondary" onClick={() => void loadReturns()}>
                  Réessayer
                </Button>
              </div>
            ) : returnsRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aucun retour.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                {returnsRows.map((r) => (
                  <li key={`${r.kind}:${r.entity_id}`} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">
                        {returnNumber(
                          r.kind === "supplier" ? "supplier" : "customer",
                          r.number,
                          r.entity_id,
                        )}
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatDzd(asMinor(r.total_minor))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{formatDateTimeFr(r.created_at)}</span>
                      <Badge tone={returnStatusTone(r.status)}>{returnStatusLabel(r.status)}</Badge>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void openSlip(r.kind, r.entity_id)}
                        disabled={slipBusyKey != null}
                        className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                        title={`Bon de retour ${r.ref || r.entity_id} (aperçu + impression)`}
                        aria-label={`Ouvrir le bon de retour ${r.ref || r.entity_id}`}
                      >
                        {slipBusyKey === `${r.kind}:${r.entity_id}` ? "Chargement…" : "Bon"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {tab === "dettes" ? (
          <div role="tabpanel" id="client-panel-dettes" aria-labelledby="client-tab-dettes">
            {debtsState === "loading" || debtsState === "idle" ? (
              <p className="py-4 text-center text-sm text-slate-500" role="status">
                Chargement…
              </p>
            ) : debtsState === "error" ? (
              <div className="space-y-2 py-4 text-center">
                <p className="text-sm text-slate-500">Dettes indisponibles.</p>
                <Button variant="secondary" onClick={() => void loadDebts()}>
                  Réessayer
                </Button>
              </div>
            ) : (
              <>
                <dl className="mb-2 space-y-1 rounded-xl bg-black/25 p-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <dt className="font-extrabold">Dette actuelle (solde)</dt>
                    <dd className="font-extrabold tabular-nums text-red-300">
                      {formatDzd(customer.outstanding_balance_minor)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <dt>Documents ouverts</dt>
                    <dd className="font-bold tabular-nums">{debtsRows.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between border-t border-white/10 pt-1.5">
                    <dt className="font-extrabold">Reste des documents</dt>
                    <dd className="font-extrabold tabular-nums text-amber-300">
                      {formatDzd(debtsRest)}
                    </dd>
                  </div>
                </dl>
                {debtsRows.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">Aucune dette ouverte.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                    {debtsRows.map((d) => (
                      <li
                        key={`${d.debt_type}:${d.entity_id}`}
                        className="space-y-1 px-3 py-2.5 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-slate-400">{d.ref}</span>
                          <span className="font-bold tabular-nums text-amber-300">
                            {formatDzd(asMinor(d.remaining_minor))}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{formatDateTimeFr(d.created_at)}</span>
                          <Badge tone={d.status === "overdue" ? "red" : "amber"}>
                            {debtStatusLabel(d.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>
                            Facturé {formatDzd(asMinor(d.original_minor))} · Réglé{" "}
                            {formatDzd(asMinor(d.paid_minor))}
                          </span>
                          <span>Échéance : {d.due_date ? d.due_date.slice(0, 10) : "—"}</span>
                        </div>
                        {d.debt_type === "customer" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewSaleId(d.entity_id)}
                              className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                              title={`Ouvrir la facture ${d.ref} (aperçu + réimpression)`}
                              aria-label={`Ouvrir la facture ${d.ref}`}
                            >
                              Facture
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : null}

        {tab === "historique" ? (
          <div role="tabpanel" id="client-panel-historique" aria-labelledby="client-tab-historique">
            {historyState === "loading" || historyState === "idle" ? (
              <p className="py-4 text-center text-sm text-slate-500" role="status">
                Chargement…
              </p>
            ) : historyState === "error" ? (
              <div className="space-y-2 py-4 text-center">
                <p className="text-sm text-slate-500">Historique indisponible.</p>
                <Button variant="secondary" onClick={() => void loadHistory()}>
                  Réessayer
                </Button>
              </div>
            ) : historyRows.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aucune opération.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10">
                {historyRows.map((h) => {
                  const known = historyKindOf(h.kind);
                  return (
                    <li key={`${h.kind}:${h.entity_id}`} className="space-y-1 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{known ? KIND_LABELS[known] : h.kind}</span>
                        <span className="font-bold tabular-nums">
                          {h.amount_minor == null ? "—" : formatDzd(asMinor(h.amount_minor))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="min-w-0 truncate">{h.label || h.ref || "—"}</span>
                        <span className="shrink-0">{formatDateTimeFr(h.created_at)}</span>
                      </div>
                      <div>
                        <Badge tone={known ? kindTone(known) : "grey"}>{h.ref || "—"}</Badge>
                      </div>
                      {h.kind === "sale" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewSaleId(h.entity_id)}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white"
                            title={`Ouvrir ${h.ref || "la vente"} (aperçu + réimpression)`}
                            aria-label={`Ouvrir ${h.ref || "la vente"}`}
                          >
                            Ouvrir
                          </button>
                        </div>
                      ) : h.kind === "payment_in" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void openReceipt(h.entity_id)}
                            disabled={receiptBusyId != null}
                            className="rounded-lg border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 hover:text-white disabled:opacity-50"
                            title={`Reçu de règlement ${h.ref || "sans réf."} (soldes reconstitués)`}
                            aria-label={`Imprimer le reçu ${h.ref || h.entity_id}`}
                          >
                            {receiptBusyId === h.entity_id ? "Chargement…" : "Reçu"}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </Drawer>
      {payOpen ? (
        <PaymentDialog
          customer={customer}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            onChanged();
            onClose();
          }}
          notify={notify}
        />
      ) : null}
      {previewSaleId != null ? (
        <InvoicePreviewModal
          saleId={previewSaleId}
          title={`Facture ${sales.find((s) => s.id === previewSaleId)?.invoice_number ?? ""}`}
          onClose={() => setPreviewSaleId(null)}
          notify={notify}
        />
      ) : null}
      {receiptTicket ? (
        <PaymentTicketModal
          ticket={receiptTicket}
          onClose={() => setReceiptTicket(null)}
          notify={notify}
        />
      ) : null}
      {slip ? (
        <SlipPreviewModal
          title={slip.title}
          text80={slip.text80}
          htmlA4={slip.htmlA4}
          busy={slipBusy}
          onClose={() => setSlip(null)}
          onPrint={(mode) => void printSlip(mode)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Formulaire client (création + édition).
// ---------------------------------------------------------------------------

export function ClientFormDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const editing = customer != null;
  const [full, setFull] = useState(customer ? fullName(customer) : "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [creditAllowed, setCreditAllowed] = useState(customer?.credit_allowed === 1);
  const [settleDay, setSettleDay] = useState(
    customer?.settlement_day != null ? String(customer.settlement_day) : "",
  );
  const [creditLimit, setCreditLimit] = useState(
    customer && customer.credit_limit_minor > 0 ? minorToInput(customer.credit_limit_minor) : "",
  );
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [creditOpen, setCreditOpen] = useState(true);
  // Idempotence (migration 0022) : un UUID par dialogue de création, régénéré
  // après succès — rejouer le même UUID retrouve le client existant.
  const [operationId, setOperationId] = useState<string>(() => newOperationId());

  // Plafond par défaut des réglages (création uniquement, champ intact).
  useEffect(() => {
    if (customer != null) return;
    api
      .settingsGet({ key: "customers" })
      .then((v) => {
        const d = (v as { value: { defaultCreditLimitMinor: number } }).value;
        if (d.defaultCreditLimitMinor > 0) {
          setCreditLimit((prev) => (prev === "" ? minorToInput(d.defaultCreditLimitMinor) : prev));
          setCreditAllowed(true);
        }
      })
      .catch(() => undefined);
    api
      .settingsGet({ key: "sales" })
      .then((v) => {
        setCreditOpen((v as { value: { allowCreditSales: boolean } }).value.allowCreditSales);
      })
      .catch(() => undefined);
  }, []);

  async function save(): Promise<void> {
    const { firstName, lastName } = splitFullName(full);
    if (firstName.length < 1 || lastName.length < 1) {
      notify("Nom complet requis (prénom + nom).", "err");
      return;
    }
    // P1-5 : strict (bornes H-1, jamais NaN) — erreur FR mappée.
    let limitMinor = 0;
    if (creditAllowed) {
      try {
        limitMinor = parseDzdInputStrict(
          creditLimit.trim() === "" ? "0" : creditLimit,
          "Plafond de crédit",
        );
      } catch (e) {
        notify(frError(e, "Plafond de crédit invalide."), "err");
        return;
      }
    }
    const settleTrimmed = settleDay.trim();
    const settle: number | null =
      settleTrimmed === "" ? null : Number(settleTrimmed.replace(",", "."));
    if (settle !== null && (!Number.isInteger(settle) || settle < 1 || settle > 31)) {
      notify("Jour de règlement invalide (1 – 31, vide = sans échéance).", "err");
      return;
    }
    if (phone.trim().length > 30) {
      notify("Téléphone trop long (30 max).", "err");
      return;
    }
    if (address.trim().length > 300) {
      notify("Adresse trop longue (300 max).", "err");
      return;
    }
    if (notes.trim().length > 500) {
      notify("Notes trop longues (500 max).", "err");
      return;
    }
    setBusy(true);
    try {
      if (customer == null) {
        await api.customerCreate({
          operationId,
          firstName,
          lastName,
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          creditLimitMinor: limitMinor,
          initialBalanceMinor: 0,
          settlementDay: settle,
          isBreadClient: false,
          creditAllowed,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        setOperationId(newOperationId());
        notify(`Client « ${firstName} ${lastName} » créé.`, "ok");
      } else {
        await api.customerUpdate({
          id: customer.id,
          firstName,
          lastName,
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          creditLimitMinor: limitMinor,
          creditAllowed,
          settlementDay: settle,
          notes: notes.trim() === "" ? null : notes.trim(),
        });
        notify("Fiche client enregistrée.", "ok");
      }
      onSaved();
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      label={editing ? "Modifier le client" : "Nouveau client"}
      title={editing ? "Modifier le client" : "Nouveau client"}
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
        <Field label="Nom complet" hint="Prénom + nom (le dernier mot = nom de famille).">
          <TextInput
            value={full}
            onChange={(e) => setFull(e.target.value)}
            placeholder="Ex. : Amine Benali"
            aria-label="Nom complet"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone">
            <TextInput
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="Ex. : 0550 12 34 56"
              aria-label="Téléphone"
            />
          </Field>
          <Field label="Adresse">
            <TextInput
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex. : Alger centre"
              aria-label="Adresse"
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold">
          <span>
            Crédit autorisé
            <span className="block text-xs font-normal text-slate-500">
              Autorise les impayés (vente à crédit). Sans plafond, tout impayé reste possible.
            </span>
            {!creditOpen ? (
              <span className="block text-xs font-bold text-red-300">
                Crédit général coupé (Paramètres → Vente).
              </span>
            ) : null}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={creditAllowed}
            aria-label="Crédit autorisé"
            onClick={() => setCreditAllowed((a) => !a)}
            className={cn(
              "relative h-7 w-12 shrink-0 rounded-full transition-colors",
              creditAllowed ? "bg-amber-400" : "bg-white/15",
            )}
          >
            <span
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                creditAllowed ? "left-6" : "left-1",
              )}
            />
          </button>
        </label>
        {creditAllowed ? (
          <Field label="Plafond de crédit (DZD)" hint="Alerte dépassement au-delà.">
            <TextInput
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              aria-label="Plafond de crédit"
            />
          </Field>
        ) : null}
        <Field
          label="Jour de règlement (1 – 31)"
          hint="Ex. 14 = paie chaque 14. Vide = sans échéance."
        >
          <TextInput
            value={settleDay}
            onChange={(e) => setSettleDay(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            aria-label="Jour de règlement mensuel"
          />
        </Field>
        <Field label="Notes" hint="Optionnel (500 caractères max).">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : paie en fin de mois…"
            aria-label="Notes"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" disabled={busy} className="flex-[2]">
            {busy ? "Enregistrement…" : editing ? "Enregistrer" : "Créer le client"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Règlement (encaissement standalone borné par la dette).
// ---------------------------------------------------------------------------

export function PaymentDialog({
  customer,
  onClose,
  onSaved,
  notify,
}: {
  customer: EnrichedCustomer;
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}): React.JSX.Element {
  const [amount, setAmount] = useState(
    customer.outstanding_balance_minor > 0 ? minorToInput(customer.outstanding_balance_minor) : "",
  );
  const [method, setMethod] = useState<"cash" | "cheque" | "transfer">("cash");
  const [busy, setBusy] = useState(false);
  // Idempotence (migration 0020) : rejouer le même UUID retrouve le paiement
  // au lieu de le dupliquer (retry IPC, double-clic avant le verrou `busy`).
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  // Reçu de règlement proposé après succès.
  const [ticket, setTicket] = useState<PaymentTicketInput | null>(null);

  // P1-5 : strict (bornes H-1, jamais NaN) ; invalide → règlement refusé.
  let parsed = 0;
  let parsedOk = true;
  try {
    parsed = parseDzdInputStrict(amount.trim() === "" ? "0" : amount, "Montant");
  } catch {
    parsedOk = false;
  }
  const valid = parsedOk && Number.isInteger(parsed) && parsed > 0;
  const newBalance =
    valid && parsed <= customer.outstanding_balance_minor
      ? customer.outstanding_balance_minor - parsed
      : null;

  async function save(): Promise<void> {
    if (!valid) {
      notify("Montant invalide.", "err");
      return;
    }
    if (parsed > customer.outstanding_balance_minor) {
      notify("Le montant dépasse la dette du client.", "err");
      return;
    }
    setBusy(true);
    try {
      const ack = await callChecked(
        (a) =>
          a.customers.recordPayment({
            operationId,
            customerId: customer.id,
            saleId: null,
            amountMinor: parsed,
            method,
          }),
        paymentAckSchema,
      );
      setOperationId(newOperationId());
      notify(`Paiement de ${formatDzd(parsed)} enregistré.`, "ok");
      // P5 : encaissement = caisse.
      playSound("cash");
      // Ticket de règlement proposé (aperçu + impression 80mm/A4).
      setTicket({
        kind: "customer",
        partyLabel: `${fullName(customer)} — ${formatCustomerCode(customer.id)}`,
        reference: ack.paymentId > 0 ? `PAY-${String(ack.paymentId).padStart(5, "0")}` : "",
        date: todayUtcDate(),
        amountMinor: parsed,
        method,
        prevBalanceMinor: customer.outstanding_balance_minor,
        newBalanceMinor: customer.outstanding_balance_minor - parsed,
        notes: "",
      });
    } catch (e) {
      notify(frError(e, "Règlement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal label="Règlement client" title={`Règlement — ${fullName(customer)}`} onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <dl className="space-y-1.5 rounded-xl bg-black/25 p-4 text-sm">
            <div className="flex justify-between text-slate-300">
              <dt>Client</dt>
              <dd className="font-semibold">{fullName(customer)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <dt className="font-extrabold">Dette actuelle</dt>
              <dd className="text-xl font-extrabold tabular-nums text-red-300">
                {formatDzd(customer.outstanding_balance_minor)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-extrabold">Nouveau solde</dt>
              <dd className="text-lg font-extrabold tabular-nums text-emerald-300">
                {newBalance != null ? formatDzd(newBalance) : "—"}
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Montant (DZD)">
              <TextInput
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Montant du règlement"
              />
            </Field>
            <Field label="Moyen de paiement">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "cheque" | "transfer")}
                aria-label="Moyen de paiement"
              >
                <option value="cash">{PAYMENT_METHOD_LABELS["cash"]}</option>
                <option value="cheque">{PAYMENT_METHOD_LABELS["cheque"]}</option>
                <option value="transfer">{PAYMENT_METHOD_LABELS["transfer"]}</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Annuler
            </Button>
            <Button type="submit" disabled={busy} className="flex-[2]">
              {busy ? "Enregistrement…" : "Enregistrer le paiement"}
            </Button>
          </div>
        </form>
      </Modal>
      {ticket ? (
        <PaymentTicketModal
          ticket={ticket}
          onClose={() => {
            setTicket(null);
            onSaved();
          }}
          notify={notify}
        />
      ) : null}
    </>
  );
}
