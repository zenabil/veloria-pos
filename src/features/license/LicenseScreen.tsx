// Veloria PoS — Écran : Licence (activation hors-ligne, FR).
// Import via dialogue fichier main ; aucune clé ni détail sensible affiché.

import { useEffect, useState } from "react";
import { Copy, FileKey2, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { Badge, Button, Card, EmptyState, InfoRow, PageHeader } from "@shared/ui/primitives.tsx";
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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <PageHeader
        title="Licence et activation de l'appareil"
        module="Licence · Activation hors-ligne"
        period="Certificat local x509 · Terminaux de caisse autorisés · Garantie et support technique national."
      />
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck size={20} aria-hidden="true" className="text-amber-300" />
          <Badge
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- compatibilité avant : un état futur envoyé par le main (chaîne inconnue) doit afficher un badge gris, jamais un badge cassé.
            tone={LICENSE_STATE_TONES[status.state as keyof typeof LICENSE_STATE_TONES] ?? "grey"}
          >
            {licenseStateLabel(status.state)}
          </Badge>
          {status.edition ? (
            <Badge tone="grey">{editionLabel(status.edition, full.plan ?? null)}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-slate-300">{licenseGuidance(status.state)}</p>
        <dl className="space-y-2.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <InfoRow label="Identifiant matériel" value={status.hardwareShort} num />
            </div>
            <Button
              variant="ghost"
              onClick={() => void copyHardwareId()}
              aria-label="Copier l'identifiant matériel"
            >
              <Copy size={16} aria-hidden="true" /> Copier
            </Button>
          </div>
          {status.licenseId ? <InfoRow label="N° de licence" value={status.licenseId} num /> : null}
          {full.clientName ? <InfoRow label="Client" value={full.clientName} /> : null}
          {full.storeName ? <InfoRow label="Magasin" value={full.storeName} /> : null}
          {status.licenseType ? (
            <InfoRow
              label="Type"
              value={status.licenseType === "lifetime" ? "À vie" : "Durée déterminée"}
            />
          ) : null}
          {status.expiresAt ? (
            <InfoRow label="Expire le" value={status.expiresAt.slice(0, 10)} num />
          ) : null}
          {typeof status.daysLeft === "number" && Number.isFinite(status.daysLeft) ? (
            <InfoRow label="Jours restants" value={String(status.daysLeft)} num />
          ) : null}
          {pageCount != null ? (
            <InfoRow label="Modules inclus" value={`${pageCount} modules`} num />
          ) : null}
          {full.features && full.features.length > 0 ? (
            <InfoRow label="Fonctions" value={String(full.features.length)} num />
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void importLicense()} disabled={busy}>
            <FileKey2 size={16} aria-hidden="true" /> Importer la licence (.vlic)
          </Button>
          <Button variant="ghost" onClick={() => void recheck()}>
            <RefreshCw size={16} aria-hidden="true" /> Revérifier
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          « Copier » copie l&apos;empreinte complète à transmettre au fournisseur pour recevoir le
          fichier de licence. Vos données sont conservées dans tous les cas.
        </p>
      </Card>
    </div>
  );
}
