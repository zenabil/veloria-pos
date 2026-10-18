// Veloria PoS — Studio d'impression (C6) : modèles SQLite par type de document.
// Personnalisation sans code : papier, copies, marges, logo, mentions,
// TVA/remise/QR/codes/signatures/filigrane — N&B strict conservé.
// Aperçu live sur données démo (jamais de données métier) + impression test.
import { useEffect, useRef, useState } from "react";
import { Copy, FileDown, FileUp, Printer, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  allowedPapers,
  factorySettings,
  mergeTemplateSettings,
  type TemplateDocType,
  type TemplateSettings,
} from "@domain/print/template-rules.ts";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { PrinterCard } from "@shared/printer/PrinterCard.tsx";
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  TextInput,
  type Notify,
} from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";

const DOC_TYPES: { type: TemplateDocType; label: string }[] = [
  { type: "ticket", label: "Ticket 58/80" },
  { type: "proforma", label: "Devis A4" },
  { type: "bon_livraison", label: "Bon de livraison" },
  { type: "recu", label: "Reçu de règlement" },
  { type: "avoir", label: "Bon de retour" },
  { type: "etiquette", label: "Étiquettes" },
];

interface TemplateView {
  id: number;
  doc_type: TemplateDocType;
  name: string;
  // Colonne JSON SQLite : absente/nulle sur lignes legacy → normalisée via ?? {}.
  settings?: Partial<TemplateSettings> | null;
  version: number;
  is_factory: number;
  is_active: number;
  updated_at: string;
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
      <span className="font-semibold text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="h-4 w-4 accent-amber-400"
      />
    </label>
  );
}

export function PrintTemplatesScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [busy, setBusy] = useState(false);

  const [docType, setDocType] = useState<TemplateDocType>("ticket");
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateSettings>(() => factorySettings("ticket"));
  const [draftName, setDraftName] = useState("Défaut");
  // Aperçu : UN seul format par document (politique opération → format) —
  // htmlA4 porte le HTML (devis A4, gabarit étiquette), sinon text80.
  const [preview, setPreview] = useState<{ text80: string; htmlA4: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const previewTimer = useDebouncedTimer();
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmAsync = useConfirm();

  const selected_ = templates.find((t) => t.id === selectedId) ?? null;
  const typeTemplates = templates.filter((t) => t.doc_type === docType);

  // Chargement initial + rechargement à chaque changement de type document.
  // (Fix racine P0 : trois useEffect dupliqués appelaient loadTemplates 3×
  // au montage — IPC inutiles ×2. L'effet [docType] couvre le montage aussi.)
  useEffect(() => {
    void loadTemplates();
  }, [docType]);

  async function loadTemplates(keepId?: number | null): Promise<void> {
    try {
      const r = (await api.templatesList()) as { rows?: unknown };
      const rows = Array.isArray(r.rows) ? (r.rows as TemplateView[]) : [];
      setTemplates(rows);
      const sameType = rows.filter((t) => t.doc_type === docType);
      const wanted =
        sameType.find((t) => t.id === (keepId ?? selectedId)) ??
        sameType.find((t) => t.is_active === 1) ??
        sameType[0] ??
        null;
      if (wanted) {
        setSelectedId(wanted.id);
        const full = mergeTemplateSettings(docType, wanted.settings ?? {});
        setDraft(full);
        setDraftName(wanted.name);
        setDirty(false);
        schedulePreview(full);
      } else {
        setSelectedId(null);
        const fresh = factorySettings(docType);
        setDraft(fresh);
        setDraftName("Défaut");
        setDirty(false);
        schedulePreview(fresh);
      }
    } catch (e) {
      notify(frError(e, "Modèles indisponibles."), "err");
    }
  }

  // Aperçu live (données démo, 500 ms après la dernière modification).
  function schedulePreview(next: TemplateSettings): void {
    previewTimer.schedule(500, () => {
      void (async () => {
        try {
          const r = (await api.templatePreview({
            docType,
            settings: next,
          })) as { text80?: unknown; htmlA4?: unknown };
          setPreview({
            text80: typeof r.text80 === "string" ? r.text80 : "",
            htmlA4: typeof r.htmlA4 === "string" ? r.htmlA4 : "",
          });
        } catch {
          /* l'aperçu suit la prochaine frappe valide */
        }
      })();
    });
  }

  function edit(patch: Partial<TemplateSettings>): void {
    const next = mergeTemplateSettings(docType, { ...draft, ...patch });
    setDraft(next);
    setDirty(true);
    schedulePreview(next);
  }

  function pick(id: number): void {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSelectedId(id);
    const full = mergeTemplateSettings(docType, t.settings ?? {});
    setDraft(full);
    setDraftName(t.name);
    setDirty(false);
    schedulePreview(full);
  }

  async function save(): Promise<void> {
    if (busy) return;
    const name = draftName.trim();
    if (name.length < 2) {
      notify("Nom du modèle requis (2 caractères minimum).", "err");
      return;
    }
    setBusy(true);
    try {
      const r = (await api.templateSave({
        operationId: newOperationId(),
        id: selectedId,
        docType,
        name,
        settings: draft,
      })) as { id: number; version: number };
      notify(`Modèle enregistré (v${r.version}).`, "ok");
      await loadTemplates(r.id);
    } catch (e) {
      notify(frError(e, "Enregistrement impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const r = (await api.templateSave({
        operationId: newOperationId(),
        docType,
        name: `${(selected_?.name ?? "Modèle").slice(0, 90)} (copie)`,
        settings: draft,
      })) as { id: number };
      notify("Modèle dupliqué.", "ok");
      await loadTemplates(r.id);
    } catch (e) {
      notify(frError(e, "Duplication impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function activate(): Promise<void> {
    if (busy || selectedId == null) return;
    setBusy(true);
    try {
      await api.templateActivate({ operationId: newOperationId(), id: selectedId });
      notify("Modèle activé pour les impressions.", "ok");
      await loadTemplates(selectedId);
    } catch (e) {
      notify(frError(e, "Activation impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (busy || selectedId == null) return;
    if (!(await confirmAsync("Supprimer ce modèle d'impression ? Cette action est définitive.")))
      return;
    setBusy(true);
    try {
      await api.templateRemove({ operationId: newOperationId(), id: selectedId });
      notify("Modèle supprimé.", "ok");
      await loadTemplates(null);
    } catch (e) {
      notify(frError(e, "Suppression impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function resetFactory(): Promise<void> {
    if (busy) return;
    if (!(await confirmAsync("Restaurer le modèle d'usine ? Vos réglages actuels seront écrasés.")))
      return;
    setBusy(true);
    try {
      await api.templateReset({ operationId: newOperationId(), docType });
      notify("Modèle d'usine restauré.", "ok");
      await loadTemplates(null);
    } catch (e) {
      notify(frError(e, "Réinitialisation impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  async function testPrint(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await api.templateTestPrint({
        operationId: newOperationId(),
        docType,
        templateId: selectedId,
      });
      notify("Impression test envoyée.", "ok");
    } catch (e) {
      notify(frError(e, "Impression test impossible."), "err");
    } finally {
      setBusy(false);
    }
  }

  function exportJson(): void {
    const payload = {
      app: "veloria-pos",
      kind: "print-template",
      docType,
      name: draftName.trim() || "Modèle",
      version: selected_?.version ?? 1,
      settings: draft,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modele-${docType}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File): Promise<void> {
    try {
      const text = await file.text();
      // JSON.parse retourne any : on force unknown puis affinage runtime (fichier adverse).
      const parsed: unknown = JSON.parse(text) as unknown;
      if (typeof parsed !== "object" || parsed === null) {
        notify("Fichier de modèle invalide.", "err");
        return;
      }
      const record = parsed as { settings?: unknown; name?: unknown; docType?: unknown };
      if (typeof record.settings !== "object" || record.settings === null) {
        notify("Fichier de modèle invalide.", "err");
        return;
      }
      if (record.docType != null) {
        if (typeof record.docType !== "string") {
          notify("Fichier de modèle invalide.", "err");
          return;
        }
        if (record.docType !== docType) {
          notify(`Ce fichier vise un autre document (${record.docType}).`, "err");
          return;
        }
      }
      const full = mergeTemplateSettings(docType, record.settings as Partial<TemplateSettings>);
      setDraft(full);
      if (typeof record.name === "string" && record.name.trim().length >= 2) {
        setDraftName(record.name.trim().slice(0, 100));
      }
      setDirty(true);
      schedulePreview(full);
      notify("Modèle importé : vérifiez l'aperçu puis enregistrez.", "ok");
    } catch {
      notify("Fichier de modèle illisible.", "err");
    }
  }

  const papers = allowedPapers(docType);
  // Devis = A4 ; étiquettes = gabarit thermique ; le reste = ticket 58/80.
  const isThermalDoc = docType !== "proforma" && docType !== "etiquette";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio d'impression"
        module="MODÈLES SQLITE · APERÇU DÉMO · N&B"
        period="Chaque document a son modèle actif — aperçu sur données démo, sans valeur fiscale."
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <PrinterCard notify={notify} showTestPage />

        <Card className="space-y-2 p-4">
          <div className="text-[15px] font-bold text-[#ffe1a7]">Modèles du document</div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Type de document">
            {DOC_TYPES.map((d) => (
              <button
                key={d.type}
                type="button"
                role="tab"
                aria-selected={docType === d.type}
                onClick={() => setDocType(d.type)}
                className={
                  docType === d.type
                    ? "rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-200"
                    : "rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.06]"
                }
              >
                {d.label}
              </button>
            ))}
          </div>
          {typeTemplates.length > 0 ? (
            <Field label="Modèle">
              <Select
                value={selectedId ?? 0}
                onChange={(e) => pick(Number(e.target.value))}
                aria-label="Modèle actif"
                disabled={busy}
              >
                {typeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_active === 1 ? " (actif)" : ""} · v{t.version}
                    {t.is_factory === 1 ? " · usine" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-slate-400">Aucun modèle : réinitialisez l'usine.</p>
          )}
          <Field label="Nom du modèle">
            <TextInput
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setDirty(true);
              }}
              aria-label="Nom du modèle"
              maxLength={100}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={busy} className="flex-1">
              Enregistrer{dirty ? " *" : ""}
              {selected_ ? ` (v${selected_.version + 1})` : ""}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void activate()}
              disabled={busy || selected_?.is_active === 1}
              title="Appliquer ce modèle aux impressions"
            >
              Activer
            </Button>
            <Button
              variant="secondary"
              onClick={() => void duplicate()}
              disabled={busy}
              title="Dupliquer"
            >
              <Copy size={15} aria-hidden="true" />
            </Button>
            <Button
              variant="secondary"
              onClick={() => void remove()}
              disabled={busy || selected_?.is_factory === 1 || selected_?.is_active === 1}
              title="Supprimer (hors usine et actif)"
            >
              <Trash2 size={15} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => void resetFactory()}
              disabled={busy}
              title="Restaurer le modèle d'usine"
            >
              <RotateCcw size={15} aria-hidden="true" /> Usine
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void testPrint()}
              disabled={busy}
              className="flex-1"
            >
              <Printer size={15} aria-hidden="true" /> Impression test
            </Button>
            <Button variant="ghost" onClick={exportJson} disabled={busy} title="Exporter en JSON">
              <FileDown size={15} aria-hidden="true" /> Export
            </Button>
            <Button
              variant="ghost"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              title="Importer un JSON"
            >
              <FileUp size={15} aria-hidden="true" /> Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Importer un modèle JSON"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importJson(f);
              }}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr]">
        <Card className="space-y-3 p-4">
          <div className="text-[15px] font-bold text-[#ffe1a7]">Réglages du modèle</div>
          <Field label="Papier / format">
            <Select
              value={draft.paper}
              onChange={(e) => edit({ paper: e.target.value as TemplateSettings["paper"] })}
              aria-label="Papier"
            >
              {papers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Exemplaires">
              <Select
                value={draft.copies}
                onChange={(e) => edit({ copies: Number(e.target.value) })}
                aria-label="Exemplaires"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Marges (mm)">
              <Select
                value={draft.marginMm}
                onChange={(e) => edit({ marginMm: Number(e.target.value) })}
                aria-label="Marges"
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Logo">
              <Select
                value={draft.logoSize}
                onChange={(e) => edit({ logoSize: e.target.value as TemplateSettings["logoSize"] })}
                aria-label="Taille du logo"
              >
                <option value="S">Petit</option>
                <option value="M">Moyen</option>
                <option value="L">Grand</option>
              </Select>
            </Field>
          </div>
          {isThermalDoc ? (
            <Field label="Police thermique (px)">
              <Select
                value={draft.thermalFontPx}
                onChange={(e) => edit({ thermalFontPx: Number(e.target.value) })}
                aria-label="Police thermique"
              >
                {[9, 10, 11, 12, 13, 14].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle label="Logo" value={draft.showLogo} onChange={(v) => edit({ showLogo: v })} />
            <Toggle
              label="RC / NIF / NIS"
              value={draft.showIdentity}
              onChange={(v) => edit({ showIdentity: v })}
            />
            <Toggle label="TVA" value={draft.showTva} onChange={(v) => edit({ showTva: v })} />
            <Toggle
              label="Lignes à zéro"
              value={draft.showDiscountZero}
              onChange={(v) => edit({ showDiscountZero: v })}
            />
            <Toggle label="QR" value={draft.showQr} onChange={(v) => edit({ showQr: v })} />
            <Toggle
              label="Code-barres"
              value={draft.showCodes}
              onChange={(v) => edit({ showCodes: v })}
            />
            <Toggle
              label="Signatures"
              value={draft.showSignatures}
              onChange={(v) => edit({ showSignatures: v })}
            />
            <Toggle
              label="Filigrane"
              value={draft.showWatermark}
              onChange={(v) => edit({ showWatermark: v })}
            />
          </div>
          {draft.showWatermark ? (
            <Field label="Texte du filigrane">
              <TextInput
                value={draft.watermarkText}
                onChange={(e) => edit({ watermarkText: e.target.value })}
                aria-label="Filigrane"
                maxLength={60}
                placeholder="Ex. DUPLICATA"
              />
            </Field>
          ) : null}
          <Field label="Note d'en-tête" hint="Sous le cartouche, centrée.">
            <TextInput
              value={draft.headerText}
              onChange={(e) => edit({ headerText: e.target.value })}
              aria-label="Note d'en-tête"
              maxLength={200}
              placeholder="Ex. PROMO — paiement espèces uniquement"
            />
          </Field>
          <Field label="Pied de page du modèle" hint="Vide = pied des paramètres.">
            <TextInput
              value={draft.footerText}
              onChange={(e) => edit({ footerText: e.target.value })}
              aria-label="Pied de page"
              maxLength={300}
            />
          </Field>
          <p className="text-xs text-slate-500">
            N&B strict (imprimantes thermiques). Couleurs et polices verrouillées par conception —
            lisibilité fiscale garantie.
          </p>
        </Card>

        <Card className="space-y-2 p-4">
          <div className="text-[15px] font-bold text-[#ffe1a7]">
            Aperçu live (données démo, sans valeur fiscale)
          </div>
          <p className="text-xs text-slate-500">
            {docType === "proforma"
              ? "Devis : A4 uniquement — jamais de ticket."
              : docType === "etiquette"
                ? "Étiquettes : gabarit thermique — jamais A4."
                : "Ticket 58/80 mm uniquement — jamais A4 (choix 58/80 via le papier)."}
          </p>
          {preview?.htmlA4 ? (
            <iframe
              sandbox=""
              srcDoc={preview.htmlA4}
              title="Aperçu modèle"
              className="h-[560px] w-full rounded-xl border border-white/10 bg-white"
            />
          ) : preview?.text80 ? (
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
              {preview.text80}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">Modifiez un réglage pour lancer l'aperçu…</p>
          )}
        </Card>
      </div>
    </div>
  );
}
