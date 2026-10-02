// Veloria PoS — Shared: sons d'interface professionnels (P5).
// WebAudio 100 % local, ZÉRO asset (aucun fichier audio, offline garanti).
// - `enabled` : interrupteur (Réglages + tête de caisse), défaut ON discret.
// - `unlockSound()` : appelé au premier geste utilisateur (politique autoplay
//   des navigateurs : aucun son avant interaction).
// - Échec silencieux : le son ne casse JAMAIS l'UI (try/catch global).
// - Volumes bas par conception (caisse de détail, pas d'agression sonore).

import { api } from "@shared/types/ipc-client.ts";

export type SoundName =
  | "success" // vente/journée/clôture validée (arpège montant)
  | "error" // erreur bloquante (buzz grave court)
  | "blip" // ajout article (bip bref)
  | "clear" // panier vidé (descente)
  | "cash" // encaissement (caisse : double tintement)
  | "print" // impression envoyée (impulsion carrée brève)
  | "warning" // confirmation destructive / sous-coût (alternance)
  | "click"; // navigation discrète (optionnel)

let ctx: AudioContext | null = null;
let enabled = true;
let unlocked = false;

/** Interrupteur global (Réglages + tête de caisse). */
export function setSoundEnabled(v: boolean): void {
  enabled = v;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** À appeler sur le premier geste (pointerdown/keydown une fois, voir App). */
export function unlockSound(): void {
  unlocked = true;
  try {
    void ensureCtx()?.resume();
  } catch {
    /* ignore */
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  // RADICAL-FIX lint: lecture via unknown (lib DOM type AudioContext comme
  // toujours défini — garde runtime pour vieux navigateurs webkit).
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (AC === undefined) return null;
  if (ctx === null) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

interface Tone {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function playTones(tones: Tone[]): void {
  if (!enabled || !unlocked) return;
  const ac = ensureCtx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") void ac.resume();
    const t0 = ac.currentTime;
    for (const t of tones) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = t.type ?? "sine";
      osc.frequency.value = t.freq;
      const peak = t.gain ?? 0.08;
      g.gain.setValueAtTime(0.0001, t0 + t.at);
      g.gain.exponentialRampToValueAtTime(peak, t0 + t.at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.at + t.dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0 + t.at);
      osc.stop(t0 + t.at + t.dur + 0.02);
    }
  } catch {
    /* le son ne casse jamais l'UI */
  }
}

const SCORES: Record<SoundName, Tone[]> = {
  success: [
    { freq: 523.25, at: 0, dur: 0.12 },
    { freq: 659.25, at: 0.09, dur: 0.12 },
    { freq: 783.99, at: 0.18, dur: 0.22 },
  ],
  error: [{ freq: 140, at: 0, dur: 0.25, type: "sawtooth", gain: 0.06 }],
  blip: [{ freq: 880, at: 0, dur: 0.07 }],
  clear: [
    { freq: 660, at: 0, dur: 0.09 },
    { freq: 440, at: 0.08, dur: 0.14 },
  ],
  cash: [
    { freq: 987.77, at: 0, dur: 0.09 },
    { freq: 1318.5, at: 0.07, dur: 0.18 },
  ],
  print: [{ freq: 220, at: 0, dur: 0.08, type: "square", gain: 0.04 }],
  warning: [
    { freq: 440, at: 0, dur: 0.1, type: "triangle" },
    { freq: 349.23, at: 0.11, dur: 0.14, type: "triangle" },
  ],
  click: [{ freq: 1200, at: 0, dur: 0.03, gain: 0.03 }],
};

/** Joue un son nommé (no-op si coupé/verrouillé/indisponible). */
export function playSound(name: SoundName): void {
  // Lookup runtime via string (garde contre nom forgé depuis l'UI).
  const table: Record<string, Tone[] | undefined> = SCORES;
  const score = table[name];
  if (score === undefined) return;
  playTones(score);
}

/** Charge la préférence SQLite (défaut ON discret si illisible). */
export async function loadSoundEnabled(): Promise<void> {
  try {
    const r: unknown = await api.settingsGet({ key: "sound" });
    const enabled =
      typeof r === "object" && r !== null && "value" in r
        ? (r as { value?: { enabled?: unknown } }).value?.enabled
        : undefined;
    if (typeof enabled === "boolean") setSoundEnabled(enabled);
  } catch {
    /* défaut */
  }
}

/** Persiste la préférence (mémoire d'abord, SQLite best-effort). */
export async function persistSoundEnabled(v: boolean): Promise<void> {
  setSoundEnabled(v);
  try {
    await api.settingsSave({ key: "sound", value: { enabled: v } });
  } catch {
    /* mémoire seule */
  }
}
