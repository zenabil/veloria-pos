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
  /** ADR-182 : catalogue du magasin (copie locale, lisible hors ligne). */
  catalog: unknown;
  /** ADR-182 : version du catalogue en cache (comparee à celle du miroir). */
  catalogVersion: string | null;
  /** ADR-182 : date de publication du catalogue en cache. */
  catalogPublishedAt: string | null;
  syncedAt: string | null;
}

export const EMPTY_CACHE: MirrorCache = {
  snapshot: null,
  invoices: null,
  payments: null,
  catalog: null,
  catalogVersion: null,
  catalogPublishedAt: null,
  syncedAt: null,
};
