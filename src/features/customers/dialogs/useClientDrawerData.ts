// Veloria PoS — Clients : relevé + listes paresseuses de la fiche 360.
// Extrait de `ClientDetailsDrawer` (découpage sans changement de comportement).
import { useEffect, useRef, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { asMinor, keepClient } from "../client-matching.ts";
import type { StatementSale } from "../types.ts";
import type { Notify } from "@shared/ui/primitives.tsx";
import type {
  ClientDebtItem,
  ClientHistoryItem,
  ClientReturnItem,
  ClientTabId,
  LazyState,
  StatementPayment,
} from "./types.ts";

/** Relevé (ventes + paiements) + onglets chargés paresseusement. */
export function useClientDrawerData({
  customerId,
  clientName,
  clientNorm,
  initialSales,
  notify,
}: {
  customerId: number;
  clientName: string;
  clientNorm: string;
  initialSales: StatementSale[];
  notify: Notify;
}): {
  tab: ClientTabId;
  setTab: (t: ClientTabId) => void;
  sales: StatementSale[];
  payments: StatementPayment[];
  statementLoading: boolean;
  returnsRows: ClientReturnItem[];
  returnsState: LazyState;
  debtsRows: ClientDebtItem[];
  debtsState: LazyState;
  historyRows: ClientHistoryItem[];
  historyState: LazyState;
  loadReturns: () => Promise<void>;
  loadDebts: () => Promise<void>;
  loadHistory: () => Promise<void>;
} {
  const [tab, setTab] = useState<ClientTabId>("factures");
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
  const seq = useRef(0);
  // A-14 (P2) : état des chargements paresseux en REF (source de vérité
  // synchrone). Le `useState` était lu dans la closure de l'effet
  // `useEffect(..., [tab])` ⇒ sa valeur pouvait être périmée ⇒ chargement
  // sauté (état « ready » périmé) ou dupliqué (état « idle » périmé) au
  // changement d'onglet rapide. Le ref est mis à jour à chaque écriture.
  const returnsStateRef = useRef<LazyState>("idle");
  const debtsStateRef = useRef<LazyState>("idle");
  const historyStateRef = useRef<LazyState>("idle");

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
      .customerStatement({ id: customerId })
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
  }, [customerId]);

  async function loadReturns(): Promise<void> {
    if (returnsStateRef.current === "loading" || returnsStateRef.current === "ready") return;
    returnsStateRef.current = "loading";
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
      returnsStateRef.current = "ready";
      setReturnsState("ready");
    } catch (e) {
      returnsStateRef.current = "error";
      setReturnsState("error");
      notify(frError(e, "Retours indisponibles."), "err");
    }
  }

  async function loadDebts(): Promise<void> {
    if (debtsStateRef.current === "loading" || debtsStateRef.current === "ready") return;
    debtsStateRef.current = "loading";
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
      debtsStateRef.current = "ready";
      setDebtsState("ready");
    } catch (e) {
      debtsStateRef.current = "error";
      setDebtsState("error");
      notify(frError(e, "Dettes indisponibles."), "err");
    }
  }

  async function loadHistory(): Promise<void> {
    if (historyStateRef.current === "loading" || historyStateRef.current === "ready") return;
    historyStateRef.current = "loading";
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
      historyStateRef.current = "ready";
      setHistoryState("ready");
    } catch (e) {
      historyStateRef.current = "error";
      setHistoryState("error");
      notify(frError(e, "Historique indisponible."), "err");
    }
  }

  useEffect(() => {
    if (tab === "retours") void loadReturns();
    else if (tab === "dettes") void loadDebts();
    else if (tab === "historique") void loadHistory();
    // Chargements paresseux à l'activation de l'onglet. A-14 : `customerId`
    // entre dans les dépendances (le tiroir peut changer de client sans
    // changer d'onglet) ; les guards sont lus dans des refs (état synchrone).
  }, [tab, customerId]);

  return {
    tab,
    setTab,
    sales,
    payments,
    statementLoading,
    returnsRows,
    returnsState,
    debtsRows,
    debtsState,
    historyRows,
    historyState,
    loadReturns,
    loadDebts,
    loadHistory,
  };
}
