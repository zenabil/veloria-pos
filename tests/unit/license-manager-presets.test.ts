// Veloria License Manager — Tests : parité des préréglages d'émission.
// Le renderer Manager possède un miroir local (PRESETS/PAGES/FEATURES dans
// App.tsx) ; la signature utilise le catalogue main
// (electron/licensing/catalog.ts). Toute dérive = licence émise avec des
// capabilities inattendues. Miroir du test de parité POS (catalogue & presets).
// Déclarations globales du pont renderer (manager-env.d.ts : fichier global,
// pas un module — la référence triple-slash est ici le seul mécanisme
// possible, aucun import ne convient).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../license-manager/renderer/manager-env.d.ts" />
import { describe, it, expect } from "vitest";
import {
  LICENSE_FEATURES,
  LICENSE_PAGES,
  LICENSE_PLANS,
  PLAN_PRESETS,
} from "../../electron/licensing/catalog.ts";
import { FEATURES, PAGES, PRESETS } from "../../license-manager/renderer/App.tsx";

describe("Manager PRESETS — parité avec le catalogue main", () => {
  it("pages et features miroirs du catalogue (aucune dérive)", () => {
    expect(PAGES.map((p) => p.id).sort()).toEqual([...LICENSE_PAGES].sort());
    expect(FEATURES.map((f) => f.id).sort()).toEqual([...LICENSE_FEATURES].sort());
  });

  it("chaque preset manager égale le preset signé du catalogue", () => {
    for (const plan of LICENSE_PLANS) {
      const preset = PRESETS[plan];
      expect(preset, `préréglage manquant : ${plan}`).toBeDefined();
      const pagesAttendues = Object.entries(PLAN_PRESETS[plan].pages)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort();
      const featuresAttendues = Object.entries(PLAN_PRESETS[plan].features)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .sort();
      expect([...(preset?.pages ?? [])].sort()).toEqual(pagesAttendues);
      expect([...(preset?.features ?? [])].sort()).toEqual(featuresAttendues);
    }
  });
});
