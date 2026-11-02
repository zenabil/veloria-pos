// Veloria PoS — Écran Rapports : sessions de caisse (poste, comptage, écart).
// Migration 0059. Le main décide (gates staff + licence `reports`) ; ici on
// présente, on saisit et on prévient — jamais de calcul d'argent côté renderer.
import { useCallback, useEffect, useState } from "react";
import {
  callChecked,
  cashSessionCurrentResultSchema,
  cashSessionListResultSchema,
  cashSessionResultSchema,
  type CashSessionRowView,
} from "@shared/types/ipc-contracts.ts";
import { formatDzd, parseDzdInputStrict } from "@domain/money/money.ts";
import { formatDateTimeFr, formatDzdSigned } from "@shared/formatters/format.ts";
import { newOperationId } from "@domain/common/ids.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";
import { Button, Field, TextInput, cn, type Notify } from "@shared/ui/primitives.tsx";
import { MiniTable, ReportSectionCard } from "./widgets.tsx";

type CashSessionRow = CashSessionRowView;

export function CashSessionsSection({
  from,
  to,
  notify,
}: {
  from: string;
  to: string;
  notify: Notify;
}): React.JSX.Element {
  const [rows, setRows] = useState<CashSessionRow[]>([]);
  // Session active HORS période : une caisse ouverte hier reste fermable
  // aujourd'hui (la liste, elle, est bornée par la période choisie).
  const [current, setCurrent] = useState<CashSessionRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"open" | "count" | "close" | null>(null);
  const [post, setPost] = useState("Caisse 1");
  const [label, setLabel] = useState("");
  const [floatText, setFloatText] = useState("0,00");
  const [countedText, setCountedText] = useState("");
  const [error, setError] = useState("");
  const confirmAsync = useConfirm();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [list, active] = await Promise.all([
        callChecked((a) => a.cash.list({ from, to }), cashSessionListResultSchema),
        callChecked((a) => a.cash.current(), cashSessionCurrentResultSchema),
      ]);
      setRows(list.rows);
      setCurrent(active);
      setError("");
    } catch (e) {
      setError(frError(e, "Sessions de caisse indisponibles."));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(
    action: "open" | "count" | "close",
    fn: () => Promise<unknown>,
  ): Promise<void> {
    if (busy !== null) return;
    setBusy(action);
    try {
      await fn();
      await load();
      setError("");
    } catch (e) {
      setError(frError(e, "Opération de caisse refusée."));
    } finally {
      setBusy(null);
    }
  }

  /** Saisie DZD → centimes ; `null` + message FR si la saisie est fausse. */
  function parseAmount(text: string, label: string): number | null {
    try {
      return parseDzdInputStrict(text.trim() === "" ? "0" : text, label);
    } catch {
      setError(`${label} invalide (ex. : 5 000,00).`);
      return null;
    }
  }

  function openSession(): void {
    const trimmedPost = post.trim();
    const sessionLabel = label.trim() === "" ? `${trimmedPost} — journée` : label.trim();
    if (trimmedPost === "") {
      setError("Indiquez le nom du poste de caisse.");
      return;
    }
    const floatMinor = parseAmount(floatText, "Fond d'ouverture");
    if (floatMinor === null) return;
    void run("open", async () => {
      await callChecked(
        (a) =>
          a.cash.open({
            operationId: newOperationId(),
            post: trimmedPost,
            label: sessionLabel,
            openingFloatMinor: floatMinor,
          }),
        cashSessionResultSchema,
      );
      setLabel("");
      notify(`Session « ${sessionLabel} » ouverte.`, "ok");
    });
  }

  /** Session ouverte désignée pour le comptage : la session active du main. */
  const activeOpen = current;

  function countedValue(): number | null {
    if (countedText.trim() === "") {
      setError("Saisissez le montant compté dans le tiroir.");
      return null;
    }
    return parseAmount(countedText, "Comptage");
  }

  function countSession(): void {
    if (activeOpen == null) {
      setError("Aucune session de caisse ouverte sur la période.");
      return;
    }
    const minor = countedValue();
    if (minor === null) return;
    void run("count", async () => {
      await callChecked(
        (a) =>
          a.cash.count({
            operationId: newOperationId(),
            sessionId: activeOpen.id,
            countedMinor: minor,
          }),
        cashSessionResultSchema,
      );
      notify(`Comptage enregistré (${formatDzd(minor)}).`, "ok");
    });
  }

  async function closeSession(): Promise<void> {
    if (activeOpen == null) {
      setError("Aucune session de caisse ouverte sur la période.");
      return;
    }
    const minor = countedValue();
    if (minor === null) return;
    const ok = await confirmAsync(
      `Fermer « ${activeOpen.label} » avec un comptage de ${formatDzd(minor)} ? L'attente sera figée à la fermeture et la session deviendra non modifiable.`,
    );
    if (!ok) return;
    void run("close", async () => {
      await callChecked(
        (a) =>
          a.cash.close({
            operationId: newOperationId(),
            sessionId: activeOpen.id,
            countedMinor: minor,
          }),
        cashSessionResultSchema,
      );
      setCountedText("");
      notify("Session de caisse fermée.", "ok");
    });
  }

  const openCount = rows.filter((r) => r.status === "open").length;
  const closedVariance = rows
    .filter((r) => r.status === "closed" && r.varianceMinor !== null)
    .reduce((sum, r) => sum + (r.varianceMinor ?? 0), 0);

  return (
    <ReportSectionCard title="Sessions de caisse">
      <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
        <Field label="Poste">
          <TextInput
            value={post}
            onChange={(e) => setPost(e.target.value)}
            maxLength={40}
            aria-label="Nom du poste de caisse"
          />
        </Field>
        <Field label="Libellé (facultatif)">
          <TextInput
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Caisse 1 — matin"
            aria-label="Libellé de la session"
          />
        </Field>
        <Field label="Fond d'ouverture (DZD)">
          <TextInput
            value={floatText}
            onChange={(e) => setFloatText(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-label="Fond d'ouverture de caisse"
          />
        </Field>
        <Button onClick={openSession} disabled={busy !== null || loading}>
          {busy === "open" ? "Ouverture…" : "Ouvrir la session"}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
        <Field label="Comptage physique (DZD)">
          <TextInput
            value={countedText}
            onChange={(e) => setCountedText(e.target.value)}
            inputMode="decimal"
            placeholder={activeOpen ? formatDzd(activeOpen.expectedMinor) : "0,00"}
            aria-label="Montant compté dans le tiroir"
          />
        </Field>
        <Button
          variant="secondary"
          onClick={countSession}
          disabled={busy !== null || activeOpen == null}
        >
          {busy === "count" ? "Enregistrement…" : "Enregistrer le comptage"}
        </Button>
        <Button onClick={() => void closeSession()} disabled={busy !== null || activeOpen == null}>
          {busy === "close" ? "Fermeture…" : "Fermer la session"}
        </Button>
        {activeOpen != null ? (
          <span className="text-xs text-slate-400">
            Session en cours : {activeOpen.post} — attente {formatDzd(activeOpen.expectedMinor)}
          </span>
        ) : null}
      </div>

      {error !== "" ? (
        <p className="px-4 pb-3 text-xs font-medium text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      <MiniTable
        headers={["Poste", "Libellé", "Ouverture", "Fond", "Attente", "Comptage", "Écart", "État"]}
        rows={rows.map((r) => [
          r.post,
          r.label,
          formatDateTimeFr(r.openedAt),
          formatDzd(r.openingFloatMinor),
          formatDzd(r.expectedMinor),
          r.countedMinor === null ? "—" : formatDzd(r.countedMinor),
          r.varianceMinor === null ? "—" : formatDzdSigned(r.varianceMinor),
          r.status === "open" ? "Ouverte" : "Fermée",
        ])}
        empty="Aucune session de caisse sur la période."
      />
      <p className="px-4 pb-3 text-xs text-slate-500">
        Une session = un poste de caisse. L'attente suit la formule du rapport Z ( fond + ventes
        espèces + encaissements − dépenses − remboursements) sur la fenêtre de la session ; elle est
        figée à la fermeture. L'écart n'est jamais stocké : c'est comptage − attente. Un poste ne
        peut ouvrir qu'une seule session à la fois
        <span className={cn(openCount > 0 && "text-amber-300")}>
          {" "}
          ({openCount} poste{openCount > 1 ? "s" : ""} ouvert
          {openCount > 1 ? "s" : ""} sur la période)
        </span>
        . Écart net des sessions fermées de la période : {formatDzdSigned(closedVariance)}.
      </p>
    </ReportSectionCard>
  );
}
