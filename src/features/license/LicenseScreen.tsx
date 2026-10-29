// Veloria PoS — Écran : Licence (activation hors-ligne, FR).
// Import via dialogue fichier main ; aucune clé ni détail sensible affiché.

import { useEffect, useState } from "react";
import { Copy, FileKey2, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  InfoRow,
  PageHeader,
  SectionTitle,
} from "@shared/ui/primitives.tsx";
import type { Notify } from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { playSound } from "@shared/sound/sound.ts";
import { useLicense } from "./use-license.ts";
import { LICENSE_STATE_TONES, licenseGuidance, licenseStateLabel } from "./types.ts";
import { editionLabel } from "@shared/formatters/format.ts";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- repli volontaire pour contextes non sécurisés (navigator.clipboard indisponible) : copier l'empreinte d'activation ne doit jamais échouer silencieusement.
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Un état futur envoyé par le main (chaîne inconnue) reste un badge gris. */
function stateTone(state: string): "green" | "amber" | "red" | "grey" {
  return (
    (LICENSE_STATE_TONES as Record<string, "green" | "amber" | "red" | "grey">)[state] ?? "grey"
  );
}

export function LicenseScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const { status, refresh } = useLicense(notify);
  const [busy, setBusy] = useState(false);
  const [fingerprint, setFingerprint] = useState<string>("");

  useEffect(() => {
    api
      .licenseHardwareId()
      .then((r) => {
        const fp = (r as { fingerprint?: string }).fingerprint;
        if (typeof fp === "string") setFingerprint(fp);
      })
      .catch(() => undefined);
  }, []);

  async function copyHardwareId(): Promise<void> {
    const ok = await copyText(fingerprint || status?.hardwareShort || "");
    notify(
      ok ? "Identifiant copié." : "Copie impossible : sélectionnez le texte.",
      ok ? "ok" : "err",
    );
  }

  async function importLicense(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const r = (await api.licenseImport()) as {
        imported: boolean;
        status: { state: string };
      };
      if (!r.imported) {
        notify("Aucun fichier sélectionné.", "err");
        return;
      }
      const st = r.status.state;
      if (st === "ACTIVE" || st === "EXPIRING_SOON") {
        notify("Licence activée.", "ok");
        // P5 : activation = succès.
        playSound("success");
      } else {
        notify(`Activation impossible (${licenseStateLabel(st)}).`, "err");
      }
      refresh();
    } catch (e) {
      notify(frError(e, "Activation impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function recheck(): Promise<void> {
    try {
      await api.licenseValidate();
      refresh();
      notify("Vérification effectuée.", "ok");
    } catch (e) {
      notify(frError(e, "Vérification impossible."), "err");
    }
  }

  if (!status) {
    return <EmptyState title="Licence" hint="Chargement de l'état d'activation…" />;
  }

  const full = status as unknown as {
    plan?: string | null;
    clientName?: string | null;
    storeName?: string | null;
    pages?: Record<string, boolean>;
    features?: string[];
  };
  const pageCount = full.pages ? Object.values(full.pages).filter(Boolean).length : null;
  const unactivated = status.state === "UNACTIVATED";
  const details: { label: string; value: string; num?: boolean }[] = [
    ...(status.licenseId ? [{ label: "N° de licence", value: status.licenseId, num: true }] : []),
    ...(full.clientName ? [{ label: "Client", value: full.clientName }] : []),
    ...(full.storeName ? [{ label: "Magasin", value: full.storeName }] : []),
    ...(status.licenseType
      ? [
          {
            label: "Type",
            value: status.licenseType === "lifetime" ? "À vie" : "Durée déterminée",
          },
        ]
      : []),
    ...(status.expiresAt
      ? [{ label: "Expire le", value: status.expiresAt.slice(0, 10), num: true }]
      : []),
    ...(typeof status.daysLeft === "number" && Number.isFinite(status.daysLeft)
      ? [{ label: "Jours restants", value: String(status.daysLeft), num: true }]
      : []),
    ...(pageCount != null
      ? [{ label: "Modules inclus", value: `${pageCount} modules`, num: true }]
      : []),
    ...(full.features && full.features.length > 0
      ? [{ label: "Fonctions", value: String(full.features.length), num: true }]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <PageHeader
        title="Licence et activation de l'appareil"
        module="Licence · activation hors-ligne"
        period="Certificat local x509 · Terminaux de caisse autorisés · Garantie et support technique national."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="relative space-y-4 overflow-hidden p-6">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[2px] bg-[linear-gradient(90deg,transparent,#fbbf24,transparent)] opacity-80"
          />
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbbf24]/10 text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Activation de l&apos;appareil
              </p>
              <h2 className="mt-0.5 text-xl font-bold tracking-tight text-slate-50">
                Ce poste de caisse
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={stateTone(status.state)}>{licenseStateLabel(status.state)}</Badge>
                {status.edition ? (
                  <Badge tone="grey">{editionLabel(status.edition, full.plan ?? null)}</Badge>
                ) : null}
              </div>
            </div>
          </div>

          <p className="rounded-xl border border-white/[0.06] bg-black/25 px-3.5 py-3 text-sm leading-relaxed text-slate-300">
            {licenseGuidance(status.state)}
          </p>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Identifiant matériel
            </p>
            <div className="mt-1.5 flex flex-wrap items-stretch gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 font-mono text-[15px] font-semibold tracking-[0.08em] text-slate-100">
                {status.hardwareShort}
              </code>
              <Button
                variant="secondary"
                onClick={() => void copyHardwareId()}
                aria-label="Copier l'identifiant matériel"
              >
                <Copy size={16} aria-hidden="true" /> Copier
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              « Copier » copie l&apos;empreinte complète à transmettre au fournisseur pour recevoir
              le fichier de licence. Vos données sont conservées dans tous les cas.
            </p>
          </div>

          {unactivated ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Activation en 3 étapes
              </p>
              <ol className="mt-2 space-y-2">
                {[
                  "Copiez l'identifiant matériel ci-dessus.",
                  "Transmettez-le au fournisseur pour obtenir un fichier .vlic.",
                  "Importez le fichier : la licence est vérifiée hors-ligne.",
                ].map((step, i) => (
                  <li key={step} className="flex items-start gap-2.5 text-xs text-slate-400">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fbbf24]/10 font-mono text-[10px] font-bold text-[#fbbf24] ring-1 ring-[#fbbf24]/20">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void importLicense()} disabled={busy}>
              <FileKey2 size={16} aria-hidden="true" /> Importer la licence (.vlic)
            </Button>
            <Button variant="ghost" onClick={() => void recheck()}>
              <RefreshCw size={16} aria-hidden="true" /> Revérifier
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <SectionTitle title="Détails de la licence" hint="Certificat local" />
          {details.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/25 px-4 py-6 text-center">
              <FileKey2 size={22} aria-hidden="true" className="mx-auto text-slate-500" />
              <p className="mt-2 text-sm font-semibold text-slate-300">Aucune licence importée</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Le statut et les modules s&apos;afficheront après activation.
              </p>
            </div>
          ) : (
            <dl className="divide-y divide-white/[0.06]">
              {details.map((row) => (
                <div key={row.label} className="py-2.5">
                  <InfoRow
                    label={row.label}
                    value={row.value}
                    {...(row.num ? { num: true } : {})}
                  />
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}
