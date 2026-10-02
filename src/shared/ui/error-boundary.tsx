// Veloria PoS — Garde-fou de rendu : une erreur React dans un module affiche
// un écran FR avec rechargement au lieu d'une page blanche. Jamais d'exception
// brute vers l'opérateur ; le détail technique part en console uniquement.
import { Component, type ReactNode } from "react";

interface Props {
  moduleLabel: string;
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error(`[ui] module "${this.props.moduleLabel}" :`, error);
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="w-[440px] space-y-3 rounded-xl border border-red-500/30 bg-[#1c1113] p-6 text-center">
            <h2 className="text-base font-extrabold text-red-100">
              Module momentanément indisponible
            </h2>
            <p className="text-sm text-slate-400">
              {this.props.moduleLabel} a rencontré un problème d&apos;affichage. Vos données sont
              intactes (SQLite locale).
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-black hover:bg-amber-300"
            >
              Recharger le module
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
