// Veloria PoS — Feature Équipe : session interne via le bridge uniquement.
// Le renderer n'accorde jamais de permission : l'affichage filtre, le main décide.

import { useCallback, useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import type { Notify } from "@shared/ui/primitives.tsx";

export interface StaffUserView {
  id: number;
  uuid: string;
  username: string;
  displayName: string;
  role: string;
  mustChangeCode: boolean;
  isActive: boolean;
  permissions: string[];
  /** Code de secours affiché UNE fois (bootstrap venant d'être créé). */
  recoveryCode?: string | null;
  /** Code initial affiché UNE fois (bootstrap venant d'être créé, R6). */
  initialCode?: string | null;
}

export function useStaff(notify?: Notify): {
  session: StaffUserView | null;
  loading: boolean;
  refresh: () => void;
  login: (username: string, code: string) => Promise<StaffUserView>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  isManager: boolean;
} {
  const [session, setSession] = useState<StaffUserView | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    setLoading(true);
    api
      .staffSession()
      .then((s) => {
        const u = (s as { user?: StaffUserView | null }).user ?? null;
        setSession(u);
      })
      .catch((e: unknown) => {
        notify?.(frError(e, "Session indisponible."), "err");
      })
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const login = useCallback(async (username: string, code: string): Promise<StaffUserView> => {
    try {
      const r = (await api.staffLogin({ username, code })) as { user: StaffUserView };
      setSession(r.user);
      return r.user;
    } catch (e: unknown) {
      throw new Error(frError(e, "Identifiants invalides."), { cause: e });
    }
  }, []);
  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.staffLogout();
    } catch (e: unknown) {
      notify?.(frError(e, "Déconnexion impossible."), "err");
    }
    setSession(null);
  }, [notify]);
  const hasPermission = useCallback(
    (key: string): boolean => {
      if (!session) return false;
      if (session.role === "manager") return true;
      return session.permissions.includes(key);
    },
    [session],
  );
  return {
    session,
    loading,
    refresh,
    login,
    logout,
    hasPermission,
    isManager: session?.role === "manager",
  };
}
