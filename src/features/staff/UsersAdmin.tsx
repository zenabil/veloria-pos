// Veloria PoS — Feature Équipe : administration par le gérant.
// Création + permissions + activation. Français uniquement, bridge typé.

import { useCallback, useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { Card } from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import type { StaffUserView } from "./use-staff.ts";

const PERMISSION_LABELS: { key: string; label: string }[] = [
  { key: "sales", label: "Ventes" },
  { key: "stock", label: "Stock" },
  { key: "debts", label: "Dettes" },
  { key: "expenses", label: "Dépenses" },
  { key: "returns", label: "Retours" },
  { key: "closings", label: "Clôture" },
  { key: "settings", label: "Paramètres" },
  { key: "users", label: "Utilisateurs" },
  { key: "discount", label: "Remise" },
  { key: "cancel", label: "Annulation" },
];

function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "00000000-0000-4000-8000-000000000000";
}

export function UsersAdmin({
  notify,
  isManager,
  canManageUsers,
}: {
  notify: Notify;
  isManager: boolean;
  /** R2 : un utilisateur avec la permission `users` gère l'équipe (sans les
   *  leviers réservés au gérant : création de gérant, délégation `users`,
   *  code de secours — refusés côté main avec message FR). */
  canManageUsers: boolean;
}): React.JSX.Element {
  const [users, setUsers] = useState<StaffUserView[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("user");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  // Secours réémis : mémoire uniquement, affiché une fois.
  const [freshRecovery, setFreshRecovery] = useState<string | null>(null);

  const reload = useCallback((): void => {
    api
      .staffList()
      .then((r) => setUsers((r as { users?: StaffUserView[] }).users ?? []))
      .catch((e: unknown) => notify(frError(e, "Liste des utilisateurs indisponible."), "err"));
  }, [notify]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!canManageUsers) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-bold text-white">Équipe</h2>
        <p className="mt-1 text-sm text-slate-400">Gestion réservée au gérant.</p>
      </Card>
    );
  }

  async function create(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      // R2 : hors gérant, création d'utilisateurs uniquement (le main refuse
      // la création d'un gérant avec message FR).
      await api.staffCreate({
        username,
        displayName,
        role: isManager ? role : "user",
        code,
        operationId: newOperationId(),
      });
      notify("Utilisateur créé.", "ok");
      setUsername("");
      setDisplayName("");
      setCode("");
      reload();
    } catch (err: unknown) {
      notify(frError(err, "Création impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function togglePermission(user: StaffUserView, key: string): Promise<void> {
    const next = user.permissions.includes(key)
      ? user.permissions.filter((k) => k !== key)
      : [...user.permissions, key];
    try {
      await api.staffSetPermissions({
        userId: user.id,
        permissionKeys: next,
        operationId: newOperationId(),
      });
      reload();
    } catch (err: unknown) {
      notify(frError(err, "Permissions non enregistrées."), "err");
    }
  }

  async function toggleActive(user: StaffUserView): Promise<void> {
    try {
      await api.staffSetActive({
        userId: user.id,
        isActive: !user.isActive,
        operationId: newOperationId(),
      });
      notify(user.isActive ? "Compte désactivé." : "Compte réactivé.", "ok");
      reload();
    } catch (err: unknown) {
      notify(frError(err, "Statut non modifié."), "err");
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-white">Équipe — gérant et utilisateurs</h2>
      <p className="mt-1 text-sm text-slate-400">
        Créez les comptes (code à 6 chiffres), puis cochez les permissions de chacun.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isManager ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              api
                .staffRegenRecovery({ operationId: newOperationId() })
                .then((r) => {
                  const c = (r as { recoveryCode?: unknown }).recoveryCode;
                  if (typeof c === "string") setFreshRecovery(c);
                })
                .catch((e: unknown) => notify(frError(e, "Secours non généré."), "err"))
                .finally(() => setBusy(false));
            }}
            className="min-h-[44px] rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-200 disabled:opacity-40"
          >
            Régénérer le code de secours
          </button>
        ) : null}
      </div>
      {freshRecovery ? (
        <div className="mt-3 rounded-xl bg-amber-400/10 p-3" role="status">
          <p className="text-sm text-amber-200">
            Nouveau code de secours (à noter, affiché une seule fois) :
          </p>
          <p className="mt-1 text-center text-2xl font-bold tracking-[0.4em] text-amber-200">
            {freshRecovery}
          </p>
          <button
            type="button"
            onClick={() => setFreshRecovery(null)}
            className="mt-2 min-h-[44px] w-full rounded-xl bg-white/[0.08] px-4 py-2 text-sm font-bold text-slate-200"
          >
            Je l&apos;ai noté
          </button>
        </div>
      ) : null}
      <form onSubmit={(e) => void create(e)} className="mt-4 grid gap-3 md:grid-cols-5">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Nom d'utilisateur"
          aria-label="Nom d'utilisateur"
          className="rounded-xl bg-white/[0.06] px-3 py-2 text-white"
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nom affiché"
          aria-label="Nom affiché"
          className="rounded-xl bg-white/[0.06] px-3 py-2 text-white"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Rôle"
          className="rounded-xl bg-white/[0.06] px-3 py-2 text-white"
        >
          <option value="user" className="text-black">
            Utilisateur
          </option>
          {isManager ? (
            <option value="manager" className="text-black">
              Gérant
            </option>
          ) : null}
        </select>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
          placeholder="Code 6 chiffres"
          aria-label="Code 6 chiffres"
          inputMode="numeric"
          className="rounded-xl bg-white/[0.06] px-3 py-2 text-center tracking-[0.3em] text-white"
        />
        <button
          type="submit"
          disabled={busy || username.trim().length < 3 || code.length !== 6}
          className="rounded-xl bg-amber-400 px-4 py-2 font-bold text-black disabled:opacity-40"
        >
          Créer
        </button>
      </form>
      <ul className="mt-4 space-y-3">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">
                {u.displayName} ({u.username}) — {u.role === "manager" ? "Gérant" : "Utilisateur"}
                {!u.isActive ? " · désactivé" : ""}
                {u.mustChangeCode ? " · code à changer" : ""}
              </p>
              <button
                type="button"
                onClick={() => void toggleActive(u)}
                className="min-h-[44px] rounded-lg bg-white/[0.08] px-3 py-1 text-xs font-bold text-slate-200"
              >
                {u.isActive ? "Désactiver" : "Réactiver"}
              </button>
            </div>
            {u.role === "user" ? (
              <div
                className="mt-2 flex flex-wrap gap-2"
                role="group"
                aria-label={`Permissions de ${u.username}`}
              >
                {PERMISSION_LABELS.filter((p) => isManager || p.key !== "users").map((p) => {
                  const on = u.permissions.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => void togglePermission(u, p.key)}
                      className={`min-h-[44px] rounded-lg px-3 py-1 text-xs font-bold ${on ? "bg-emerald-400/20 text-emerald-200" : "bg-white/[0.06] text-slate-400"}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Le gérant dispose de toutes les permissions.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
