// Veloria Client — Session + cache local (SecureStore/expo-sqlite sur device).
// Ici : formes et logique pure ; le branchement natif vit dans App.tsx.
import type { Lang } from "./i18n.ts";

export interface Session {
  phone: string;
  pin: string;
  lang: Lang;
  amountsHidden: boolean;
  lastLoginAt: string | null;
  /** Endpoint du magasin scanné (QR V2, ADR-068) ; null = V1 (endpoint gravé). */
  supabaseUrl: string | null;
  anonKey: string | null;
}

export interface MirrorCache {
  snapshot: unknown;
  invoices: unknown;
  payments: unknown;
  syncedAt: string | null;
}

export const EMPTY_CACHE: MirrorCache = {
  snapshot: null,
  invoices: null,
  payments: null,
  syncedAt: null,
};

/** Libellé « données du … » quand le miroir est injoignable (jamais d'écran vide). */
export function staleLabel(syncedAt: string | null): string | null {
  if (syncedAt == null) return null;
  return syncedAt.slice(0, 10);
}
