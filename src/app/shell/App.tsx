// Veloria PoS — Coquille « Stitch » (barre latérale + 17 modules, notifications globales).
// Interface en français uniquement, mode clavier d'abord.
// PERF (requête 5) : caisse (module d'accueil) chargée d'emblée, les 16 autres
// modules en lazy (chunks séparés) — premier affichage et mémoire réduits ;
// la navigation reste instantanée après le 1er chargement (cache modules).
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  CircleHelp,
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
  Printer,
  Settings,
  ShoppingCart,
  Truck,
  Undo2,
  User,
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
const PrintTemplatesScreen = lazy(() =>
  import("@features/print-templates/PrintTemplatesScreen.tsx").then((m) => ({
    default: m.PrintTemplatesScreen,
  })),
);
const LicenseScreen = lazy(() =>
  import("@features/license/LicenseScreen.tsx").then((m) => ({ default: m.LicenseScreen })),
);
import { useLicense } from "@features/license/use-license.ts";
import { LicenseBadge } from "@features/license/LicenseBadge.tsx";
import { LICENSE_BLOCKING_STATES } from "@features/license/types.ts";
import { Button, Card, Modal, cn } from "@shared/ui/primitives.tsx";
import { ErrorBoundary } from "@shared/ui/error-boundary.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { api } from "@shared/types/ipc-client.ts";
import { backupFrequencyMinutes } from "@domain/backup/backup-rules.ts";
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
  | "templates"
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
  templates: ["settings", "invoices"],
  zakat: ["zakat"],
  settings: ["settings"],
  license: [],
};

interface ModuleDef {
  id: ModuleId;
  label: string;
  hint: string;
  icon: LucideIcon;
  kbd?: string;
  group: string;
}

const MODULE_GROUPS = ["Caisse", "Pilotage", "Marchandise", "Tiers", "Système"] as const;

const MODULES: ModuleDef[] = [
  {
    id: "sell",
    label: "Vente",
    hint: "Caisse [F1]",
    icon: ShoppingCart,
    kbd: "F1",
    group: "Caisse",
  },
  {
    id: "dashboard",
    label: "Tableau de bord",
    hint: "Vue d'ensemble",
    icon: LayoutDashboard,
    group: "Pilotage",
  },
  {
    id: "history",
    label: "Historique",
    hint: "Toutes les opérations",
    icon: History,
    group: "Pilotage",
  },
  {
    id: "reports",
    label: "Rapports",
    hint: "Activité et marges",
    icon: BarChart3,
    group: "Pilotage",
  },
  { id: "zakat", label: "Zakat", hint: "Calcul et rapport", icon: MoonStar, group: "Pilotage" },
  { id: "products", label: "Catalogue", hint: "Produits", icon: Package, group: "Marchandise" },
  {
    id: "stock",
    label: "Stock",
    hint: "Valeur, seuils et inventaire",
    icon: Warehouse,
    group: "Marchandise",
  },
  {
    id: "suppliers",
    label: "Fournisseurs",
    hint: "Achats et dettes",
    icon: Truck,
    group: "Marchandise",
  },
  {
    id: "bread",
    label: "Pain",
    hint: "Commandes et retraits",
    icon: Croissant,
    group: "Marchandise",
  },
  { id: "customers", label: "Clients", hint: "Dettes et soldes", icon: Users, group: "Tiers" },
  { id: "debts", label: "Dettes", hint: "Créances et échéances", icon: HandCoins, group: "Tiers" },
  { id: "returns", label: "Retours", hint: "Clients et fournisseurs", icon: Undo2, group: "Tiers" },
  {
    id: "expenses",
    label: "Dépenses",
    hint: "Charges d'exploitation",
    icon: Wallet,
    group: "Tiers",
  },
  {
    id: "proformas",
    label: "Proformas",
    hint: "Devis et conversions",
    icon: FileText,
    group: "Tiers",
  },
  {
    id: "templates",
    label: "Impression",
    hint: "Documents, imprimante et personnalisation",
    icon: Printer,
    group: "Système",
  },
  {
    id: "settings",
    label: "Paramètres",
    hint: "Entreprise et préférences",
    icon: Settings,
    group: "Système",
  },
  {
    id: "license",
    label: "Licence",
    hint: "Activation hors-ligne",
    icon: KeyRound,
    group: "Système",
  },
];

type ToastKind = "ok" | "err";

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

let toastSeq = 0;

/**
 * Raccourcis RÉELS par module (Stitch) : chaque entrée affichée dans le pied
 * de page et l'aide [?] correspond à un gestionnaire existant et vérifié.
 * Règle : jamais d'étiquette sans handler (audit ADR-037).
 */
interface FooterHint {
  k: string;
  label: string;
}

const FALLBACK_HINTS: FooterHint[] = [
  { k: "F2", label: "Format Impr." },
  { k: "Échap", label: "Fermer" },
  { k: "Entrée", label: "Valider" },
];

/** Raccourcis du module, repli générique si aucun spécifique (jamais vide). */
function hintsFor(id: ModuleId): FooterHint[] {
  const hints = FOOTER_HINTS[id];
  return hints.length > 0 ? hints : FALLBACK_HINTS;
}

const FOOTER_HINTS: Record<ModuleId, FooterHint[]> = {
  sell: [
    { k: "F1", label: "Article libre" },
    { k: "F3", label: "Recherche" },
    { k: "F4", label: "Proforma" },
    { k: "F5", label: "Client" },
    { k: "F6", label: "Panier" },
    { k: "F8", label: "Fermer onglet" },
    { k: "F9", label: "Vider" },
    { k: "F10", label: "Encaisser" },
  ],
  dashboard: [
    { k: "F4", label: "Filtrer Date" },
    { k: "F5", label: "Actualiser" },
    { k: "F8", label: "Exporter" },
  ],
  products: [{ k: "F3", label: "Recherche" }],
  customers: [{ k: "F3", label: "Recherche" }],
  suppliers: [{ k: "F3", label: "Recherche" }],
  stock: [{ k: "F3", label: "Recherche" }],
  history: [
    { k: "F3", label: "Recherche" },
    { k: "F6", label: "Réimprimer" },
  ],
  returns: [
    { k: "F2", label: "Nouveau Retour" },
    { k: "F3", label: "Recherche" },
    { k: "F8", label: "Exporter" },
  ],
  expenses: [
    { k: "F3", label: "Recherche" },
    { k: "F8", label: "Exporter" },
  ],
  debts: [{ k: "F3", label: "Recherche" }],
  reports: [
    { k: "F4", label: "Filtrer Date" },
    { k: "F8", label: "Exporter" },
  ],
  bread: [{ k: "F3", label: "Recherche" }],
  proformas: [{ k: "F3", label: "Recherche" }],
  templates: [],
  zakat: [],
  settings: [],
  license: [],
};

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
  const [helpOpen, setHelpOpen] = useState(false);
  const [printMode, setPrintModeState] = useState<PrintMode>(initialPrintMode);
  const [collapsed, setCollapsed] = useState<boolean>(initialSidebarCollapsed);
  // Version SQLite réelle (santé main) — jamais codée en dur (ADR-038).
  const [sqliteVersion, setSqliteVersion] = useState<string | null>(null);
  useEffect(() => {
    api
      .dbHealth()
      .then((h) => {
        const v = (h as { sqliteVersion?: unknown }).sqliteVersion;
        if (typeof v === "string") setSqliteVersion(v);
      })
      .catch(() => {
        /* badge en repli sans version */
      });
  }, []);
  // Miroir synchrone du module actif pour le gestionnaire F2 global.
  const activeRef = useRef<ModuleId>("sell");
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Vigilance sidebar : compteurs réels (null = inconnu, aucun badge).
  // Ruptures stock, règlements dépassés, commandes pain en cours.
  const [vigilance, setVigilance] = useState<{
    stockOut: number | null;
    debtsOverdue: number | null;
    breadPending: number | null;
  }>({ stockOut: null, debtsOverdue: null, breadPending: null });

  function vigilanceCount(id: ModuleId): number | null {
    if (id === "stock") return vigilance.stockOut;
    if (id === "debts") return vigilance.debtsOverdue;
    if (id === "bread") return vigilance.breadPending;
    return null;
  }

  useEffect(() => {
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
    const fetchVigilance = (): void => {
      api
        .stockOverview()
        .then((s) => {
          setVigilance((v) => ({
            ...v,
            stockOut: num((s as { outOfStock?: unknown }).outOfStock),
          }));
        })
        .catch(() => undefined);
      api
        .debtsStats()
        .then((s) => {
          setVigilance((v) => ({
            ...v,
            debtsOverdue: num((s as { settleOverdue?: unknown }).settleOverdue),
          }));
        })
        .catch(() => undefined);
      api
        .breadStats()
        .then((s) => {
          const b = s as { pending?: unknown; ready?: unknown };
          const p = num(b.pending) ?? 0;
          const r = num(b.ready) ?? 0;
          setVigilance((v) => ({ ...v, breadPending: p + r }));
        })
        .catch(() => undefined);
    };
    fetchVigilance();
    const timer = window.setInterval(fetchVigilance, 120000);
    return () => window.clearInterval(timer);
  }, []);

  // Recherche modules + F1 global → Caisse (la F1 caisse ouvre l'article libre).
  const [navQuery, setNavQuery] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "F1") {
        if (isAnyModalOpen()) return;
        e.preventDefault();
        setActive("sell");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  // ADR-038 : l'écran Retours possède son propre F2 (Nouveau Retour) — le
  // basculeur global s'efface pour ne jamais déclencher deux actions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "F2") {
        if (isAnyModalOpen()) return;
        if (activeRef.current === "returns") return;
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

  // (Centre de notifications : voir après `licenseStatus` ci-dessous.)

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

  // ATTENTION (règles des Hooks) : aucun return anticipé avant TOUS les hooks
  // (useLicense/useState/useCallback ci-dessous). `bridgeOk` false = pont en
  // cours de chargement (poller 500 ms) : l'écran d'attente est rendu APRÈS
  // les hooks, sinon le basculement false→true changerait le nombre de hooks
  // entre deux renders (crash React + white-screen, pas de ErrorBoundary).

  const current = MODULES.find((m) => m.id === active);
  const { status: licenseStatus, hasPageAccess } = useLicense();
  // Centre de notifications (données réelles : licence, sauvegarde, miroir).
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifItems, setNotifItems] = useState<{ tone: "err" | "warn"; text: string }[]>([]);
  const openNotifications = useCallback(async (): Promise<void> => {
    setNotifOpen(true);
    setNotifLoading(true);
    const items: { tone: "err" | "warn"; text: string }[] = [];
    const st = licenseStatus;
    if (st?.state === "EXPIRED") {
      items.push({
        tone: "err",
        text: "Licence expirée : écritures bloquées, consultation seule.",
      });
    } else if (st?.state === "EXPIRING_SOON") {
      items.push({
        tone: "warn",
        text: `Licence : expire dans ${st.daysLeft ?? "?"} jour(s). Renouvelez via le vendor.`,
      });
    }
    try {
      const b = (await api.backupStatus()) as {
        lastAt: string | null;
        auto?: { enabled: boolean; frequency?: string; customMinutes?: number } | null;
      };
      if (b.auto?.enabled) {
        const mins = backupFrequencyMinutes(
          (b.auto.frequency ?? "daily") as "daily",
          Number(b.auto.customMinutes ?? 60),
        );
        const lastMs = b.lastAt ? Date.parse(b.lastAt) : Number.NaN;
        if (!Number.isFinite(lastMs) || Date.now() - lastMs >= mins * 60_000) {
          items.push({ tone: "warn", text: "Sauvegarde automatique en retard : lancez-en une." });
        }
      }
    } catch {
      /* statut sauvegarde illisible */
    }
    try {
      const s = (await api.syncGetConfig()) as {
        lastError: string | null;
        pendingCount: number;
      };
      if (s.lastError) items.push({ tone: "err", text: `Miroir APK : ${s.lastError}` });
      else if (Number(s.pendingCount) > 0) {
        items.push({
          tone: "warn",
          text: `${s.pendingCount} cliché(s) en attente vers le miroir.`,
        });
      }
    } catch {
      /* miroir illisible */
    }
    setNotifItems(items);
    setNotifLoading(false);
  }, [licenseStatus]);

  // Pont absent (navigateur sans Electron, ou preload encore en cours) :
  // écran explicite — rendu seulement après tous les hooks (voir note ci-dessus).
  if (!bridgeOk) {
    return (
      <div className="flex h-full items-center justify-center bg-[#051424] p-6 text-slate-100">
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

  const notifCount = notifItems.length;
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
        <div className="min-h-0 flex-1 overflow-auto bg-[#051424] p-6 text-slate-100">
          <LicenseScreen notify={notify} />
        </div>
      </WindowChrome>
    );
  }

  return (
    <WindowChrome pageName={current?.label ?? "Veloria PoS"}>
      <div className="flex min-h-0 flex-1 bg-[#051424] text-[#d4e4fa]">
        {/* Barre latérale Stitch 240px : Veloria PoS / Caisse·DZD + nav data-path + kbd */}
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
                <div className="truncate text-[15px] font-bold leading-none tracking-tight text-[#ffe1a7]">
                  Veloria PoS
                </div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-[#d3c5ac]">
                  Caisse · DZD
                </div>
              </div>
            )}
          </div>
          {collapsed ? null : (
            <div className="px-2 pb-1">
              <input
                type="search"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Filtrer les modules…"
                aria-label="Filtrer les modules"
                className="w-full rounded-lg border border-white/10 bg-[#010f1f] px-3 py-1.5 text-[12px] text-[#d4e4fa] placeholder:text-[#d3c5ac]/50 hover:border-white/25 focus:border-[#fbbf24]"
              />
            </div>
          )}
          <nav
            className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
            aria-label="Navigation principale"
          >
            {MODULE_GROUPS.map((group) => {
              const items = visibleModules.filter(
                (m) =>
                  m.group === group &&
                  (navQuery.trim() === "" ||
                    `${m.label} ${m.hint}`.toLowerCase().includes(navQuery.trim().toLowerCase())),
              );
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  {collapsed ? null : (
                    <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                      {group}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {items.map((m) => {
                      const selected = m.id === active;
                      const Icon = m.icon;
                      const count = vigilanceCount(m.id);
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            aria-current={selected ? "page" : undefined}
                            title={`${m.label} — ${m.hint}`}
                            data-path={m.id}
                            onClick={() => setActive(m.id)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-[13px] transition-all duration-100 focus-visible:outline-none",
                              collapsed && "justify-center px-2",
                              selected
                                ? "bg-[#fbbf24] font-bold text-[#402d00] shadow-[inset_3px_0_0_0_#fbbf24]"
                                : "font-medium text-[#d3c5ac] hover:bg-[#122131] hover:text-[#d4e4fa]",
                            )}
                          >
                            <Icon
                              size={18}
                              strokeWidth={selected ? 2.25 : 2}
                              aria-hidden="true"
                              className={cn(
                                "shrink-0",
                                selected ? "text-[#402d00]" : "text-[#d3c5ac]",
                              )}
                            />
                            {collapsed ? null : (
                              <span className="min-w-0 flex-1 truncate leading-snug">
                                {m.label}
                              </span>
                            )}
                            {count != null && count > 0 ? (
                              <span
                                title={`${count} point(s) de vigilance`}
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold",
                                  selected
                                    ? "bg-[#402d00]/15 text-[#402d00]"
                                    : "bg-red-500/20 text-red-200",
                                )}
                              >
                                {count > 99 ? "99+" : count}
                              </span>
                            ) : null}
                            {collapsed || !m.kbd ? null : (
                              <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#d3c5ac]">
                                {m.kbd}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
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
          {/* Barre opérationnelle fine Stitch : licence · SQLite WAL · caisse · caissier */}
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0d1c2d] px-6 py-1.5 text-[11px]">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <LicenseBadge status={licenseStatus} />
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-200"
                title={
                  sqliteVersion
                    ? `Moteur SQLite ${sqliteVersion} — base locale saine`
                    : "Base locale"
                }
              >
                <span className="veloria-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                SQLITE {sqliteVersion ?? "…"} · WAL
              </span>
              <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4edea3]">
                Session active
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold text-[#d3c5ac]">
              <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5">Caisse</span>
              <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5">Poste vendeur</span>
              <button
                type="button"
                title="Aide — raccourcis du module [?]"
                aria-label="Aide — raccourcis du module"
                onClick={() => setHelpOpen(true)}
                className="rounded p-1 text-[#d3c5ac] transition-colors hover:bg-[#1c2b3c] hover:text-[#d4e4fa]"
              >
                <CircleHelp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Notifications"
                aria-label="Notifications"
                onClick={() => void openNotifications()}
                className="rounded p-1 text-[#d3c5ac] transition-colors hover:bg-[#1c2b3c] hover:text-[#d4e4fa]"
              >
                <Bell size={14} aria-hidden="true" />
                {notifCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#fbbf24]"
                  />
                ) : null}
              </button>
              <span title="Caissier" className="rounded bg-[#1c2b3c] p-1 text-[#d3c5ac]">
                <User size={14} aria-hidden="true" />
              </span>
            </div>
          </div>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#051424] px-6 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-bold tracking-tight text-[#d4e4fa]">
                  {current?.label}
                </h1>
                <p className="mt-0.5 text-xs text-[#d3c5ac]">{current?.hint}</p>
              </div>
            </div>
            <div
              className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0d1c2d] p-0.5"
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
                      ? "bg-[#fbbf24] text-[#402d00]"
                      : "text-[#d3c5ac] hover:text-[#d4e4fa]",
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
                <ErrorBoundary moduleLabel={current?.label ?? "Module"} resetKey={active}>
                  {active === "dashboard" ? <DashboardScreen notify={notify} /> : null}
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
                  {active === "templates" ? <PrintTemplatesScreen notify={notify} /> : null}
                  {active === "zakat" ? <ZakatScreen notify={notify} /> : null}
                  {active === "settings" ? <SettingsScreen notify={notify} /> : null}
                  {active === "license" ? <LicenseScreen notify={notify} /> : null}
                </ErrorBoundary>
              </Suspense>
            )}
          </main>
          {/* Pied de page Stitch : raccourcis RÉELS du module actif (ADR-037). */}
          <footer
            className="flex items-center gap-1 overflow-x-auto border-t border-white/[0.06] bg-[#0d1c2d] px-4 py-1.5 font-mono text-[10px] font-semibold text-[#d3c5ac]"
            aria-label="Raccourcis clavier du module"
          >
            {hintsFor(active).map((h) => (
              <span key={h.k} className="rounded bg-[#1c2b3c] px-1.5 py-0.5">
                {h.k} {h.label}
              </span>
            ))}
          </footer>
        </div>

        {/* Aide Stitch [?] : raccourcis réels du module actif + généraux. */}
        {helpOpen ? (
          <Modal
            label="Aide — raccourcis clavier"
            title={`Aide — ${current?.label ?? "Veloria PoS"}`}
            onClose={() => setHelpOpen(false)}
          >
            <ul className="space-y-1.5 text-sm">
              {hintsFor(active).map((h) => (
                <li key={h.k} className="flex items-center gap-2 text-slate-200">
                  <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#ffe1a7]">
                    {h.k}
                  </span>
                  {h.label}
                </li>
              ))}
              <li className="flex items-center gap-2 text-slate-200">
                <span className="rounded bg-[#1c2b3c] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#ffe1a7]">
                  F2
                </span>
                Format d&apos;impression (Ticket 80mm ↔ Facture A4)
              </li>
            </ul>
            <Button onClick={() => setHelpOpen(false)}>Fermer</Button>
          </Modal>
        ) : null}

        {/* Centre de notifications : signaux réels, jamais de stub. */}
        {notifOpen ? (
          <Modal label="Notifications" title="Notifications" onClose={() => setNotifOpen(false)}>
            {notifLoading ? (
              <p className="text-sm text-slate-400" role="status">
                Chargement…
              </p>
            ) : notifItems.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune notification.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {notifItems.map((n) => (
                  <li
                    key={`${n.tone}:${n.text}`}
                    role="alert"
                    className={
                      n.tone === "err"
                        ? "rounded-lg border border-red-500/30 bg-[#1c1113] px-3 py-2 text-red-100"
                        : "rounded-lg border border-amber-400/30 bg-[#171207] px-3 py-2 text-amber-100"
                    }
                  >
                    {n.text}
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => setNotifOpen(false)}>Fermer</Button>
          </Modal>
        ) : null}

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
