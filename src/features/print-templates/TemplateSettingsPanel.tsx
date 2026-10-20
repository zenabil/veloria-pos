// Veloria PoS — Studio d'impression : réglages d'un modèle pilotés par les
// CAPACITÉS du type de document (`src/domain/print/template-capabilities.ts`).
// Seuls les réglages qui ont un sens pour CE document sont affichés — et ils
// prennent effet à l'impression (thermique 58/80 mm, A4 devis uniquement,
// gabarits étiquettes). Un réglage masqué serait de toute façon neutralisé
// à la fusion : la matrice est la source de vérité, pas l'écran.
import {
  applicableSettings,
  type TemplateSettingKey,
} from "@domain/print/template-capabilities.ts";
import {
  allowedPapers,
  type TemplateDocType,
  type TemplateSettings,
} from "@domain/print/template-rules.ts";
import { Card, Field, Select, TextInput } from "@shared/ui/primitives.tsx";

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm"
      title={hint}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-slate-200">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-500">
            {hint}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="h-4 w-4 shrink-0 accent-amber-400"
      />
    </label>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

export function TemplateSettingsPanel({
  docType,
  draft,
  onEdit,
}: {
  docType: TemplateDocType;
  draft: TemplateSettings;
  onEdit: (patch: Partial<TemplateSettings>) => void;
}): React.JSX.Element {
  const caps = applicableSettings(docType);
  const has = (key: TemplateSettingKey): boolean => caps.includes(key);
  const set = (patch: Partial<TemplateSettings>): void => onEdit(patch);
  const thermal = has("thermalFontPx");
  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="text-[15px] font-bold text-[#ffe1a7]">Réglages du modèle</div>
        <p className="mt-1 text-xs text-slate-500">
          Seuls les réglages utiles à ce document sont affichés — ils s'appliquent réellement à
          l'aperçu, à l'impression test et aux impressions.
        </p>
      </div>

      <Group title="Papier & exemplaires">
        <Field
          label="Papier / format"
          {...(docType === "proforma" ? { hint: "Le devis sort en A4 uniquement." } : {})}
        >
          <Select
            value={draft.paper}
            onChange={(e) => set({ paper: e.target.value as TemplateSettings["paper"] })}
            aria-label="Papier"
          >
            {allowedPapers(docType).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label="Exemplaires">
            <Select
              value={draft.copies}
              onChange={(e) => set({ copies: Number(e.target.value) })}
              aria-label="Exemplaires"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          {has("marginMm") ? (
            <Field label="Marges (mm)">
              <Select
                value={draft.marginMm}
                onChange={(e) => set({ marginMm: Number(e.target.value) })}
                aria-label="Marges"
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {has("thermalFontPx") ? (
            <Field label="Police (px)" hint="Texte du ticket (9–14 px).">
              <Select
                value={draft.thermalFontPx}
                onChange={(e) => set({ thermalFontPx: Number(e.target.value) })}
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
        </div>
      </Group>

      {has("showLogo") || has("showIdentity") || has("headerText") ? (
        <Group title="En-tête & identité">
          {has("logoSize") ? (
            <Field label="Taille du logo" hint="S'applique au logo imprimé (noir & blanc).">
              <Select
                value={draft.logoSize}
                onChange={(e) => set({ logoSize: e.target.value as TemplateSettings["logoSize"] })}
                aria-label="Taille du logo"
              >
                <option value="S">Petit</option>
                <option value="M">Moyen</option>
                <option value="L">Grand</option>
              </Select>
            </Field>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {has("showLogo") ? (
              <Toggle
                label="Logo entreprise"
                hint="Tête du document — noir & blanc."
                value={draft.showLogo}
                onChange={(v) => set({ showLogo: v })}
              />
            ) : null}
            {has("showIdentity") ? (
              <Toggle
                label="RC / NIF / NIS"
                hint="Mentions légales sous l'en-tête."
                value={draft.showIdentity}
                onChange={(v) => set({ showIdentity: v })}
              />
            ) : null}
          </div>
          {has("headerText") ? (
            <Field label="Note d'en-tête" hint="Sous le cartouche, centrée.">
              <TextInput
                value={draft.headerText}
                onChange={(e) => set({ headerText: e.target.value })}
                aria-label="Note d'en-tête"
                maxLength={200}
                placeholder="Ex. PROMO — paiement espèces uniquement"
              />
            </Field>
          ) : null}
        </Group>
      ) : null}

      {has("showTva") || has("showPrice") || has("showDiscountZero") ? (
        <Group title="Montants">
          <div className="grid gap-2 sm:grid-cols-2">
            {has("showTva") ? (
              <Toggle
                label="TVA"
                hint="Lignes HT / TVA selon le taux configuré."
                value={draft.showTva}
                onChange={(v) => set({ showTva: v })}
              />
            ) : null}
            {has("showPrice") ? (
              <Toggle
                label="Prix affichés"
                hint={
                  docType === "etiquette"
                    ? "Prix imprimé sur l'étiquette."
                    : "Désactivé : quantités seules, sans montants."
                }
                value={draft.showPrice}
                onChange={(v) => set({ showPrice: v })}
              />
            ) : null}
            {has("showDiscountZero") ? (
              <Toggle
                label="Lignes à zéro"
                hint="Afficher la remise même nulle."
                value={draft.showDiscountZero}
                onChange={(v) => set({ showDiscountZero: v })}
              />
            ) : null}
          </div>
        </Group>
      ) : null}

      {has("showQr") || has("showCodes") || has("showProductName") ? (
        <Group title="Codes & étiquettes">
          <div className="grid gap-2 sm:grid-cols-2">
            {has("showQr") ? (
              <Toggle
                label="QR"
                hint={
                  docType === "etiquette"
                    ? "QR du code-barres sur l'étiquette."
                    : "QR du document en pied de ticket."
                }
                value={draft.showQr}
                onChange={(v) => set({ showQr: v })}
              />
            ) : null}
            {has("showCodes") ? (
              <Toggle
                label="Code-barres"
                hint="Code 39 du numéro de document."
                value={draft.showCodes}
                onChange={(v) => set({ showCodes: v })}
              />
            ) : null}
            {has("showProductName") ? (
              <Toggle
                label="Nom du produit"
                hint="Opt-in : les petits gabarits n'ont pas toujours la place."
                value={draft.showProductName}
                onChange={(v) => set({ showProductName: v })}
              />
            ) : null}
          </div>
        </Group>
      ) : null}

      {has("showSignatures") || has("showWatermark") || has("footerText") ? (
        <Group title="Signatures & mentions">
          <div className="grid gap-2 sm:grid-cols-2">
            {has("showSignatures") ? (
              <Toggle
                label="Signatures"
                hint="Lignes de signature en pied (livreur, client…)."
                value={draft.showSignatures}
                onChange={(v) => set({ showSignatures: v })}
              />
            ) : null}
            {has("showWatermark") ? (
              <Toggle
                label="Filigrane"
                hint="Bandeau encadré — pas de transparence sur rouleau."
                value={draft.showWatermark}
                onChange={(v) => set({ showWatermark: v })}
              />
            ) : null}
          </div>
          {has("watermarkText") && draft.showWatermark ? (
            <Field label="Texte du filigrane">
              <TextInput
                value={draft.watermarkText}
                onChange={(e) => set({ watermarkText: e.target.value })}
                aria-label="Filigrane"
                maxLength={60}
                placeholder="Ex. DUPLICATA"
              />
            </Field>
          ) : null}
          {has("footerText") ? (
            <Field
              label="Pied de page du modèle"
              hint={
                thermal
                  ? "Imprimé en pied du document — vide = aucun pied."
                  : "Vide = pied des paramètres."
              }
            >
              <TextInput
                value={draft.footerText}
                onChange={(e) => set({ footerText: e.target.value })}
                aria-label="Pied de page"
                maxLength={300}
              />
            </Field>
          ) : null}
        </Group>
      ) : null}

      <p className="text-xs text-slate-500">
        N&B strict (imprimantes thermiques). Couleurs et polices verrouillées par conception —
        lisibilité fiscale garantie.
      </p>
    </Card>
  );
}
