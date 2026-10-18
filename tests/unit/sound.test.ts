// Veloria PoS — Tests P5 : moteur sonore (jamais d'exception, no-op sans Audio).
import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOLUME,
  clampVolume,
  getSoundVolume,
  isSoundEnabled,
  minGapFor,
  playSound,
  scaledPeak,
  setSoundEnabled,
  setSoundVolume,
  type SoundName,
} from "@shared/sound/sound.ts";

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
  it("volume : normalisation bornée (jamais NaN)", () => {
    expect(clampVolume(70)).toBe(70);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(100)).toBe(100);
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(140)).toBe(100);
    expect(clampVolume(69.6)).toBe(70);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(undefined)).toBe(DEFAULT_VOLUME);
    expect(clampVolume("80")).toBe(DEFAULT_VOLUME);
  });
  it("volume : aller-retour mémoire", () => {
    setSoundVolume(42);
    expect(getSoundVolume()).toBe(42);
    setSoundVolume(999);
    expect(getSoundVolume()).toBe(100);
    setSoundVolume(DEFAULT_VOLUME);
    expect(getSoundVolume()).toBe(DEFAULT_VOLUME);
  });
  it("volume : crête mise à l'échelle (0 = muet)", () => {
    expect(scaledPeak(0.08, 100)).toBeCloseTo(0.08, 10);
    expect(scaledPeak(0.08, 50)).toBeCloseTo(0.04, 10);
    expect(scaledPeak(0.08, 0)).toBe(0);
    expect(scaledPeak(0.06, 70)).toBeCloseTo(0.042, 10);
  });
  it("anti-spam : seuls blip/click bridés", () => {
    expect(minGapFor("blip")).toBeGreaterThan(0);
    expect(minGapFor("click")).toBeGreaterThan(0);
    expect(minGapFor("success")).toBe(0);
    expect(minGapFor("error")).toBe(0);
    expect(minGapFor("cash")).toBe(0);
  });
  it("ne lève jamais quel que soit le volume", () => {
    for (const v of [0, 1, 70, 100]) {
      setSoundVolume(v);
      for (const name of ALL) {
        expect(() => playSound(name)).not.toThrow();
      }
    }
    setSoundVolume(DEFAULT_VOLUME);
  });
});
