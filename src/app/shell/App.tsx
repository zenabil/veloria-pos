// Veloria PoS — Coquille « Stitch » (barre latérale + 17 modules, notifications globales).
// Interface en français uniquement, mode clavier d'abord.
// PERF (requête 5) : caisse (module d'accueil) chargée d'emblée, les 16 autres
// modules en lazy (chunks séparés, voir module-screens.ts) — premier affichage
// et mémoire réduits ; la navigation reste instantanée après le 1er chargement.
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { SellScreen } from "@features/sales/SellScreen.tsx";
import { useLicense } from "@features/license/use-license.ts";
import { useStaff } from "@features/staff/use-staff.ts";
import { StaffGate } from "@features/staff/StaffGate.tsx";
import { ChangeCodeCard } from "@features/staff/ChangeCodeCard.tsx";
import { InitialCodeOnce } from "@features/staff/InitialCodeOnce.tsx";
import { RecoveryCodeOnce } from "@features/staff/RecoveryCodeOnce.tsx";
import { LICENSE_BLOCKING_STATES } from "@features/license/types.ts";
import { ErrorBoundary } from "@shared/ui/error-boundary.tsx";
import { isAnyModalOpen } from "@shared/ui/use-busy.ts";
import { api } from "@shared/types/ipc-client.ts";
import { loadSoundEnabled, playSound, unlockSound } from "@shared/sound/sound.ts";
import { WindowChrome } from "./WindowChrome.tsx";
import { MODULES, MODULE_PAGES } from "./modules.ts";
import { LAZY_SCREENS } from "./module-screens.ts";
import { hintsFor } from "./footer-hints.ts";
import { SIDEBAR_KEY, initialSidebarCollapsed } from "./shell-types.ts";
import type { ModuleId, Toast, ToastKind } from "./shell-types.ts";
import { useVigilance } from "./use-vigilance.ts";
import { useNotifications } from "./use-notifications.ts";
import { useDensity, useTheme } from "@shared/ui/theme-density.ts";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";
import {
  BridgeMissing,
  LicenseBlockedScreen,
  NotificationsModal,
  RouteBlocked,
  Toasts,
} from "./ShellOverlays.tsx";

let toastSeq = 0;

export function App(): React.JSX.Element {
  const [active, setActive] = useState<ModuleId>("sell");
  const [toasts, setToasts] = useState<Toast[]>([]);
  // A-22 : minuteurs de toast (nettoyés au démontage).
  const toastTimers = useRef(new Map<number, number>());
  // Code de secours bootstrap : mémoire uniquement, affiché une fois.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  // R6 : code initial porté par le login quand c'est lui qui a créé le
  // compte (course liste/login au premier démarrage).
  const [initialCode, setInitialCode] = useState<string | null>(null);
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
  const { vigilanceCount } = useVigilance();
  // Thème/densité appliqués au document ; les boutons vivent en Paramètres
  // (rubrique Système → Affichage), plus dans le bandeau de caisse.
  useTheme();
  useDensity();
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
    // A-22 : le minuteur est conservé puis annulé au démontage (toast
    // still mounted ⇒ pas de setState sur un composant mort, pas de
    // minuteur fantôme qui déclenche après le remplacement du toast).
    const timer = window.setTimeout(() => {
      toastTimers.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
    toastTimers.current.set(id, timer);
  }, []);
  // A-22 : nettoyage des minuteurs de toast au démontage.
  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
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
  const { status: licenseStatus, hasPageAccess } = useLicense(notify);
  const {
    session: staffSession,
    loading: staffLoading,
    refresh: staffRefresh,
    logout: staffLogout,
    hasPermission: staffHasPermission,
  } = useStaff(notify);
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
  // Licence bloquante (build packagé sans activation valide) : écran
  // d'activation plein écran, jamais les modules métier — avant la porte
  // session (un poste non activé n'ouvre pas de session).
  if (licenseBlocked) {
    return <LicenseBlockedScreen notify={notify} />;
  }
  // Session interne (0041) : choix de l'utilisateur à chaque ouverture.
  // Rendu après tous les hooks (même règle que bridgeOk ci-dessus).
  if (staffLoading) {
    return (
      <WindowChrome pageName="Veloria PoS">
        <p className="py-10 text-center text-sm text-slate-500" role="status">
          Chargement de la session…
        </p>
      </WindowChrome>
    );
  }
  if (!staffSession) {
    return (
      <>
        <StaffGate
          notify={notify}
          onLoggedIn={(u) => {
            if (u.recoveryCode) setRecoveryCode(u.recoveryCode);
            if (u.initialCode) setInitialCode(u.initialCode);
            staffRefresh();
          }}
        />
        <Toasts toasts={toasts} />
      </>
    );
  }
  if (staffSession.mustChangeCode) {
    // R6 : le code initial porté par le login s'affiche UNE fois avant
    // l'écran de changement (cas normal : déjà vu sur la porte).
    if (initialCode) {
      return <InitialCodeOnce code={initialCode} onAcknowledged={() => setInitialCode(null)} />;
    }
    return (
      <WindowChrome pageName="Veloria PoS">
        <div className="mx-auto w-full max-w-md p-6">
          <ChangeCodeCard notify={notify} forced onChanged={() => staffRefresh()} />
        </div>
        <Toasts toasts={toasts} />
      </WindowChrome>
    );
  }
  // Secours venant d'être créé : affichage unique, jamais persisté.
  if (recoveryCode) {
    return <RecoveryCodeOnce code={recoveryCode} onAcknowledged={() => setRecoveryCode(null)} />;
  }
  // Garde de route (§10) : sidebar filtrée + accès direct bloqué.
  // Enveloppes legacy sans pages : le main expose tout autorisé.
  // Permissions équipe (0041, affichage uniquement — le main décide) :
  // le gérant voit tout, l'utilisateur voit les modules accordés.
  // Miroir de staff-gates.ts (ADR-087) : mêmes clés par module.
  // R2 : tableau de bord / historique / rapports TOUJOURS visibles (données
  // filtrées par auteur côté main, 0046) ; zakat / impression / paramètres /
  // licence exigent `settings` (le main garde les mutations).
  const STAFF_MODULE_PERMS: Partial<Record<ModuleId, string>> = {
    sell: "sales",
    stock: "stock",
    debts: "debts",
    expenses: "expenses",
    returns: "returns",
    settings: "settings",
    products: "stock",
    suppliers: "stock",
    customers: "debts",
    proformas: "sales",
    templates: "settings",
    zakat: "settings",
    license: "settings",
  };
  function staffModuleAllowed(id: ModuleId): boolean {
    if (!staffSession) return false;
    if (staffSession.role === "manager") return true;
    const key = STAFF_MODULE_PERMS[id];
    // dashboard / history / reports : pas de clé = visibles (filtrés par auteur).
    if (!key) return true;
    return staffHasPermission(key);
  }
  function moduleAllowed(id: ModuleId): boolean {
    if (!staffModuleAllowed(id)) return false;
    if (!licenseStatus) return true;
    if (licenseBlocked) return true;
    const required = MODULE_PAGES[id];
    // Licence : aucune page requise (toujours accessible si permission staff OK).
    if (required.length === 0) return true;
    return required.some((p) => hasPageAccess(p));
  }
  const visibleModules = MODULES.filter((m) => moduleAllowed(m.id));
  // Licence bloquante déjà court-circuitée plus haut (écran plein écran
  // retourné avant cette ligne) : inutile de re-tester `licenseBlocked`.
  const routeBlocked = licenseStatus != null && !moduleAllowed(active);
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
              notifCount={notifCount}
              licenseExpired={licenseExpired}
              staffName={staffSession.displayName}
              staffRole={staffSession.role}
              onOpenNotifications={() => void openNotifications()}
              onGoLicense={() => setActive("license")}
              onLogout={() => {
                setRecoveryCode(null);
                void staffLogout();
              }}
            />
          </div>
          <main
            className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.045),transparent_55%)] px-6 py-5"
            aria-live="polite"
          >
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
                    <SellScreen notify={notify} />
                  ) : ActiveScreen ? (
                    <ActiveScreen notify={notify} onNavigate={(m) => setActive(m)} />
                  ) : null}
                </ErrorBoundary>
              </Suspense>
            )}
          </main>
          {/* Pied de page Stitch : raccourcis RÉELS du module actif (ADR-037). */}
          <footer
            className="flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.06] bg-[#0a0f1c] px-4 py-1.5 font-mono text-[10px] font-medium text-slate-500"
            aria-label="Raccourcis clavier du module"
          >
            {hintsFor(active).map((h) => (
              <span key={h.k} className="whitespace-nowrap rounded bg-[#122131] px-1.5 py-0.5">
                <span className="font-semibold text-[#d3c5ac]">{h.k}</span> {h.label}
              </span>
            ))}
          </footer>
        </div>
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
