// Veloria PoS — Tests P5 : moteur sonore (jamais d'exception, no-op sans Audio).
import { describe, it, expect } from "vitest";
import { isSoundEnabled, playSound, setSoundEnabled, type SoundName } from "@shared/sound/sound.ts";

const ALL: SoundName[] = ["success", "error", "blip", "clear", "cash", "print", "warning", "click"];

describe("P5 : sound engine", () => {
  it("interrupteur global", () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });
  it("ne lève jamais (hors navigateur : no-op silencieux)", () => {
    for (const name of ALL) {
      expect(() => playSound(name)).not.toThrow();
    }
    setSoundEnabled(false);
    for (const name of ALL) {
      expect(() => playSound(name)).not.toThrow();
    }
    setSoundEnabled(true);
  });
});
