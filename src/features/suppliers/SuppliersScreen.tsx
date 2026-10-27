// Veloria PoS — Écran : Fournisseurs (fiches, achats, dettes, paiements).
// En-tête + 4 cartes stats + barre d'outils + table enrichie (serveur) +
// pagination + tiroir détail + formulaire + paiement + historique.
import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Download,
  Eye,
  HandCoins,
  History,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { newOperationId } from "@domain/common/ids.ts";
import { formatDzd } from "@domain/money/money.ts";
import {
  ErrorState,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pager,
  RowAction,
  SearchField,
  Select,
  StatsStrip,
  Toolbar,
  cn,
} from "@shared/ui/primitives.tsx";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { downloadCsv } from "@shared/export/csv.ts";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { useLoadSeq } from "@shared/ui/use-load-seq.ts";
import {
  SupplierDetailsDrawer,
  SupplierFormDialog,
  SupplierHistoryDrawer,
  SupplierPaymentDialog,
} from "./SupplierDialogs.tsx";
import { SupplierPOsDialog } from "./SupplierPOsDialog.tsx";
import {
  hasSupplierDebt,
  supplierCode,
  supplierStatusLabel,
  supplierStatusTone,
  type EnrichedSupplier,
  type StatementIntake,
  type StatementIntakeItem,
  type StatementPayment,
  type Supplier,
  type SupplierPaymentFilter,
  type SupplierSort,
  type SupplierStatusFilter,
} from "./types.ts";

import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";

const PAGE_SIZE = 20;

interface Stats {
  total: number;
  active: number;
  purchases: number;
  debt: number;
}

export interface SupplierStatement {
  supplier: Supplier;
  intakes: StatementIntake[];
  intakeItems: StatementIntakeItem[];
  payments: StatementPayment[];
}

export function SuppliersScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<SupplierPaymentFilter>("all");
  const [sort, setSort] = useState<SupplierSort>("name_asc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EnrichedSupplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A-06 : erreur de chargement PERSISTANTE (le toast dure 4,5 s).
  // Distingue « échec du chargement » de « aucune donnée ».
  const [loadError, setLoadError] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, purchases: 0, debt: 0 });
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<SupplierStatement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [payFor, setPayFor] = useState<Supplier | null>(null);
  // P3 : bons de commande du fournisseur sélectionné.
  const [posFor, setPosFor] = useState<Supplier | null>(null);
  const [historyFor, setHistoryFor] = useState<{
    statement: SupplierStatement;
    tab: "purchases" | "payments";
  } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const queryTimer = useDebouncedTimer();
  const searchRef = useRef<HTMLInputElement>(null);
  // Confirmation non bloquante (modale applicative).
  const confirmAsync = useConfirm();

  // F3 : focus recherche (comme en caisse).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isAnyModalOpen()) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadStats(): Promise<void> {
    try {
      const s = (await api.supplierStats()) as {
        totalSuppliers: number;
        activeSuppliers: number;
        totalPurchasesMinor: number;
        totalDebtMinor: number;
      };
      setStats({
        total: s.totalSuppliers,
        active: s.activeSuppliers,
        purchases: s.totalPurchasesMinor,
        debt: s.totalDebtMinor,
      });
    } catch {
      /* stats optionnelles */
    }
  }

  // P1-2 : séquence anti-course partagée par load/loadStats.
  const { next: nextSeq, isCurrent: isSeqCurrent } = useLoadSeq();

  async function load(
    q: string,
    status: SupplierStatusFilter,
    payment: SupplierPaymentFilter,
    s: SupplierSort,
    p: number,
  ): Promise<void> {
    const seq = nextSeq();
    setLoading(true);
    setLoadError("");
    try {
      const res = (await api.supplierSearch({
        query: q.trim(),
        statusFilter: status,
        paymentFilter: payment,
        sort: s,
        page: p,
        pageSize: PAGE_SIZE,
      })) as { rows: EnrichedSupplier[]; total: number };
      if (!isSeqCurrent(seq)) return;
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      if (!isSeqCurrent(seq)) return;
      const loadErrorMessage = frError(err, "Chargement impossible.");
      setLoadError(loadErrorMessage);
      notify(loadErrorMessage, "err");
    } finally {
      if (isSeqCurrent(seq)) setLoading(false);
    }
  }

  // Chargement initial.
  useEffect(() => {
    void loadStats();
    void load("", "all", "all", "name_asc", 1);
  }, []);

  function onQueryChange(q: string): void {
    setQuery(q);
    setPage(1);
    queryTimer.schedule(250, () => {
      void load(q, statusFilter, paymentFilter, sort, 1);
    });
  }

  function changeStatus(f: SupplierStatusFilter): void {
    setStatusFilter(f);
    setPage(1);
    setSelection(new Set());
    void load(query, f, paymentFilter, sort, 1);
  }

  function changePayment(f: SupplierPaymentFilter): void {
    setPaymentFilter(f);
    setPage(1);
    void load(query, statusFilter, f, sort, 1);
  }

  function changeSort(s: SupplierSort): void {
    setSort(s);
    setPage(1);
    void load(query, statusFilter, paymentFilter, s, 1);
  }

  function changePage(p: number): void {
    setPage(p);
    void load(query, statusFilter, paymentFilter, sort, p);
  }

  function refresh(): void {
    setSelection(new Set());
    void loadStats();
    void load(query, statusFilter, paymentFilter, sort, page);
  }

  function resetFilters(): void {
    setQuery("");
    setStatusFilter("all");
    setPaymentFilter("all");
    setSort("name_asc");
    setPage(1);
    setSelection(new Set());
    void load("", "all", "all", "name_asc", 1);
  }

  function openCreate(): void {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(s: Supplier): void {
    setDrawer(null);
    setHistoryFor(null);
    setEditing(s);
    setFormOpen(true);
  }

  async function openDrawer(s: EnrichedSupplier | Supplier): Promise<void> {
    try {
      const st = (await api.supplierStatement({ id: s.id })) as SupplierStatement;
      setDrawer(st);
    } catch (e) {
      notify(frError(e, "Détail indisponible."), "err");
    }
  }

  async function openHistory(
    s: EnrichedSupplier | Supplier,
    tab: "purchases" | "payments" = "purchases",
  ): Promise<void> {
    try {
      const st = (await api.supplierStatement({ id: s.id })) as SupplierStatement;
      setHistoryFor({ statement: st, tab });
    } catch (e) {
      notify(frError(e, "Historique indisponible."), "err");
    }
  }

  async function removeRow(s: EnrichedSupplier): Promise<void> {
    if (
      !(await confirmAsync(
        `Supprimer « ${s.name} » ? Possible uniquement si le solde est soldé et sans historique lié.`,
      ))
    )
      return;
    try {
      // M-2: caller-owned operation (one confirmed action = one operation).
      await api.supplierDelete({ id: s.id, operationId: newOperationId() });
      notify(`Fournisseur « ${s.name} » supprimé.`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    }
  }

  function toggleSelect(id: number): void {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage(): void {
    setSelection((prev) => {
      const next = new Set(prev);
      const allSelected = rows.length > 0 && rows.every((r) => next.has(r.id));
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  }

  async function deleteSelection(): Promise<void> {
    if (selection.size === 0 || bulkBusy) return;
    if (
      !(await confirmAsync(
        `Supprimer ${selection.size} fournisseur(s) ? Tout-ou-rien : chaque fiche doit être soldée et sans historique lié.`,
      ))
    )
      return;
    setBulkBusy(true);
    try {
      const res = (await api.suppliersDeleteMany({
        ids: [...selection],
        operationId: newOperationId(),
      })) as { deleted: number };
      notify(`${res.deleted} fournisseur(s) supprimé(s).`, "ok");
      refresh();
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCsv(): void {
    if (rows.length === 0) {
      notify("Rien à exporter.", "err");
      return;
    }
    try {
      downloadCsv(
        `fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`,
        rows.map((s) => ({
          Code: supplierCode(s),
          Fournisseur: s.name,
          Contact: s.contact_person || "",
          Téléphone: s.phone || "",
          Adresse: s.address || "",
          Achats: formatDzd(s.total_purchases_minor),
          Payé: formatDzd(s.total_paid_minor),
          Dette: formatDzd(s.outstanding_balance_minor),
          Statut: supplierStatusLabel(s),
        })),
      );
      notify(`${rows.length} ligne(s) exportée(s).`, "ok");
    } catch {
      notify("Export impossible.", "err");
    }
  }

  const allPageSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));

  return (
    <div className="flex h-full flex-col gap-4">
      {/* En-tête Stitch : Fournisseurs & Approvisionnements · REGISTRE ACHATS DZD */}
      <PageHeader
        title="Fournisseurs et approvisionnements"
        module="Fournisseurs · achats et dettes"
        period={`${total} fournisseur(s) référencé(s) · ${formatDzd(stats.debt)} de dettes à régler`}
        actions={
          <>
            <SearchField
              value={query}
              onChange={onQueryChange}
              placeholder="Rechercher… [F3]"
              ariaLabel="Rechercher un fournisseur"
              inputRef={searchRef}
              className="w-full sm:w-64"
            />
            <Button onClick={openCreate} title="Créer un fournisseur">
              <Plus size={16} aria-hidden="true" /> Nouveau Fournisseur
            </Button>
          </>
        }
      />

      <StatsStrip
        items={[
          { label: "Fiches totales", value: String(stats.total), sub: "Fournisseurs référencés" },
          {
            label: "Avec dette",
            value: String(stats.active),
            sub: "Comptes avec encours",
            tone: stats.active > 0 ? "amber" : "default",
          },
          {
            label: "Total dettes fournisseurs",
            value: formatDzd(stats.debt),
            sub: "À décaisser",
            tone: stats.debt > 0 ? "red" : "default",
          },
          {
            label: "Achats cumulés",
            value: formatDzd(stats.purchases),
            sub: "Entrées validées",
            tone: stats.purchases > 0 ? "green" : "default",
          },
        ]}
      />

      <Toolbar>
        <Select
          id="suppliers-status"
          value={statusFilter}
          onChange={(e) => changeStatus(e.target.value as SupplierStatusFilter)}
          aria-label="Filtre statut"
          className="w-auto"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </Select>
        <Select
          id="suppliers-payment"
          value={paymentFilter}
          onChange={(e) => changePayment(e.target.value as SupplierPaymentFilter)}
          aria-label="Filtre paiement"
          className="w-auto"
        >
          <option value="all">Tous les paiements</option>
          <option value="with_debt">Avec dette</option>
          <option value="settled">Soldés</option>
        </Select>
        <Select
          id="suppliers-sort"
          value={sort}
          onChange={(e) => changeSort(e.target.value as SupplierSort)}
          aria-label="Tri"
          className="w-auto"
        >
          <option value="name_asc">Tri : nom A → Z</option>
          <option value="name_desc">Tri : nom Z → A</option>
          <option value="purchases_desc">Tri : achats décroissants</option>
          <option value="debt_desc">Tri : dette décroissante</option>
          <option value="recent_desc">Tri : achats récents</option>
        </Select>
        <Button variant="ghost" onClick={resetFilters} title="Réinitialiser les filtres">
          <X size={15} aria-hidden="true" /> Réinitialiser
        </Button>
        <div className="ml-auto">
          <Button variant="ghost" onClick={exportCsv} title="Exporter la liste (CSV)">
            <Download size={15} aria-hidden="true" /> Exporter
          </Button>
        </div>
      </Toolbar>

      {/* Sélection multiple */}
      {selection.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-2.5 text-sm">
          <strong>{selection.size} sélectionné(s)</strong>
          <Button variant="secondary" onClick={() => void deleteSelection()} disabled={bulkBusy}>
            <Trash2 size={15} aria-hidden="true" />{" "}
            {bulkBusy ? "Suppression…" : "Supprimer la sélection"}
          </Button>
          <button
            type="button"
            onClick={() => setSelection(new Set())}
            className="text-xs font-semibold text-slate-400 hover:text-white"
          >
            Tout désélectionner
          </button>
        </div>
      ) : null}

      {/* Table fournisseurs */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-auto">
          {loadError ? (
            <ErrorState message={loadError} />
          ) : loading && rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500" role="status">
              Chargement…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucun fournisseur"
              hint="Modifiez la recherche ou créez votre premier fournisseur avec le bouton « Nouveau Fournisseur »."
            />
          ) : (
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="sticky top-0 bg-[#122131] text-left text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Sélectionner la page"
                      className="h-4 w-4 accent-amber-400"
                    />
                  </th>
                  <th className="px-3 py-2.5">Code</th>
                  <th className="px-3 py-2.5">Fournisseur</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5">Téléphone</th>
                  <th className="px-3 py-2.5">Adresse</th>
                  <th className="px-3 py-2.5 text-right">Achats</th>
                  <th className="px-3 py-2.5 text-right">Payé</th>
                  <th className="px-3 py-2.5 text-right">Dette</th>
                  <th className="px-3 py-2.5">Statut</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => void openDrawer(s)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition-colors hover:bg-amber-400/[0.06]",
                      selection.has(s.id) && "bg-amber-400/[0.08]",
                    )}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selection.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`Sélectionner ${s.name}`}
                        className="h-4 w-4 accent-amber-400"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400">
                      {supplierCode(s)}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-semibold">{s.name}</td>
                    <td className="max-w-[150px] truncate px-3 py-2 text-slate-300">
                      {s.contact_person || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{s.phone || "—"}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-slate-400">
                      {s.address || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {formatDzd(s.total_purchases_minor)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">
                      {formatDzd(s.total_paid_minor)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-bold tabular-nums",
                        hasSupplierDebt(s) ? "text-red-300" : "text-slate-500",
                      )}
                    >
                      {formatDzd(s.outstanding_balance_minor)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={supplierStatusTone(s)}>{supplierStatusLabel(s)}</Badge>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <RowAction
                          label={`Voir ${s.name}`}
                          title="Détails de la fiche"
                          onClick={() => void openDrawer(s)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Modifier ${s.name}`}
                          title="Modifier"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Paiement ${s.name}`}
                          title={
                            hasSupplierDebt(s) ? "Enregistrer un paiement" : "Aucune dette à régler"
                          }
                          disabled={!hasSupplierDebt(s)}
                          onClick={() => setPayFor(s)}
                        >
                          <HandCoins size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Historique ${s.name}`}
                          title="Historique des achats"
                          onClick={() => void openHistory(s)}
                        >
                          <History size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Commandes ${s.name}`}
                          title="Bons de commande"
                          onClick={() => setPosFor(s)}
                        >
                          <ClipboardList size={15} aria-hidden="true" />
                        </RowAction>
                        <RowAction
                          label={`Supprimer ${s.name}`}
                          title="Supprimer"
                          onClick={() => void removeRow(s)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </RowAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-3">
          <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={changePage} />
          {loading ? (
            <span className="text-xs text-slate-500" role="status">
              Chargement…
            </span>
          ) : null}
        </div>
      </Card>

      {/* Tiroir détail */}
      {drawer ? (
        <SupplierDetailsDrawer
          statement={drawer}
          onClose={() => setDrawer(null)}
          onEdit={openEdit}
          onPay={(s) => {
            setDrawer(null);
            setPayFor(s);
          }}
          onHistory={(st, tab) => {
            setDrawer(null);
            setHistoryFor({ statement: st, tab });
          }}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}

      {/* Formulaire création / édition */}
      {formOpen ? (
        <SupplierFormDialog
          supplier={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Paiement fournisseur */}
      {payFor ? (
        <SupplierPaymentDialog
          supplier={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            refresh();
          }}
          notify={notify}
        />
      ) : null}

      {/* Historique des achats */}
      {historyFor ? (
        <SupplierHistoryDrawer
          statement={historyFor.statement}
          initialTab={historyFor.tab}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}
      {/* Bons de commande fournisseur (P3) */}
      {posFor ? (
        <SupplierPOsDialog
          supplierId={posFor.id}
          supplierName={posFor.name}
          onClose={() => setPosFor(null)}
          onChanged={refresh}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
