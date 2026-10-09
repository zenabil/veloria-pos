// Veloria PoS — Coquille « Stitch » (barre latérale + 17 modules, notifications globales).
// Interface en français uniquement, mode clavier d'abord.
// PERF (requête 5) : caisse (module d'accueil) chargée d'emblée, les 16 autres
// modules en lazy (chunks séparés, voir module-screens.ts) — premier affichage
// et mémoire réduits ; la navigation reste instantanée après le 1er chargement.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SellScreen } from "@features/sales/SellScreen.tsx";
import { useLicense } from "@features/license/use-license.ts";
import { LICENSE_BLOCKING_STATES } from "@features/license/types.ts";
import { ErrorBoundary } from "@shared/ui/error-boundary.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { api } from "@shared/types/ipc-client.ts";
import { loadSoundEnabled, playSound, unlockSound } from "@shared/sound/sound.ts";
import { WindowChrome } from "./WindowChrome.tsx";
import { MODULES, MODULE_PAGES } from "./modules.ts";
import { LAZY_SCREENS } from "./module-screens.ts";
import { hintsFor } from "./footer-hints.ts";
import {
  PRINT_MODE_KEY,
  SIDEBAR_KEY,
  initialPrintMode,
  initialSidebarCollapsed,
} from "./shell-types.ts";
import type { ModuleId, PrintMode, Toast, ToastKind } from "./shell-types.ts";
import { useVigilance } from "./use-vigilance.ts";
import { useNotifications } from "./use-notifications.ts";
import { useTheme } from "./use-theme.ts";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";
import {
  BridgeMissing,
  HelpModal,
  LicenseBlockedScreen,
  NotificationsModal,
  RouteBlocked,
  Toasts,
} from "./ShellOverlays.tsx";

// Compat : SellScreen importe PrintMode/ModuleId depuis App.tsx.
export type { ModuleId, PrintMode } from "./shell-types.ts";

let toastSeq = 0;

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
  const { vigilanceCount } = useVigilance();
  const { theme, toggleTheme } = useTheme();
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
  const { notifOpen, setNotifOpen, notifLoading, notifItems, notifCount, openNotifications } =
    useNotifications(licenseStatus);
  const ActiveScreen = active === "sell" ? null : LAZY_SCREENS[active];
  // Pont absent (navigateur sans Electron, ou preload encore en cours) :
  // écran explicite — rendu seulement après tous les hooks (voir note ci-dessus).
  if (!bridgeOk) {
    return <BridgeMissing onRetry={() => setBridgeOk(typeof window.veloria !== "undefined")} />;
  }
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
    return <LicenseBlockedScreen notify={notify} />;
  }
  return (
    <WindowChrome pageName={current?.label ?? "Veloria PoS"}>
      <div className="flex min-h-0 flex-1 bg-[#051424] text-[#d4e4fa]">
        <Sidebar
          active={active}
          collapsed={collapsed}
          navQuery={navQuery}
          visibleModules={visibleModules}
          vigilanceCount={vigilanceCount}
          onSelect={setActive}
          onQueryChange={setNavQuery}
          onToggle={toggleSidebar}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-white/[0.06] bg-[#0a0f1c]">
            <TopBar
              licenseStatus={licenseStatus}
              sqliteVersion={sqliteVersion}
              printMode={printMode}
              currentLabel={current?.label}
              currentHint={current?.hint}
              notifCount={notifCount}
              licenseExpired={licenseExpired}
              onHelp={() => setHelpOpen(true)}
              onOpenNotifications={() => void openNotifications()}
              onPrintMode={setPrintMode}
              onGoLicense={() => setActive("license")}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>
          <main className="min-h-0 flex-1 overflow-auto p-6" aria-live="polite">
            {routeBlocked ? (
              <RouteBlocked moduleLabel={current?.label} onGoLicense={() => setActive("license")} />
            ) : (
              <Suspense
                fallback={
                  <p className="py-10 text-center text-sm text-slate-500" role="status">
                    Chargement du module…
                  </p>
                }
              >
                <ErrorBoundary moduleLabel={current?.label ?? "Module"} resetKey={active}>
                  {active === "sell" ? (
                    <SellScreen notify={notify} printMode={printMode} />
                  ) : ActiveScreen ? (
                    <ActiveScreen notify={notify} />
                  ) : null}
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
          <HelpModal
            active={active}
            currentLabel={current?.label}
            onClose={() => setHelpOpen(false)}
          />
        ) : null}
        {/* Centre de notifications : signaux réels, jamais de stub. */}
        {notifOpen ? (
          <NotificationsModal
            loading={notifLoading}
            items={notifItems}
            onClose={() => setNotifOpen(false)}
          />
        ) : null}
        {/* Notifications globales non bloquantes */}
        <Toasts toasts={toasts} />
      </div>
    </WindowChrome>
  );
}
