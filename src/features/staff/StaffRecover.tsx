// Veloria PoS — Feature Équipe : récupération sans session (code de secours
// 8 chiffres, 0042). Français uniquement, erreurs FR + log technique.

import { useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
// A-03 (P1) : source UNIQUE de l'`operationId` (domaine) — la copie locale
// avait un repli UUID CONSTANT (toutes les récupérations ⇒ même clé ⇒
// rejeux silencieux par `idempotency_keys`).
import { newOperationId } from "@domain/common/ids.ts";
import { Card } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";

export function StaffRecover({
  notify,
  onDone,
}: {
  notify: Notify;
  onDone: () => void;
}): React.JSX.Element {
  const [username, setUsername] = useState("admin");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (code1 !== code2) {
      notify("Les deux codes ne correspondent pas.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.staffRecover({
        username,
        recoveryCode,
        newCode: code1,
        operationId: newOperationId(),
      });
      notify("Accès rétabli : connectez-vous avec le nouveau code.", "ok");
      onDone();
    } catch (err: unknown) {
      notify(frError(err, "Récupération impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-6">
      <h1 className="text-xl font-bold text-white">Code oublié</h1>
      <p className="mt-1 text-sm text-slate-400">
        Saisissez le code de secours à 8 chiffres (remis au gérant à la première ouverture).
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
        <label className="block text-sm text-slate-300">
          Utilisateur
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-label="Nom d'utilisateur"
            className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-base text-white"
          />
        </label>
        <label className="block text-sm text-slate-300">
          Code de secours (8 chiffres)
          <input
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
            inputMode="numeric"
            type="password"
            autoComplete="off"
            autoFocus
            placeholder="••••••••"
            className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-2xl tracking-[0.4em] text-white"
            aria-label="Code de secours (8 chiffres)"
          />
        </label>
        <label className="block text-sm text-slate-300">
          Nouveau code (6 chiffres)
          <input
            value={code1}
            onChange={(e) => setCode1(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            placeholder="••••••"
            className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-2xl tracking-[0.5em] text-white"
            aria-label="Nouveau code (6 chiffres)"
          />
        </label>
        <label className="block text-sm text-slate-300">
          Confirmer le nouveau code
          <input
            value={code2}
            onChange={(e) => setCode2(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            placeholder="••••••"
            className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-2xl tracking-[0.5em] text-white"
            aria-label="Confirmer le nouveau code"
          />
        </label>
        <button
          type="submit"
          disabled={busy || recoveryCode.length !== 8 || code1.length !== 6 || code2.length !== 6}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-bold text-black disabled:opacity-40"
        >
          {busy ? "Vérification…" : "Rétablir l'accès"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] w-full rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-200"
        >
          Retour
        </button>
      </form>
    </Card>
  );
}
