// Veloria PoS — Coquille « Nova » (barre latérale + 16 modules, notifications globales).
// Interface en français uniquement, mode clavier d'abord.
// PERF (requête 5) : caisse (module d'accueil) chargée d'emblée, les 15 autres
// modules en lazy (chunks séparés) — premier affichage et mémoire réduits ;
// la navigation reste instantanée après le 1er chargement (cache modules).
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Croissant,
  FileText,
  HandCoins,
  History,
  KeyRound,
  LayoutDashboard,
  MoonStar,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { SellScreen } from "@features/sales/SellScreen.tsx";
const ProductsScreen = lazy(() =>
  import("@features/products/ProductsScreen.tsx").then((m) => ({ default: m.ProductsScreen })),
);
const ClientsScreen = lazy(() =>
  import("@features/customers/ClientsScreen.tsx").then((m) => ({ default: m.ClientsScreen })),
);
const SuppliersScreen = lazy(() =>
  import("@features/suppliers/SuppliersScreen.tsx").then((m) => ({ default: m.SuppliersScreen })),
);
const StockScreen = lazy(() =>
  import("@features/stock/StockScreen.tsx").then((m) => ({ default: m.StockScreen })),
);
const HistoryScreen = lazy(() =>
  import("@features/history/HistoryScreen.tsx").then((m) => ({ default: m.HistoryScreen })),
);
const ReturnsScreen = lazy(() =>
  import("@features/returns/ReturnsScreen.tsx").then((m) => ({ default: m.ReturnsScreen })),
);
const ExpensesScreen = lazy(() =>
  import("@features/expenses/ExpensesScreen.tsx").then((m) => ({ default: m.ExpensesScreen })),
);
const DebtsScreen = lazy(() =>
  import("@features/debts/DebtsScreen.tsx").then((m) => ({ default: m.DebtsScreen })),
);
const ReportsScreen = lazy(() =>
  import("@features/reports/ReportsScreen.tsx").then((m) => ({ default: m.ReportsScreen })),
);
const ProformasScreen = lazy(() =>
  import("@features/proformas/ProformasScreen.tsx").then((m) => ({ default: m.ProformasScreen })),
);
const ZakatScreen = lazy(() =>
  import("@features/zakat/ZakatScreen.tsx").then((m) => ({ default: m.ZakatScreen })),
);
const BreadScreen = lazy(() =>
  import("@features/bread/BreadScreen.tsx").then((m) => ({ default: m.BreadScreen })),
);
const SettingsScreen = lazy(() =>
  import("@features/settings/SettingsScreen.tsx").then((m) => ({ default: m.SettingsScreen })),
);
const DashboardScreen = lazy(() =>
  import("@features/dashboard/DashboardScreen.tsx").then((m) => ({ default: m.DashboardScreen })),
);
const LicenseScreen = lazy(() =>
  import("@features/license/LicenseScreen.tsx").then((m) => ({ default: m.LicenseScreen })),
);
import { useLicense } from "@features/license/use-license.ts";
import { LicenseBadge } from "@features/license/LicenseBadge.tsx";
import { LICENSE_BLOCKING_STATES } from "@features/license/types.ts";
import { Button, Card, cn } from "@shared/ui/primitives.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { loadSoundEnabled, playSound, unlockSound } from "@shared/sound/sound.ts";
import { WindowChrome } from "./WindowChrome.tsx";

export type ModuleId =
  | "dashboard"
  | "sell"
  | "products"
  | "customers"
  | "suppliers"
  | "stock"
  | "history"
  | "returns"
  | "expenses"
  | "debts"
  | "reports"
  | "bread"
  | "proformas"
  | "zakat"
  | "settings"
  | "license";

/**
 * Module → pages licence requises (§10). Au moins UNE suffit
 * (bread = breadOrders OU pain). "license" toujours accessible.
 * La décision réelle est côté main ; ici : affichage + garde de route.
 */
const MODULE_PAGES: Record<ModuleId, readonly string[]> = {
  dashboard: ["dashboard"],
  sell: ["sales"],
  products: ["products"],
  customers: ["customers"],
  suppliers: ["suppliers"],
  stock: ["stock"],
  history: ["history"],
  returns: ["returns"],
  expenses: ["expenses"],
  debts: ["debts"],
  reports: ["reports"],
  bread: ["breadOrders", "pain"],
  proformas: ["proformas"],
  zakat: ["zakat"],
  settings: ["settings"],
  license: [],
};

interface ModuleDef {
  id: ModuleId;
  label: string;
  hint: string;
  icon: LucideIcon;
  ready: boolean;
}

const MODULES: ModuleDef[] = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    hint: "Vue d'ensemble",
    icon: LayoutDashboard,
    ready: true,
  },
  { id: "sell", label: "Vente", hint: "Caisse [F3/F10]", icon: ShoppingCart, ready: true },
  { id: "products", label: "Catalogue", hint: "Produits", icon: Package, ready: true },
  { id: "customers", label: "Clients", hint: "Dettes et soldes", icon: Users, ready: true },
  {
    id: "suppliers",
    label: "Fournisseurs",
    hint: "Achats et dettes",
    icon: Truck,
    ready: true,
  },
  {
    id: "stock",
    label: "Stock",
    hint: "Valeur, seuils et inventaire",
    icon: Warehouse,
    ready: true,
  },
  { id: "history", label: "Historique", hint: "Toutes les opérations", icon: History, ready: true },
  { id: "returns", label: "Retours", hint: "Clients et fournisseurs", icon: Undo2, ready: true },
  { id: "expenses", label: "Dépenses", hint: "Charges d'exploitation", icon: Wallet, ready: true },
  { id: "debts", label: "Dettes", hint: "Créances et échéances", icon: HandCoins, ready: true },
  { id: "reports", label: "Rapports", hint: "Activité et marges", icon: BarChart3, ready: true },
  { id: "bread", label: "Pain", hint: "Commandes et retraits", icon: Croissant, ready: true },
  {
    id: "proformas",
    label: "Proformas",
    hint: "Devis et conversions",
    icon: FileText,
    ready: true,
  },
  { id: "zakat", label: "Zakat", hint: "Calcul et rapport", icon: MoonStar, ready: true },
  {
    id: "settings",
    label: "Paramètres",
    hint: "Entreprise et préférences",
    icon: Settings,
    ready: true,
  },
  {
    id: "license",
    label: "Licence",
    hint: "Activation hors-ligne",
    icon: KeyRound,
    ready: true,
  },
];

type ToastKind = "ok" | "err";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let toastSeq = 0;

export type PrintMode = "80mm" | "A4";

const PRINT_MODE_KEY = "veloria.printMode";
const SIDEBAR_KEY = "veloria.sidebarCollapsed";

function initialPrintMode(): PrintMode {
  // Préférence d'interface uniquement (pas une donnée métier).
  try {
    return window.localStorage.getItem(PRINT_MODE_KEY) === "A4" ? "A4" : "80mm";
  } catch {
    return "80mm";
  }
}

function initialSidebarCollapsed(): boolean {
  // Préférence d'interface uniquement (pas une donnée métier) : même
  // mécanisme local que le mode d'impression, jamais la base SQLite.
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function App(): React.JSX.Element {
  const [active, setActive] = useState<ModuleId>("sell");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [printMode, setPrintModeState] = useState<PrintMode>(initialPrintMode);
  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarCollapsed);

  const toggleSidebar = useCallback((): void => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* préférence non persistée, état conservé en mémoire */
      }
      return next;
    });
  }, []);

  const setPrintMode = useCallback((mode: PrintMode): void => {
    setPrintModeState(mode);
    try {
      window.localStorage.setItem(PRINT_MODE_KEY, mode);
    } catch {
      /* préférence non persistée, mode conservé en mémoire */
    }
  }, []);

  // F2 : basculer le format d'impression (Ticket 80mm ↔ Facture A4).
  // Suspendu quand une modale est ouverte (comme tous les raccourcis caisse).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "F2") {
        if (isAnyModalOpen()) return;
        e.preventDefault();
        setPrintModeState((m) => {
          const next = m === "A4" ? "80mm" : "A4";
          try {
            window.localStorage.setItem(PRINT_MODE_KEY, next);
          } catch {
            /* préférence non persistée */
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "ok"): void => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, message, kind }]);
    // P5 : toute erreur notifiée bipe (hook global unique — les pages
    // n'ont rien à brancher une par une).
    if (kind === "err") {
      try {
        playSound("error");
      } catch {
        /* son best effort */
      }
    }
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // P5 : déverrouillage audio au premier geste + préférence SQLite.
  useEffect(() => {
    const unlock = (): void => {
      try {
        unlockSound();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    void loadSoundEnabled().catch(() => undefined);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Pont applicatif (preload Electron) : sans lui aucune donnée n'est
  // accessible. Plutôt qu'une erreur sur chaque page, un seul écran explicite.
  const [bridgeOk, setBridgeOk] = useState<boolean>(() => typeof window.veloria !== "undefined");
  useEffect(() => {
    if (typeof window.veloria === "undefined") {
      const t = window.setInterval(() => {
        if (typeof window.veloria !== "undefined") {
          setBridgeOk(true);
          window.clearInterval(t);
        }
      }, 500);
      return () => window.clearInterval(t);
    }
    return undefined;
  }, []);

  if (!bridgeOk) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0c1220] p-6 text-slate-100">
        <Card className="w-[480px] space-y-3 p-8 text-center">
          <img
            src="./icons/icon-192x192.png"
            alt="Logo Veloria"
            className="mx-auto h-16 w-16 rounded-[16px] object-cover"
            draggable={false}
          />
          <h1 className="text-xl font-extrabold tracking-tight">Pont applicatif indisponible</h1>
          <p className="text-sm text-slate-400">
            Veloria PoS doit être ouvert depuis l&apos;application de bureau (Electron). Si vous
            voyez cette page dans un navigateur, fermez cet onglet et lancez{" "}
            <strong className="text-slate-200">Veloria PoS</strong> depuis le raccourci Windows.
          </p>
          <Button onClick={() => setBridgeOk(typeof window.veloria !== "undefined")}>
            Réessayer
          </Button>
        </Card>
      </div>
    );
  }

  const current = MODULES.find((m) => m.id === active);
  const { status: licenseStatus, hasPageAccess } = useLicense();
  const licenseBlocked =
    licenseStatus?.enforcementActive === true &&
    LICENSE_BLOCKING_STATES.includes(
      licenseStatus.state as (typeof LICENSE_BLOCKING_STATES)[number],
    );
  const licenseExpired = licenseStatus?.state === "EXPIRED";

  // Garde de route (§10) : sidebar filtrée + accès direct bloqué.
  // Enveloppes legacy sans pages : le main expose tout autorisé.
  function moduleAllowed(id: ModuleId): boolean {
    if (id === "license") return true;
    if (!licenseStatus) return true;
    if (licenseBlocked) return true;
    const required = MODULE_PAGES[id];
    return required.some((p) => hasPageAccess(p));
  }
  const visibleModules = MODULES.filter((m) => moduleAllowed(m.id));
  const routeBlocked = !licenseBlocked && licenseStatus != null && !moduleAllowed(active);

  // Licence bloquante (build packagé sans activation valide) : écran
  // d'activation plein écran, jamais les modules métier.
  if (licenseBlocked) {
    return (
      <WindowChrome pageName="Licence">
        <div className="min-h-0 flex-1 overflow-auto bg-[#0c1220] p-6 text-slate-100">
          <LicenseScreen notify={notify} />
        </div>
      </WindowChrome>
    );
  }

  return (
    <WindowChrome pageName={current?.label ?? "Veloria PoS"}>
      <div className="flex min-h-0 flex-1 bg-[#0c1220] text-slate-100">
        {/* Barre latérale (repliable : icônes seules quand repliée) */}
        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-r border-white/[0.06] bg-[#0a0f1c] transition-[width] duration-200 ease-in-out",
            collapsed ? "w-[68px]" : "w-60",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-2.5 px-4 pb-4 pt-4",
              collapsed && "justify-center px-0",
            )}
          >
            <img
              src="./icons/icon-192x192.png"
              alt="Logo Veloria"
              className="h-9 w-9 shrink-0 rounded-[10px] object-cover"
              draggable={false}
            />
            {collapsed ? null : (
              <div className="min-w-0">
                <div className="truncate text-sm font-bold leading-tight tracking-tight text-slate-100">
                  Veloria PoS
                </div>
                <div className="text-[11px] text-slate-500">Point de vente · DZD</div>
              </div>
            )}
          </div>
          <nav
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
            aria-label="Navigation principale"
          >
            <ul className="space-y-1">
              {visibleModules.map((m) => {
                const selected = m.id === active;
                const Icon = m.icon;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      title={`${m.label} — ${m.hint}`}
                      onClick={() => setActive(m.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors duration-100 focus-visible:outline-none",
                        collapsed && "justify-center px-2",
                        selected
                          ? "bg-amber-400/[0.13] font-bold text-amber-100 shadow-[inset_3px_0_0_0_#fbbf24]"
                          : "font-medium text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
                      )}
                    >
                      <Icon
                        size={18}
                        strokeWidth={selected ? 2.25 : 2}
                        aria-hidden="true"
                        className={cn("shrink-0", selected ? "text-amber-300" : "text-slate-500")}
                      />
                      {collapsed ? null : (
                        <span className="min-w-0 flex-1 truncate leading-snug">{m.label}</span>
                      )}
                      {!collapsed && !m.ready ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600"
                          title="En reconstruction"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="px-3 pb-2">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Développer le menu" : "Réduire le menu"}
              title={collapsed ? "Développer le menu" : "Réduire le menu"}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-slate-500 transition-colors duration-100 hover:bg-white/[0.05] hover:text-slate-200 focus-visible:outline-none",
                collapsed && "justify-center px-2",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen size={18} aria-hidden="true" className="shrink-0" />
              ) : (
                <>
                  <PanelLeftClose size={18} aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left leading-snug">Réduire</span>
                </>
              )}
            </button>
          </div>
          <div className="border-t border-white/[0.06] px-4 py-3 text-[11px] leading-relaxed text-slate-600">
            {collapsed ? null : (
              <>
                Hors-ligne · Base locale
                <br />
                <span className="font-mono">Veloria POS DB.sqlite</span>
              </>
            )}
          </div>
        </aside>

        {/* Colonne principale */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0c1220] px-6 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold tracking-tight text-slate-100">
                  {current?.label}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">{current?.hint}</p>
              </div>
              <LicenseBadge status={licenseStatus} />
            </div>
            <div
              className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5"
              role="radiogroup"
              aria-label="Format d'impression [F2]"
              title="Format d'impression après une vente [F2 pour basculer]"
            >
              {(
                [
                  ["80mm", "Ticket 80mm"],
                  ["A4", "Facture A4"],
                ] as [PrintMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={printMode === mode}
                  title={label}
                  onClick={() => setPrintMode(mode)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-bold transition-colors duration-100",
                    printMode === mode
                      ? "bg-amber-400 text-black"
                      : "text-slate-500 hover:text-slate-200",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          {licenseExpired ? (
            <div
              role="alert"
              className="border-b border-amber-400/30 bg-[#171207] px-6 py-2 text-[13px] font-medium text-amber-100"
            >
              Licence expirée — consultation seule.{" "}
              <button
                type="button"
                onClick={() => setActive("license")}
                className="font-bold underline underline-offset-2 hover:text-amber-300"
              >
                Réactiver dans Licence
              </button>
            </div>
          ) : null}

          <main className="min-h-0 flex-1 overflow-auto p-6" aria-live="polite">
            {routeBlocked ? (
              <Card className="mx-auto mt-10 w-[520px] max-w-full space-y-3 p-8 text-center">
                <h2 className="text-lg font-extrabold tracking-tight">Fonction non disponible</h2>
                <p className="text-sm text-slate-400">
                  Le module « {current?.label} » n&apos;est pas inclus dans votre licence actuelle.
                  Contactez votre fournisseur pour l&apos;activer.
                </p>
                <Button onClick={() => setActive("license")}>Voir ma licence</Button>
              </Card>
            ) : (
              <Suspense
                fallback={
                  <p className="py-10 text-center text-sm text-slate-500" role="status">
                    Chargement du module…
                  </p>
                }
              >
                {active === "dashboard" ? (
                  <DashboardScreen notify={notify} onNavigate={(m) => setActive(m)} />
                ) : null}
                {active === "sell" ? <SellScreen notify={notify} printMode={printMode} /> : null}
                {active === "products" ? <ProductsScreen notify={notify} /> : null}
                {active === "customers" ? <ClientsScreen notify={notify} /> : null}
                {active === "suppliers" ? <SuppliersScreen notify={notify} /> : null}
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
                {active === "license" ? <LicenseScreen notify={notify} /> : null}
              </Suspense>
            )}
          </main>
        </div>

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
                "pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl",
                t.kind === "ok"
                  ? "border-amber-400/30 bg-[#171207] text-amber-100"
                  : "border-red-500/30 bg-[#1c1113] text-red-100",
              )}
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </WindowChrome>
  );
}
