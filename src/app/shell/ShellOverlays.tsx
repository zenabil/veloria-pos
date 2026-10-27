// Veloria PoS — Surcouches shell : aide [?], notifications, toasts non bloquants,
// écrans de garde (pont manquant, licence bloquante, route hors licence).
import { Button, Card, Modal, cn } from "@shared/ui/primitives.tsx";
import { WindowChrome } from "./WindowChrome.tsx";
import { LAZY_SCREENS } from "./module-screens.ts";
import type { Notify, Toast } from "./shell-types.ts";
import type { NotifItem } from "./use-notifications.ts";

export function NotificationsModal({
  loading,
  items,
  onClose,
}: {
  loading: boolean;
  items: NotifItem[];
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Modal label="Notifications" title="Notifications" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-slate-400" role="status">
          Chargement…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune notification.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((n) => (
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
      <Button onClick={onClose}>Fermer</Button>
    </Modal>
  );
}

export function Toasts({ toasts }: { toasts: Toast[] }): React.JSX.Element {
  return (
    <div
      className="pointer-events-none fixed bottom-12 right-4 z-50 flex w-[360px] flex-col-reverse gap-2"
      aria-live="assertive"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "err" ? "alert" : "status"}
          className={cn(
            "veloria-toast-in pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl",
            t.kind === "ok"
              ? "border-amber-400/30 bg-[#171207] text-amber-100"
              : "border-red-500/30 bg-[#1c1113] text-red-100",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Pont applicatif absent (navigateur sans Electron) : écran explicite. */
export function BridgeMissing({ onRetry }: { onRetry: () => void }): React.JSX.Element {
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
          Veloria PoS doit être ouvert depuis l&apos;application de bureau (Electron). Si vous voyez
          cette page dans un navigateur, fermez cet onglet et lancez{" "}
          <strong className="text-slate-200">Veloria PoS</strong> depuis le raccourci Windows.
        </p>
        <Button onClick={onRetry}>Réessayer</Button>
      </Card>
    </div>
  );
}

/** Licence bloquante (packagé sans activation valide) : activation plein écran, jamais les modules métier. */
export function LicenseBlockedScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const LicenseScreen = LAZY_SCREENS.license;
  return (
    <WindowChrome pageName="Licence">
      <div className="min-h-0 flex-1 overflow-auto bg-[#051424] p-6 text-slate-100">
        <LicenseScreen notify={notify} />
      </div>
    </WindowChrome>
  );
}

/** Garde de route (§10) : module non inclus dans la licence actuelle. */
export function RouteBlocked({
  moduleLabel,
  onGoLicense,
}: {
  moduleLabel: string | undefined;
  onGoLicense: () => void;
}): React.JSX.Element {
  return (
    <Card className="mx-auto mt-10 w-[520px] max-w-full space-y-3 p-8 text-center">
      <h2 className="text-lg font-extrabold tracking-tight">Fonction non disponible</h2>
      <p className="text-sm text-slate-400">
        Le module « {moduleLabel} » n&apos;est pas inclus dans votre licence actuelle. Contactez
        votre fournisseur pour l&apos;activer.
      </p>
      <Button onClick={onGoLicense}>Voir ma licence</Button>
    </Card>
  );
}
