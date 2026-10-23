// Veloria PoS — Shared: réglages applicatifs (clés explicites, SQLite).
// Valeurs par défaut locales si le bridge est indisponible ; jamais de
// données métier ici (préférences et règles d'interface uniquement).

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";

export interface SalesSettings {
  defaultPaymentMethod: "cash" | "cheque" | "transfer";
  allowCreditSales: boolean;
  autoPrintInvoice: boolean;
}

const DEFAULTS: Record<string, unknown> = {
  inventory: { allowNegativeStock: false, defaultMinStock: 0 },
  sales: { defaultPaymentMethod: "cash", allowCreditSales: true, autoPrintInvoice: false },
  invoice: {
    showLogo: true,
    showCustomerBalance: true,
    showPreviousBalance: true,
    footerText: "",
    thankYouMessage: "",
    vatRate: 0,
    defaultSeller: "",
  },
  printing: { silent: true, thermalWidth: "80mm" },
  // P2 : clé "suppliers" lue par useDefaultMethod — défaut local "cash"
  // (même valeur que le main, jamais de null silencieux au 1er chargement).
  suppliers: { defaultPaymentMethod: "cash" },
};

export function useAppSettings<T>(
  key: string,
  fallback: T | null = null,
): {
  value: T | null;
  reload: () => void;
} {
  const [value, setValue] = useState<T | null>(fallback);
  const reload = useCallback(() => {
    api
      .settingsGet({ key })
      .then((v) => {
        setValue((v as { value: T }).value);
      })
      .catch(() => {
        setValue((DEFAULTS[key] as T) ?? null);
      });
  }, [key]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { value, reload };
}

export async function saveAppSettings(key: string, value: unknown): Promise<void> {
  await api.settingsSave({ key, value });
}

export type PaymentMethod = "cash" | "cheque" | "transfer";

/**
 * Moyen de paiement pré-rempli (réglages fournisseurs) : appliqué à
 * l'ouverture, jamais par-dessus un choix explicite de l'utilisateur.
 */
export function useDefaultMethod(): [PaymentMethod, (m: PaymentMethod) => void] {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const touched = useRef(false);
  const { value } = useAppSettings<{ defaultPaymentMethod: PaymentMethod }>("suppliers");
  useEffect(() => {
    if (!touched.current && value) setMethod(value.defaultPaymentMethod);
  }, [value]);
  return [
    method,
    (m: PaymentMethod) => {
      touched.current = true;
      setMethod(m);
    },
  ];
}
