// Veloria PoS — Feature Équipe : changement de code forcé + volontaire.
// Le compte initial ne peut rien faire avant ce changement (R6 : code
// initial aléatoire affiché une fois, plus jamais "admin/admin").

import { useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
// A-03 (P1) : source UNIQUE de l'`operationId` (domaine) — la copie locale
// avait un repli UUID CONSTANT (toutes les opérations ⇒ même clé ⇒ rejets
// silencieux par `idempotency_keys`).
import { newOperationId } from "@domain/common/ids.ts";
import { Card } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";

export function ChangeCodeCard({
  notify,
  forced,
  onChanged,
}: {
  notify: Notify;
  forced: boolean;
  onChanged: () => void;
}): React.JSX.Element {
  // R6 : jamais de pré-remplissage (le code initial est aléatoire ; les
  // postes déjà installés gardent leur ancien code jusqu'au changement).
  const [oldCode, setOldCode] = useState("");
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (code1 !== code2) {
      notify("Les deux codes ne correspondent pas.", "err");
      return;
    }
    setBusy(true);
    try {
      await api.staffChangeCode({ oldCode, newCode: code1, operationId: newOperationId() });
      notify("Code modifié.", "ok");
      setOldCode("");
      setCode1("");
      setCode2("");
      onChanged();
    } catch (err: unknown) {
      notify(frError(err, "Changement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  const pin = (v: string, set: (s: string) => void, label: string): React.JSX.Element => (
    <label className="block text-sm text-slate-300">
      {label}
      <input
        value={v}
        onChange={(e) => set(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
        inputMode="numeric"
        type="password"
        autoComplete="new-password"
        placeholder="••••••"
        className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-2xl tracking-[0.5em] text-white"
        aria-label={label}
      />
    </label>
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white">
        {forced ? "Changement de code exigé" : "Changer mon code"}
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        {forced
          ? "Le compte admin initial doit adopter un code personnel à 6 chiffres avant toute vente."
          : "Saisissez l'ancien code puis le nouveau à deux reprises."}
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
        <label className="block text-sm text-slate-300">
          {forced ? "Code initial reçu" : "Ancien code"}
          <input
            value={oldCode}
            onChange={(e) => setOldCode(e.target.value.slice(0, 64))}
            type="password"
            autoComplete="current-password"
            placeholder={forced ? "Code affiché au premier démarrage" : "Ancien code"}
            className="mt-1 w-full rounded-xl bg-white/[0.06] px-3 py-3 text-center text-xl text-white"
            aria-label={forced ? "Code initial reçu" : "Ancien code"}
          />
        </label>
        {pin(code1, setCode1, "Nouveau code (6 chiffres)")}
        {pin(code2, setCode2, "Confirmer le nouveau code")}
        <button
          type="submit"
          disabled={busy || code1.length !== 6 || code2.length !== 6}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 text-base font-bold text-black disabled:opacity-40"
        >
          {busy ? "Enregistrement…" : "Enregistrer le code"}
        </button>
      </form>
    </Card>
  );
}
