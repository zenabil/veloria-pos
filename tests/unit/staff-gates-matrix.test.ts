// Veloria PoS — K-01 / K-04 / K-05 : matrice de contrôle des portes staff.
// Verrouille les corrections de sécurité de la vague W2 :
//  - `customers.accessQrSvg` (QR d'activation APK contenant le PIN du client
//    en clair) DOIT exiger la permission `debts` ;
//  - les lectures sensibles (historique, ventes, dettes, dashboard, rapports,
//    sources de Zakat) DOIVENT exiger une SESSION (fail-closed : sans
//    session, pas de « périmètre gérant ») ;
//  - `database.optimize` (VACUUM sur la base VIVE) DOIT être protégé comme
//    `database.reset`.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as number | null, role: "manager" as string }));

vi.mock("../../electron/ipc/handlers/staff-session", () => ({
  getCurrentStaffUser: () => session.userId,
  setCurrentStaffUser: (id: number | null) => {
    session.userId = id;
  },
  touchStaffSession: () => {},
}));

vi.mock("../../electron/ipc/handlers/staff.repo", () => ({
  userHasPermission: (_userId: number, key: string) => {
    // Rôle simplified : « manager » = tout ; « cashier » = lecture seule.
    if (session.role === "manager") return true;
    return key === "sales";
  },
  getStaffRole: () => session.role,
  mustChangeCode: () => false,
}));

import { enforceStaffGates } from "../../electron/ipc/staff-gates";
import { IPC_CHANNELS } from "../../electron/ipc/channels";

describe("W2 : portes staff — K-01 / K-04 / K-05", () => {
  beforeEach(() => {
    session.userId = null;
    session.role = "manager";
  });
  afterEach(() => {
    session.userId = null;
    session.role = "manager";
  });

  it("K-01 : le QR d'activation (PIN en clair) exige une session ET la permission debts", () => {
    const channel = IPC_CHANNELS["customers.accessQrSvg"];
    // Sans session : refus (le PIN ne doit jamais sortir).
    expect(() => enforceStaffGates(channel, {})).toThrow(/Session requise/);
    // Session simple (droits limités) : refus de permission.
    session.userId = 7;
    session.role = "cashier";
    expect(() => enforceStaffGates(channel, {})).toThrow(/non autorisée/);
    // Gérant : autorisé.
    session.role = "manager";
    expect(() => enforceStaffGates(channel, {})).not.toThrow();
  });

  it("K-04 : les lectures sensibles exigent une session (fail-closed)", () => {
    const sensitive = [
      "history.list",
      "history.detail",
      "history.stats",
      "sales.history",
      "sales.get",
      "dashboard.summary",
      "reports.summary",
      "debts.list",
      "debts.detail",
      "debts.stats",
      "zakat.sources",
      "zakat.history",
    ] as const;
    for (const key of sensitive) {
      const channel = IPC_CHANNELS[key];
      expect(() => enforceStaffGates(channel, {}), key).toThrow(/Session requise/);
      session.userId = 3;
      expect(() => enforceStaffGates(channel, {}), key).not.toThrow();
      session.userId = null;
    }
  });

  it("K-05 : database.optimize est protégé comme database.reset", () => {
    const optimize = IPC_CHANNELS["database.optimize"];
    expect(() => enforceStaffGates(optimize, {})).toThrow(/Session requise/);
    session.userId = 1;
    session.role = "cashier";
    expect(() => enforceStaffGates(optimize, {})).toThrow(/non autorisée/);
    session.role = "manager";
    expect(() => enforceStaffGates(optimize, {})).not.toThrow();
  });

  it("les opérations destructives sont réservées au gérant", () => {
    const channels = [
      IPC_CHANNELS["database.reset"],
      IPC_CHANNELS["database.relocate"],
      IPC_CHANNELS["backup.restore"],
      IPC_CHANNELS["backup.export"],
      IPC_CHANNELS["sync.saveConfig"],
    ];
    for (const channel of channels) {
      expect(() => enforceStaffGates(channel, {}), channel).toThrow(/Session requise/);
      session.userId = 7;
      session.role = "cashier";
      expect(() => enforceStaffGates(channel, {}), channel).toThrow(/gérant/);
      session.role = "manager";
      expect(() => enforceStaffGates(channel, {}), channel).not.toThrow();
      session.userId = null;
      session.role = "manager";
    }
  });

  it("les lectures NON sensibles restent ouvertes (pas de régression UX)", () => {
    // Recherche catalogue, liste de catégories : ouvertes par conception
    // (le rendu filtre, la caisse doit rester rapide hors session).
    for (const key of ["products.search", "products.getByBarcode", "categories.list"] as const) {
      expect(() => enforceStaffGates(IPC_CHANNELS[key], {}), key).not.toThrow();
    }
  });
});
