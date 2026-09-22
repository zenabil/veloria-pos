// Veloria PoS — Tests : échec de démarrage base (startup fatal + récupération).
// Modules purs electron/main/* : aucune fenêtre, aucun SQLite natif requis.
import { describe, it, expect, vi, type Mock } from "vitest";
import {
  attemptDatabaseStartup,
  classifyStartupError,
  resolveStartup,
  type StartupFailure,
} from "../../electron/main/startup-flow.ts";
import { buildRecoveryHtml } from "../../electron/main/recovery-view.ts";

function deps(
  overrides: {
    openDatabase?: Mock;
    integrityCheck?: Mock;
  } = {},
): {
  openDatabase: Mock;
  integrityCheck: Mock;
  enterMainMode: Mock;
  enterRecoveryMode: Mock;
  log: Mock;
} {
  return {
    openDatabase: vi.fn(() => ({ path: "/data/Veloria POS DB.sqlite", schemaVersion: 16 })),
    integrityCheck: vi.fn(() => ({ integrity: "ok", foreignKeys: [] })),
    enterMainMode: vi.fn(),
    enterRecoveryMode: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

describe("Database startup — cas nominal", () => {
  it("ouvre la coquille applicative quand la base est prête", () => {
    const d = deps();
    const { mode, failure } = resolveStartup(d);
    expect(mode).toBe("main");
    expect(failure).toBeNull();
    expect(d.enterMainMode).toHaveBeenCalledTimes(1);
    expect(d.enterMainMode).toHaveBeenCalledWith({
      path: "/data/Veloria POS DB.sqlite",
      schemaVersion: 16,
    });
    expect(d.enterRecoveryMode).not.toHaveBeenCalled();
  });
});

describe("Database startup — échec fatal", () => {
  it("bascule en récupération (jamais de fenêtre principale) si l'ouverture échoue", () => {
    const d = deps({
      openDatabase: vi.fn(() => {
        throw new Error("SQLITE_CANTOPEN: unable to open database file");
      }),
    });
    const { mode } = resolveStartup(d);
    expect(mode).toBe("recovery");
    expect(d.enterMainMode).not.toHaveBeenCalled();
    expect(d.enterRecoveryMode).toHaveBeenCalledTimes(1);
    const failure = d.enterRecoveryMode.mock.calls[0]?.[0] as StartupFailure;
    expect(failure.stage).toBe("open");
    // Message FR compréhensible, données rassurées, sans trace technique.
    expect(failure.userMessage).toMatch(/données sont conservées/);
    expect(failure.userMessage).not.toMatch(/SQLITE_CANTOPEN/);
    expect(failure.userMessage).not.toMatch(/\.ts|\.js|at /);
    // Le détail technique part au journal, pas à l'UI.
    expect(d.log).toHaveBeenCalledWith("FATAL", "app", "database.startup_failed", {
      stage: "open",
      error: "SQLITE_CANTOPEN: unable to open database file",
    });
  });

  it("classe l'échec de migration séparément (checksum mismatch)", () => {
    const failure = classifyStartupError(
      new Error("Migration 3 checksum mismatch — fichier modifié après release."),
    );
    expect(failure.stage).toBe("migration");
    expect(failure.userMessage).toMatch(/mise à jour.*échoué/i);
    expect(failure.userMessage).not.toMatch(/checksum/);
  });

  it("classe l'échec de migration via attemptDatabaseStartup", () => {
    const attempt = attemptDatabaseStartup({
      openDatabase: () => {
        throw new Error("Migration 3 checksum mismatch — fichier modifié après release.");
      },
      integrityCheck: () => ({ integrity: "ok", foreignKeys: [] }),
    });
    expect(attempt.status).toBe("failed");
    if (attempt.status === "failed") expect(attempt.failure.stage).toBe("migration");
  });

  it("conserve le message FR d'une base plus récente (pas de fuite technique)", () => {
    const fr =
      "Cette base de données a été créée avec une version plus récente de Veloria PoS. Veuillez mettre à jour l'application.";
    const failure = classifyStartupError(new Error(fr));
    expect(failure.stage).toBe("version");
    expect(failure.userMessage).toBe(fr);
  });

  it("bascule en récupération si l'intégrité est en échec", () => {
    const d = deps({ integrityCheck: vi.fn(() => ({ integrity: "error", foreignKeys: [] })) });
    expect(resolveStartup(d).mode).toBe("recovery");
    expect(d.enterMainMode).not.toHaveBeenCalled();
    const failure = d.enterRecoveryMode.mock.calls[0]?.[0] as StartupFailure;
    expect(failure.stage).toBe("integrity");
    expect(failure.userMessage).toMatch(/sauvegarde vérifiée/);
  });

  it("bascule en récupération en cas de violations de clés étrangères", () => {
    const d = deps({
      integrityCheck: vi.fn(() => ({ integrity: "ok", foreignKeys: [{ fk: 1 }] })),
    });
    expect(resolveStartup(d).mode).toBe("recovery");
    expect(d.enterMainMode).not.toHaveBeenCalled();
  });

  it("bascule en récupération si le contrôle d'intégrité lève", () => {
    const d = deps({
      integrityCheck: vi.fn(() => {
        throw new Error("DATABASE_UNAVAILABLE");
      }),
    });
    expect(resolveStartup(d).mode).toBe("recovery");
    expect(d.enterMainMode).not.toHaveBeenCalled();
  });
});

describe("Recovery flow — réessai", () => {
  it("un réessai réussi ouvre la coquille applicative", () => {
    const broken = deps({
      openDatabase: vi.fn(() => {
        throw new Error("SQLITE_BUSY: database is locked");
      }),
    });
    expect(resolveStartup(broken).mode).toBe("recovery");
    expect(broken.enterMainMode).not.toHaveBeenCalled();

    const fixed = deps();
    expect(resolveStartup(fixed).mode).toBe("main");
    expect(fixed.enterMainMode).toHaveBeenCalledTimes(1);
  });

  it("un réessai encore en échec ne crée toujours pas de fenêtre principale", () => {
    const stillBroken = deps({
      openDatabase: vi.fn(() => {
        throw new Error("SQLITE_CORRUPT: database disk image is malformed");
      }),
    });
    expect(resolveStartup(stillBroken).mode).toBe("recovery");
    expect(resolveStartup(stillBroken).mode).toBe("recovery");
    expect(stillBroken.enterMainMode).not.toHaveBeenCalled();
    expect(stillBroken.enterRecoveryMode).toHaveBeenCalledTimes(2);
  });
});

describe("Recovery view — message sûr", () => {
  it("affiche le message FR avec les actions, sans trace technique", () => {
    const html = buildRecoveryHtml({
      userMessage: "La base de données est inaccessible. Vos données sont conservées.",
      appVersion: "2.0.0",
      dbFolder: "/data",
    });
    expect(html).toMatch(/Base de données indisponible/);
    expect(html).toMatch(/Réessayer/);
    expect(html).toMatch(/Restaurer la sauvegarde/);
    expect(html).toMatch(/Quitter/);
    expect(html).toMatch(/Vos données sont conservées/);
    expect(html).not.toMatch(/sqlite\.service/);
    expect(html).not.toMatch(/at open/);
    expect(html).not.toMatch(/stack/i);
  });

  it("n'expose jamais le détail technique même s'il est passé par erreur", () => {
    const html = buildRecoveryHtml({
      userMessage: "Message sûr.",
      appVersion: '2.0.0"><script>alert(1)</script>',
      dbFolder: "/data",
    });
    // Échappement HTML des valeurs interpolées.
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('2.0.0"><script>alert(1)</script>');
  });
});
