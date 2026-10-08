// Veloria PoS — Écran : Paramètres (6 rubriques unifiées, navigation latérale).
import { useState } from "react";
import { Card, PageHeader, cn } from "@shared/ui/primitives.tsx";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "./types.ts";
import {
  CompanySection,
  CustomersSection,
  ProductsSection,
  SalesSection,
  SoundSection,
  StockSection,
  SuppliersSection,
} from "./SettingsSectionsA.tsx";
import {
  AboutSection,
  BackupSection,
  ClientSyncSection,
  DatabaseSection,
  InvoiceSection,
  PrintingSection,
  SecuritySection,
  ZakatSettingsSection,
} from "./SettingsSectionsB.tsx";

import type { Notify } from "@shared/ui/primitives.tsx";

export function SettingsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [section, setSection] = useState<SettingsSectionId>("company");

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Paramètres système et matériel POS"
        module="MODULE 16 · POSTE DE TRAVAIL & SYSTÈME SÉCURISÉ"
        period="SQLite WAL Local · Exercice 2025 · ESC/POS, RJ11, RS-232 · Réglages explicites, appliqués immédiatement (base locale)."
      />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[260px_1fr]">
        <Card className="max-h-64 overflow-auto p-2 xl:max-h-none">
          <ul className="space-y-0.5" aria-label="Rubriques paramètres">
            {SETTINGS_SECTIONS.map((s) => {
              const selected = s.id === section;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    onClick={() => setSection(s.id)}
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-amber-400/15 font-bold text-amber-200"
                        : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
        <div className="min-h-0 space-y-4 overflow-auto">
          {section === "company" ? <CompanySection notify={notify} /> : null}
          {section === "commerce" ? (
            <>
              <SalesSection notify={notify} />
              <SoundSection notify={notify} />
              <CustomersSection notify={notify} goSales={() => setSection("commerce")} />
              <SuppliersSection notify={notify} />
            </>
          ) : null}
          {section === "catalogue" ? (
            <>
              <ProductsSection notify={notify} />
              <StockSection notify={notify} />
            </>
          ) : null}
          {section === "documents" ? (
            <>
              <InvoiceSection notify={notify} />
              <PrintingSection notify={notify} />
              <ZakatSettingsSection notify={notify} />
            </>
          ) : null}
          {section === "data" ? (
            <>
              <BackupSection notify={notify} />
              <DatabaseSection notify={notify} />
              <ClientSyncSection notify={notify} />
            </>
          ) : null}
          {section === "system" ? (
            <>
              <SecuritySection notify={notify} />
              <AboutSection notify={notify} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
