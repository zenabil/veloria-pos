// Veloria PoS — Tests : découpage ClientDialogs.tsx en dialogs/ (zéro changement fonctionnel).
// Prouve : mêmes exports, mêmes libellés FR, mêmes helpers, aucune importation
// Electron/Node/SQLite côté renderer, aucun canal `run-sql` générique.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fullName, resolveCustomerName, splitFullName } from "@/features/customers/types.ts";
import { CLIENT_TABS, clientTabLabel, historyKindOf } from "@/features/customers/dialogs/types.ts";
import * as Barrel from "@/features/customers/ClientDialogs.tsx";
import { ClientDetailsDrawer } from "@/features/customers/dialogs/ClientDetailsDrawer.tsx";
import { ClientFormDialog } from "@/features/customers/dialogs/ClientFormDialog.tsx";
import { PaymentDialog } from "@/features/customers/dialogs/PaymentDialog.tsx";
import {
  ClientDrawerBadges,
  ClientDrawerFooter,
  ClientDrawerHeader,
} from "@/features/customers/dialogs/ClientDrawerHeader.tsx";
import { ClientDrawerTabs } from "@/features/customers/dialogs/ClientDrawerTabs.tsx";
import { ClientDrawerDebts } from "@/features/customers/dialogs/ClientDrawerDebts.tsx";
import { ClientMobileAccess } from "@/features/customers/dialogs/ClientMobileAccess.tsx";
import { SlipPreviewModal } from "@/features/customers/dialogs/SlipPreviewModal.tsx";
import { useClientDrawerData } from "@/features/customers/dialogs/useClientDrawerData.ts";
import { useClientDrawerActions } from "@/features/customers/dialogs/useClientDrawerActions.ts";

const DIALOGS_DIR = join(process.cwd(), "src", "features", "customers", "dialogs");
const BARREL = join(process.cwd(), "src", "features", "customers", "ClientDialogs.tsx");

function readSource(name: string): string {
  return readFileSync(join(DIALOGS_DIR, name), "utf8");
}

describe("Découpage ClientDialogs (compatibilité)", () => {
  it("le barillet ré-exporte exactement les 3 dialogs (mêmes références)", () => {
    expect(Object.keys(Barrel).sort()).toEqual([
      "ClientDetailsDrawer",
      "ClientFormDialog",
      "PaymentDialog",
    ]);
    expect(Barrel.ClientDetailsDrawer).toBe(ClientDetailsDrawer);
    expect(Barrel.ClientFormDialog).toBe(ClientFormDialog);
    expect(Barrel.PaymentDialog).toBe(PaymentDialog);
  });

  it("types : CLIENT_TABS garde les 5 onglets FR dans l'ordre", () => {
    expect(CLIENT_TABS.map((t) => t.id)).toEqual([
      "factures",
      "paiements",
      "retours",
      "dettes",
      "historique",
    ]);
    expect(CLIENT_TABS.map((t) => t.label)).toEqual([
      "Factures",
      "Paiements",
      "Retours",
      "Dettes-Solde",
      "Historique",
    ]);
  });

  it("types : libellés d'onglets avec compteurs (repli sans compteur)", () => {
    const counts = {
      sales: 3,
      payments: 2,
      returns: 1,
      returnsReady: true,
      debts: 4,
      debtsReady: false,
      history: 7,
      historyReady: true,
    };
    expect(clientTabLabel("factures", counts)).toBe("Factures (3)");
    expect(clientTabLabel("paiements", counts)).toBe("Paiements (2)");
    expect(clientTabLabel("retours", counts)).toBe("Retours (1)");
    expect(clientTabLabel("dettes", counts)).toBe("Dettes-Solde");
    expect(clientTabLabel("historique", counts)).toBe("Historique (7)");
  });

  it("types : historyKindOf ne retient que les natures connues", () => {
    expect(historyKindOf("sale")).toBe("sale");
    expect(historyKindOf("inconnu")).toBeNull();
  });

  it("helpers : splitFullName/fullName round-trip (comportement formulaire)", () => {
    const { firstName, lastName } = splitFullName("Amine Benali");
    expect(`${firstName} ${lastName}`).toBe("Amine Benali");
    expect(fullName({ first_name: firstName, last_name: lastName })).toBe("Amine Benali");
  });

  it("helpers : un nom existant non modifié garde ses champs (nom composé)", () => {
    const existing = { first_name: "Amine", last_name: "Ben Ali" };
    expect(resolveCustomerName(existing, "Amine Ben Ali", false)).toEqual({
      firstName: "Amine",
      lastName: "Ben Ali",
    });
    expect(resolveCustomerName(existing, "Amine Benali", true)).toEqual({
      firstName: "Amine",
      lastName: "Benali",
    });
    expect(resolveCustomerName(null, "Solo", false)).toEqual({
      firstName: "Solo",
      lastName: "Solo",
    });
  });

  it("chaque module de dialogs expose son composant (fonction définie)", () => {
    for (const c of [
      ClientDetailsDrawer,
      ClientFormDialog,
      PaymentDialog,
      ClientDrawerHeader,
      ClientDrawerFooter,
      ClientDrawerBadges,
      ClientDrawerTabs,
      ClientDrawerDebts,
      ClientMobileAccess,
      SlipPreviewModal,
    ]) {
      expect(typeof c).toBe("function");
    }
  });

  it("chaque hook de dialogs est défini", () => {
    expect(typeof useClientDrawerData).toBe("function");
    expect(typeof useClientDrawerActions).toBe("function");
  });

  it("aucun import Electron/Node/SQLite dans dialogs/ ni dans le barillet", () => {
    const sources = [
      readSource("types.ts"),
      readSource("ClientDetailsDrawer.tsx"),
      readSource("ClientDrawerHeader.tsx"),
      readSource("ClientDrawerTabs.tsx"),
      readSource("ClientDrawerDebts.tsx"),
      readSource("ClientMobileAccess.tsx"),
      readSource("SlipPreviewModal.tsx"),
      readSource("ClientFormDialog.tsx"),
      readSource("PaymentDialog.tsx"),
      readSource("useClientDrawerData.ts"),
      readSource("useClientDrawerActions.ts"),
      readFileSync(BARREL, "utf8"),
    ];
    for (const src of sources) {
      expect(src).not.toMatch(/from\s+["']electron["']/);
      expect(src).not.toMatch(/ipcRenderer/);
      expect(src).not.toMatch(/better-sqlite3/);
      expect(src).not.toMatch(/from\s+["']node:/);
      expect(src).not.toMatch(/from\s+["']fs["']/);
      expect(src).not.toMatch(/run-sql|runSql/);
    }
  });

  it("les messages FR critiques sont conservés dans les modules", () => {
    expect(readSource("ClientFormDialog.tsx")).toContain("Nom complet requis (prénom + nom).");
    expect(readSource("PaymentDialog.tsx")).toContain("Le montant dépasse la dette du client.");
    expect(readSource("ClientDrawerHeader.tsx")).toContain("Encaisser un paiement");
    expect(readSource("useClientDrawerActions.ts")).toContain("Bon de retour indisponible.");
    expect(readSource("useClientDrawerData.ts")).toContain("Relevé indisponible.");
  });
});
