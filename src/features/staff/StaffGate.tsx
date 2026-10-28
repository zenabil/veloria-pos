// Veloria PoS — Feature Équipe : écran bloquant de choix d'utilisateur.
// Français uniquement, grandes zones tactiles, erreurs FR + log technique.

import { useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { Card } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { StaffUserView } from "./use-staff.ts";
import { StaffRecover } from "./StaffRecover.tsx";

interface Props {
  notify: Notify;
  onLoggedIn: (user: StaffUserView) => void;
}

export function StaffGate({ notify, onLoggedIn }: Props): React.JSX.Element {
  const [users, setUsers] = useState<StaffUserView[]>([]);
  const [selected, setSelected] = useState<string>("admin");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  // Secours + code initial générés par l'appel liste (bootstrap) : transmis au login.
  const [pendingRecovery, setPendingRecovery] = useState<string | null>(null);
  const [pendingInitial, setPendingInitial] = useState<string | null>(null);
  // Liste non chargée : la soumission attend (le bootstrap doit passer par
  // la liste ou le login, jamais les deux en course).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .staffList()
      .then((r) => {
        const res = r as {
          users?: StaffUserView[];
          recoveryCode?: string | null;
          initialCode?: string | null;
        };
        const list = (res.users ?? []).filter((u) => u.isActive);
        setUsers(list);
        if (typeof res.recoveryCode === "string" && res.recoveryCode.length > 0) {
          setPendingRecovery(res.recoveryCode);
        }
        // R6 : code initial aléatoire affiché UNE fois (jamais "admin").
        if (typeof res.initialCode === "string" && /^[0-9]{6}$/.test(res.initialCode)) {
          setPendingInitial(res.initialCode);
        }
        if (list.length > 0 && !list.some((u) => u.username === "admin")) {
          setSelected(list[0]?.username ?? "admin");
        }
      })
      .catch((e: unknown) => notify(frError(e, "Liste des utilisateurs indisponible."), "err"))
      .finally(() => setLoaded(true));
  }, [notify]);

  async function submit(e: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = (await api.staffLogin({ username: selected, code })) as { user: StaffUserView };
      onLoggedIn({
        ...r.user,
        recoveryCode: r.user.recoveryCode ?? pendingRecovery,
        initialCode: r.user.initialCode ?? pendingInitial,
      });
    } catch (err: unknown) {
      notify(frError(err, "Identifiants invalides."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#051424] p-6">
      {recovering ? (
        <StaffRecover notify={notify} onDone={() => setRecovering(false)} />
      ) : (
        <Card className="w-full max-w-md p-6">
          <h1 className="text-xl font-bold text-white">Choisir l&apos;utilisateur</h1>
          <p className="mt-1 text-sm text-slate-400">
            Sélectionnez votre compte puis saisissez votre code à 6 chiffres.
          </p>
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
            {pendingInitial ? (
              <p
                data-testid="initial-code-once"
                role="status"
                className="rounded-xl bg-amber-400/10 px-3 py-3 text-sm text-amber-200"
              >
                Premier démarrage — compte <span className="font-bold">admin</span>, code initial à
                usage unique : <span className="font-bold tracking-[0.3em]">{pendingInitial}</span>.
                Saisissez-le ci-dessous : il ne sera plus affiché et un changement de code est exigé
                aussitôt.
              </p>
            ) : null}
            {users.length === 0 ? (
              <p
                className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-slate-300"
                role="status"
              >
                Aucun compte actif — contactez le gérant.
              </p>
            ) : null}
            <label className="block text-sm text-slate-300">
              Utilisateur
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-base text-white"
                aria-label="Utilisateur"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.username} className="text-black">
                    {u.displayName} ({u.username}){u.role === "manager" ? " — Gérant" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Code à 6 chiffres
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 64))}
                type="password"
                autoFocus
                autoComplete="current-password"
                placeholder="••••••"
                className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-2xl tracking-[0.5em] text-white"
                aria-label="Code à 6 chiffres"
              />
            </label>
            <button
              type="submit"
              disabled={busy || !loaded || code.length < 1}
              className="w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-bold text-black disabled:opacity-40"
            >
              {busy ? "Vérification…" : "Ouvrir la session"}
            </button>
            <p className="text-center text-xs text-slate-500">
              Première ouverture : utilisez le code initial affiché ci-dessus, changement exigé
              aussitôt.
            </p>
            <button
              type="button"
              onClick={() => setRecovering(true)}
              className="min-h-[44px] w-full text-center text-xs font-bold text-slate-400 underline"
            >
              Code oublié ?
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
