// Veloria PoS — Feature Équipe : code de secours affiché UNE fois.
// Mémoire uniquement (jamais persisté côté renderer) : à noter et imprimer.

import { Card } from "@shared/ui/primitives.tsx";

export function RecoveryCodeOnce({
  code,
  onAcknowledged,
}: {
  code: string;
  onAcknowledged: () => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#051424] p-6">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold text-white">Code de secours</h1>
        <p className="mt-1 text-sm text-slate-400">
          Notez ce code à 8 chiffres et conservez-le hors du poste : il permet de rétablir
          l&apos;accès gérant en cas d&apos;oubli. Il ne sera plus jamais affiché.
        </p>
        <p
          className="mt-4 rounded-xl bg-white/[0.06] px-3 py-4 text-center text-3xl font-bold tracking-[0.4em] text-amber-200"
          role="status"
        >
          {code}
        </p>
        <button
          type="button"
          onClick={onAcknowledged}
          className="mt-4 min-h-[44px] w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-bold text-black"
        >
          Je l&apos;ai noté
        </button>
      </Card>
    </div>
  );
}
