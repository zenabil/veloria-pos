// Veloria PoS — Studio d'impression (C6) : modèles SQLite par type de document.
// Personnalisation sans code : papier, copies, marges, logo, mentions,
// TVA/remise/QR/codes/signatures/filigrane — N&B strict conservé.
// Aperçu live sur données démo (jamais de données métier) + impression test.
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  FileDown,
  FileText,
  FileUp,
  Loader2,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Tags,
  Trash2,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { api } from "@shared/types/ipc-client.ts";
import { newOperationId } from "@domain/common/ids.ts";
import {
  factorySettings,
  mergeTemplateSettings,
  type TemplateDocType,
  type TemplateSettings,
} from "@domain/print/template-rules.ts";
import { TemplateSettingsPanel } from "./TemplateSettingsPanel.tsx";
import { useDebouncedTimer } from "@shared/ui/use-debounced-timer.ts";
import { PrinterCard } from "@shared/printer/PrinterCard.tsx";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  TextInput,
  cn,
  type Notify,
} from "@shared/ui/primitives.tsx";
import { frError } from "@shared/errors/fr-map.ts";
import { useConfirm } from "@shared/ui/confirm-dialog.tsx";

const DOC_TYPES: { type: TemplateDocType; label: string; icon: LucideIcon }[] = [
  { type: "ticket", label: "Ticket 58/80", icon: ReceiptText },
  { type: "proforma", label: "Devis A4", icon: FileText },
  { type: "bon_livraison", label: "Bon de livraison", icon: Truck },
  { type: "recu", label: "Reçu de règlement", icon: BadgeCheck },
  { type: "avoir", label: "Bon de retour", icon: Undo2 },
  { type: "etiquette", label: "Étiquettes", icon: Tags },
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

function DocTypeTabs({
  docType,
  activeTemplate,
  onChange,
}: {
  docType: TemplateDocType;
  activeTemplate: TemplateView | null;
  onChange: (type: TemplateDocType) => void;
}): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-2 p-2.5 xl:flex-row xl:items-center">
      <div
        role="tablist"
        aria-label="Type de document"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1 xl:pb-0"
      >
        {DOC_TYPES.map((d) => {
          const Icon = d.icon;
          const selected = docType === d.type;
          return (
            <button
              key={d.type}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(d.type)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                selected
                  ? "bg-amber-400 text-[#1a1206] shadow"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              <Icon size={14} aria-hidden="true" />
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 xl:self-auto">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Modèle actif
        </span>
        <span className="max-w-[180px] truncate text-xs font-bold text-slate-200">
          {activeTemplate?.name ?? "Aucun"}
        </span>
        {activeTemplate ? (
          <Badge tone="green">v{activeTemplate.version}</Badge>
        ) : (
          <Badge tone="amber">À créer</Badge>
        )}
      </div>
    </Card>
  );
}

function TemplateManager({
  docType,
  templates,
  selected,
  selectedId,
  draftName,
  dirty,
  loading,
  error,
  busy,
  onPick,
  onNameChange,
  onSave,
  onActivate,
  onDuplicate,
  onRemove,
  onReset,
  onExport,
  onImport,
}: {
  docType: TemplateDocType;
  templates: TemplateView[];
  selected: TemplateView | null;
  selectedId: number | null;
  draftName: string;
  dirty: boolean;
  loading: boolean;
  error: string;
  busy: boolean;
  onPick: (id: number) => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onActivate: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onReset: () => void;
  onExport: () => void;
  onImport: () => void;
}): React.JSX.Element {
  const docLabel = DOC_TYPES.find((d) => d.type === docType)?.label ?? docType;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-bold text-slate-100">Modèles du document</div>
          <p className="mt-0.5 text-xs text-slate-500">
            {templates.length} modèle{templates.length > 1 ? "s" : ""} · {docLabel}
          </p>
        </div>
        <Badge tone={dirty ? "amber" : "green"}>{dirty ? "Modifié" : "À jour"}</Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2 text-xs text-rose-200"
        >
          {error} — réessayez ou réinitialisez l'usine.
        </p>
      ) : null}

      {loading ? (
        <p
          role="status"
          className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400"
        >
          Chargement des modèles…
        </p>
      ) : templates.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-white/15 bg-black/15 p-3">
          <EmptyState
            title="Aucun modèle pour ce document"
            hint="Réinitialisez le modèle d'usine pour repartir des réglages par défaut."
          />
          <Button type="button" variant="secondary" onClick={onReset} disabled={busy}>
            <RotateCcw size={14} aria-hidden="true" /> Restaurer l'usine
          </Button>
        </div>
      ) : (
        <ul aria-label="Modèles du document" className="max-h-52 space-y-1 overflow-auto">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={selectedId === t.id}
                onClick={() => onPick(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  selectedId === t.id
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-transparent hover:border-white/10 hover:bg-white/[0.05]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-200">
                    {t.name}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    v{t.version}
                    {t.is_factory === 1 ? " · usine" : ""}
                  </span>
                </span>
                {t.is_active === 1 ? <Badge tone="green">Actif</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Field label="Nom du modèle">
        <TextInput
          value={draftName}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="Nom du modèle"
          maxLength={100}
        />
      </Field>

      <div className="flex gap-2">
        <Button type="button" onClick={onSave} disabled={busy || loading} className="flex-1">
          <Save size={15} aria-hidden="true" />
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onActivate}
          disabled={busy || loading || selected?.is_active === 1 || selectedId == null}
          title="Appliquer ce modèle aux impressions"
        >
          {selected?.is_active === 1 ? "Actif" : "Activer"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          variant="secondary"
          onClick={onDuplicate}
          disabled={busy || loading}
          title="Dupliquer"
        >
          <Copy size={14} aria-hidden="true" /> Dupliquer
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onRemove}
          disabled={
            busy ||
            loading ||
            selectedId == null ||
            selected?.is_factory === 1 ||
            selected?.is_active === 1
          }
          title="Supprimer (hors usine et actif)"
        >
          <Trash2 size={14} aria-hidden="true" /> Supprimer
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          disabled={busy || loading}
          title="Restaurer le modèle d'usine"
          className="col-span-2"
        >
          <RotateCcw size={14} aria-hidden="true" /> Restaurer l'usine
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-white/10 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onExport}
          disabled={busy}
          title="Exporter en JSON"
        >
          <FileDown size={14} aria-hidden="true" /> Exporter
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onImport}
          disabled={busy}
          title="Importer un JSON"
        >
          <FileUp size={14} aria-hidden="true" /> Importer
        </Button>
      </div>
    </Card>
  );
}

function PreviewPanel({
  docType,
  preview,
  previewBusy,
  dirty,
  busy,
  onTestPrint,
}: {
  docType: TemplateDocType;
  preview: { text80: string; html80: string; htmlA4: string } | null;
  previewBusy: boolean;
  dirty: boolean;
  busy: boolean;
  onTestPrint: () => void;
}): React.JSX.Element {
  const note =
    docType === "proforma"
      ? "Devis : A4 uniquement — jamais de ticket."
      : docType === "etiquette"
        ? "Étiquettes : gabarit thermique — jamais A4."
        : "Ticket 58/80 mm uniquement — jamais A4 (choix 58/80 via le papier).";
  const extraNote =
    docType !== "proforma" &&
    docType !== "etiquette" &&
    docType !== "ticket" &&
    preview?.html80 === ""
      ? " Le logo et le filigrane (si activés) sortent à l'impression — l'aperçu texte ne les montre pas."
      : "";
  return (
    <Card className="space-y-3 p-4 xl:sticky xl:top-4 xl:self-start">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-bold text-slate-100">Aperçu</div>
          <p className="mt-0.5 text-xs text-slate-500">Données démo, sans valeur fiscale</p>
        </div>
        <span
          role="status"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold",
            previewBusy
              ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
              : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
          )}
        >
          {previewBusy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={12} aria-hidden="true" />
          )}
          {previewBusy ? "Mise à jour…" : "À jour"}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        {note}
        {extraNote}
      </p>
      <div className="rounded-xl border border-white/10 bg-[#0a1420] p-2">
        {preview?.htmlA4 || preview?.html80 ? (
          <iframe
            sandbox=""
            srcDoc={preview.htmlA4 || preview.html80}
            title="Aperçu modèle"
            className="h-[560px] w-full rounded-lg border border-white/10 bg-white"
          />
        ) : preview?.text80 ? (
          <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {preview.text80}
          </pre>
        ) : (
          <p className="p-6 text-center text-sm text-slate-500">
            Modifiez un réglage pour lancer l'aperçu…
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          {dirty ? "Modifications non enregistrées." : "Prêt à imprimer."}
        </span>
        <Button type="button" onClick={onTestPrint} disabled={busy}>
          <Printer size={15} aria-hidden="true" /> Impression test
        </Button>
      </div>
    </Card>
  );
}

export function PrintTemplatesScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  // A-07 : états de chargement et d'erreur persistants (le Studio
  // affichait les réglages du type précédent pendant le chargement).
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [docType, setDocType] = useState<TemplateDocType>("ticket");
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateSettings>(() => factorySettings("ticket"));
  const [draftName, setDraftName] = useState("Défaut");
  // Aperçu : UN seul format par document (politique opération → format) —
  // htmlA4 (devis, étiquettes), html80 (ticket, ADR-134), sinon text80.
  const [preview, setPreview] = useState<{
    text80: string;
    html80: string;
    htmlA4: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previewTimer = useDebouncedTimer();
  const previewSeq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmAsync = useConfirm();

  const selected_ = templates.find((t) => t.id === selectedId) ?? null;
  const typeTemplates = templates.filter((t) => t.doc_type === docType);
  const activeTemplate = typeTemplates.find((t) => t.is_active === 1) ?? null;

  // Chargement initial + rechargement à chaque changement de type document.
  // (Fix racine P0 : trois useEffect dupliqués appelaient loadTemplates 3×
  // au montage — IPC inutiles ×2. L'effet [docType] couvre le montage aussi.)
  useEffect(() => {
    void loadTemplates();
  }, [docType]);

  async function loadTemplates(keepId?: number | null): Promise<void> {
    // A-07 : états chargement / erreur PERSISTANTS (avant : aucun drapeau de
    // chargement ⇒ les réglages du type PRÉCÉDENT restaient affichés pendant
    // le chargement du nouveau type ; et l'échec ne vivait que 4,5 s dans un
    // toast).
    setLoading(true);
    setError("");
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
      const message = frError(e, "Modèles indisponibles.");
      setError(message);
      setPreviewBusy(false);
      notify(message, "err");
    } finally {
      setLoading(false);
    }
  }

  // Aperçu live (données démo, 500 ms après la dernière modification).
  function schedulePreview(next: TemplateSettings): void {
    const seq = (previewSeq.current += 1);
    setPreviewBusy(true);
    previewTimer.schedule(500, () => {
      void (async () => {
        try {
          const r = (await api.templatePreview({
            docType,
            settings: next,
          })) as { text80?: unknown; html80?: unknown; htmlA4?: unknown };
          if (seq !== previewSeq.current) return;
          setPreview({
            text80: typeof r.text80 === "string" ? r.text80 : "",
            html80: typeof r.html80 === "string" ? r.html80 : "",
            htmlA4: typeof r.htmlA4 === "string" ? r.htmlA4 : "",
          });
        } catch {
          /* l'aperçu suit la prochaine frappe valide */
        } finally {
          if (seq === previewSeq.current) setPreviewBusy(false);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio d'impression"
        module="MODÈLES SQLITE · APERÇU DÉMO · N&B"
        period="Chaque document a son modèle actif — aperçu sur données démo, sans valeur fiscale."
        actions={
          <Badge tone={dirty ? "amber" : "green"}>
            {dirty ? "Modifications non enregistrées" : "Modèle à jour"}
          </Badge>
        }
      />

      <DocTypeTabs
        docType={docType}
        activeTemplate={activeTemplate}
        onChange={(type) => setDocType(type)}
      />

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <TemplateManager
            docType={docType}
            templates={typeTemplates}
            selected={selected_}
            selectedId={selectedId}
            draftName={draftName}
            dirty={dirty}
            loading={loading}
            error={error}
            busy={busy}
            onPick={pick}
            onNameChange={(name) => {
              setDraftName(name);
              setDirty(true);
            }}
            onSave={() => void save()}
            onActivate={() => void activate()}
            onDuplicate={() => void duplicate()}
            onRemove={() => void remove()}
            onReset={() => void resetFactory()}
            onExport={exportJson}
            onImport={() => fileRef.current?.click()}
          />
          <PrinterCard notify={notify} showTestPage />
        </aside>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <TemplateSettingsPanel docType={docType} draft={draft} onEdit={edit} />
          <PreviewPanel
            docType={docType}
            preview={preview}
            previewBusy={previewBusy}
            dirty={dirty}
            busy={busy}
            onTestPrint={() => void testPrint()}
          />
        </div>
      </div>

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
  );
}
