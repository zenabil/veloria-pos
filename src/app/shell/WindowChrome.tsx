// Veloria PoS — Chrome frameless (barre de titre personnalisée React).
// Style premium sobre (système Nova) : aplat, boutons pleine hauteur façon
// Windows moderne, fermeture rouge distinctive, états hover/pressed rapides.
// La fenêtre main est `frame: false` + transparente : cette coquille fournit
// le drag, le double-clic, les contrôles (réduire/agrandir/fermer) et les
// coins arrondis + ombre. Les contrôles sont exclus du drag (`wb-no-drag`).
// Aucune page POS n'est modifiée : seul le pourtour de la coquille change.
import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { cn } from "@shared/ui/primitives.tsx";

function bridgeAvailable(): boolean {
  return typeof window.veloria?.window !== "undefined";
}

async function toggleMaximize(): Promise<void> {
  try {
    await api.windowToggleMaximize();
  } catch {
    /* le main journalise ; l'état est repoussé par l'événement */
  }
}

function CaptionButton({
  label,
  onClick,
  close = false,
  rounded = false,
  children,
}: {
  label: string;
  onClick: () => void;
  close?: boolean;
  rounded?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-[52px] items-center justify-center text-[var(--caption-fg)] transition-colors duration-75",
        rounded && "rounded-tr-xl",
        close
          ? "hover:bg-[var(--caption-close-hover)] hover:text-white active:bg-[var(--caption-close-pressed)] active:text-white"
          : "hover:bg-[var(--caption-hover)] hover:text-white active:bg-[var(--caption-pressed)] active:text-white",
      )}
    >
      {children}
    </button>
  );
}

function TitleBar({
  maximized,
  supported,
  pageName,
}: {
  maximized: boolean;
  supported: boolean;
  pageName: string;
}): React.JSX.Element {
  return (
    <header
      aria-label="Barre de titre Veloria PoS"
      onDoubleClick={() => {
        if (supported) void toggleMaximize();
      }}
      style={{ height: "var(--titlebar-height)" }}
      className={cn(
        "flex shrink-0 select-none items-stretch border-b bg-[var(--titlebar-bg)] pl-3",
        "border-[var(--titlebar-border)]",
        supported && "wb-drag",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <img
          src="./icons/icon-192x192.png"
          alt=""
          aria-hidden="true"
          className="h-5 w-5 shrink-0 rounded-[6px] object-cover"
          draggable={false}
        />
        <span className="shrink-0 text-[13px] font-bold tracking-tight text-[var(--titlebar-app)]">
          Veloria PoS
        </span>
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-white/10" />
        <span className="min-w-0 truncate text-xs font-medium text-[var(--titlebar-page)]">
          {pageName}
        </span>
      </div>
      {supported ? (
        <div
          className="wb-no-drag flex shrink-0 items-stretch"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <CaptionButton
            label="Réduire"
            onClick={() => {
              api.windowMinimize().catch(() => undefined);
            }}
          >
            <Minus size={15} aria-hidden="true" />
          </CaptionButton>
          <CaptionButton
            label={maximized ? "Restaurer" : "Agrandir"}
            onClick={() => void toggleMaximize()}
          >
            {maximized ? (
              <Copy size={13} aria-hidden="true" />
            ) : (
              <Square size={13} aria-hidden="true" />
            )}
          </CaptionButton>
          <CaptionButton
            label="Fermer"
            close
            rounded={!maximized}
            onClick={() => {
              api.windowClose().catch(() => undefined);
            }}
          >
            <X size={16} aria-hidden="true" />
          </CaptionButton>
        </div>
      ) : null}
    </header>
  );
}

export function WindowChrome({
  children,
  pageName,
}: {
  children: React.ReactNode;
  pageName: string;
}): React.JSX.Element {
  const [supported] = useState<boolean>(bridgeAvailable);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!bridgeAvailable()) return;
    let detach: (() => void) | undefined;
    api
      .windowIsMaximized()
      .then((v) => setMaximized(v.maximized))
      .catch((err: unknown) => {
        console.error("[Veloria] fenêtre : état initial illisible", err);
      });
    try {
      detach = api.windowOnMaximizedChanged((v) => setMaximized(v.maximized));
    } catch (err: unknown) {
      console.error("[Veloria] fenêtre : abonnement état agrandi impossible", err);
      detach = undefined;
    }
    return () => detach?.();
  }, []);

  if (!supported) return <>{children}</>;

  return (
    <div
      className={cn(
        "flex flex-col bg-[#051424] text-slate-100",
        // Fenêtré : coins arrondis + ombre douce (marge = espace de l'ombre).
        // Agrandi : plein écran, sans rayon ni marge (convention Windows).
        maximized
          ? "h-full overflow-hidden"
          : "m-2 h-[calc(100%-16px)] overflow-hidden rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
      )}
    >
      <TitleBar maximized={maximized} supported={supported} pageName={pageName} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
