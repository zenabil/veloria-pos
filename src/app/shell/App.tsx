// Veloria PoS — Shell canonique (top bar + navigation basse 14 modules, notifications globales).
// UI français uniquement, thème sombre desktop, keyboard-first.
import { useCallback, useState } from "react";
import { DashboardScreen } from "@features/dashboard/DashboardScreen.tsx";
import { SellScreen } from "@features/sales/SellScreen.tsx";
import { HistoryScreen } from "@features/sales/HistoryScreen.tsx";
import { ProductsScreen } from "@features/products/ProductsScreen.tsx";
import { CustomersScreen } from "@features/customers/CustomersScreen.tsx";
import { StockScreen } from "@features/stock/StockScreen.tsx";
import { ReturnsScreen } from "@features/returns/ReturnsScreen.tsx";
import { ExpensesScreen } from "@features/expenses/ExpensesScreen.tsx";
import { DebtsScreen } from "@features/debts/DebtsScreen.tsx";
import { ReportsScreen } from "@features/reports/ReportsScreen.tsx";
import { BreadScreen } from "@features/bread/BreadScreen.tsx";
import { ProformasScreen } from "@features/proformas/ProformasScreen.tsx";
import { ZakatScreen } from "@features/zakat/ZakatScreen.tsx";
import { SettingsScreen } from "@features/settings/SettingsScreen.tsx";
import { cn } from "@shared/ui/primitives.tsx";

type ModuleId =
  | "dashboard"
  | "sell"
  | "products"
  | "customers"
  | "stock"
  | "history"
  | "returns"
  | "expenses"
  | "debts"
  | "reports"
  | "bread"
  | "proformas"
  | "zakat"
  | "settings";

interface ModuleDef {
  id: ModuleId;
  label: string;
  hint: string;
}

const MODULES: ModuleDef[] = [
  { id: "dashboard", label: "Tableau de bord", hint: "Vue d'ensemble" },
  { id: "sell", label: "Vente", hint: "Caisse [F3/F10]" },
  { id: "products", label: "Catalogue", hint: "Produits" },
  { id: "customers", label: "Clients", hint: "Dettes et soldes" },
  { id: "stock", label: "Stock", hint: "Entrées et inventaire" },
  { id: "history", label: "Historique", hint: "Ventes validées" },
  { id: "returns", label: "Retours", hint: "Remboursement et avoir" },
  { id: "expenses", label: "Dépenses", hint: "Charges" },
  { id: "debts", label: "Dettes", hint: "Échéances et relances" },
  { id: "reports", label: "Rapports", hint: "Clôture et analyses" },
  { id: "bread", label: "Pain", hint: "Commandes et retraits" },
  { id: "proformas", label: "Proformas", hint: "Devis et conversions" },
  { id: "zakat", label: "Zakat", hint: "Calcul et rapport" },
  { id: "settings", label: "Paramètres", hint: "Base et sauvegardes" },
];

type ToastKind = "ok" | "err";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let toastSeq = 0;

export function App(): React.JSX.Element {
  const [active, setActive] = useState<ModuleId>("sell");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, kind: ToastKind = "ok"): void => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#0b0f14] text-slate-100">
      {/* Barre supérieure canonique */}
      <header className="flex items-center justify-between border-b border-white/[0.07] bg-[#11161d] px-4 py-2">
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-emerald-400 text-lg font-black text-black"
            aria-hidden="true"
          >
            V
          </span>
          <div>
            <div className="text-sm font-extrabold leading-tight">Veloria PoS</div>
            <div className="text-xs text-slate-400">Point de vente · Français · DZD</div>
          </div>
        </div>
        <div className="text-xs text-slate-400" role="status">
          Hors-ligne · Base locale <span className="font-mono">Veloria POS DB.sqlite</span>
        </div>
      </header>

      {/* Contenu */}
      <main className="min-h-0 flex-1 overflow-auto p-4" aria-live="polite">
        {active === "dashboard" ? <DashboardScreen notify={notify} /> : null}
        {active === "sell" ? <SellScreen notify={notify} /> : null}
        {active === "products" ? <ProductsScreen notify={notify} /> : null}
        {active === "customers" ? <CustomersScreen notify={notify} /> : null}
        {active === "stock" ? <StockScreen notify={notify} /> : null}
        {active === "history" ? <HistoryScreen notify={notify} /> : null}
        {active === "returns" ? <ReturnsScreen notify={notify} /> : null}
        {active === "expenses" ? <ExpensesScreen notify={notify} /> : null}
        {active === "debts" ? <DebtsScreen notify={notify} /> : null}
        {active === "reports" ? <ReportsScreen notify={notify} /> : null}
        {active === "bread" ? <BreadScreen notify={notify} /> : null}
        {active === "proformas" ? <ProformasScreen notify={notify} /> : null}
        {active === "zakat" ? <ZakatScreen notify={notify} /> : null}
        {active === "settings" ? <SettingsScreen notify={notify} /> : null}
      </main>

      {/* Notifications globales non bloquantes */}
      <div
        className="pointer-events-none fixed right-4 top-14 z-50 flex w-[360px] flex-col gap-2"
        aria-live="assertive"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "err" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto rounded-[10px] border px-3 py-2 text-sm shadow-lg",
              t.kind === "ok"
                ? "border-emerald-500/30 bg-[#0e1a14] text-emerald-100"
                : "border-red-500/30 bg-[#1c1113] text-red-100",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Navigation basse canonique : 14 modules, aucun bouton mort */}
      <nav
        className="border-t border-white/[0.07] bg-[#11161d] px-2 py-2"
        aria-label="Navigation principale"
      >
        <div className="grid grid-cols-7 gap-1">
          {MODULES.map((m) => {
            const selected = m.id === active;
            return (
              <button
                key={m.id}
                type="button"
                aria-current={selected ? "page" : undefined}
                title={m.hint}
                onClick={() => setActive(m.id)}
                className={cn(
                  "rounded-[10px] px-2 py-2 text-center transition-colors focus-visible:outline-none",
                  selected
                    ? "bg-emerald-400 font-bold text-black"
                    : "text-slate-300 hover:bg-white/5",
                )}
              >
                <span className="block text-xs font-semibold leading-tight">{m.label}</span>
                <span
                  className={cn(
                    "block truncate text-[10px] leading-tight",
                    selected ? "text-black/70" : "text-slate-500",
                  )}
                >
                  {m.hint}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
