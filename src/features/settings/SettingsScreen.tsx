// Veloria PoS — Écran : Paramètres (7 rubriques, recherche et navigation rapide).
import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Building2,
  ChevronRight,
  FileText,
  HardDrive,
  Search,
  ShieldCheck,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Card, Kbd, PageHeader, SearchField, cn } from "@shared/ui/primitives.tsx";
import {
  SETTINGS_NAV_GROUPS,
  SETTINGS_SECTIONS,
  searchSettings,
  settingsCardsForSection,
  type SettingsCardMeta,
  type SettingsIconKey,
  type SettingsSectionId,
  type SettingsSectionMeta,
} from "./types.ts";
import {
  AnnouncementSection,
  CompanySection,
  CustomersSection,
  ProductsSection,
  SalesSection,
} from "./SettingsSectionsA.tsx";
import {
  AboutSection,
  BackupSection,
  ClientSyncSection,
  DatabaseSection,
  InvoiceSection,
  SecuritySection,
  ZakatSettingsSection,
} from "./SettingsSectionsB.tsx";
import { PrinterCard } from "@shared/printer/PrinterCard.tsx";
import { UsersAdmin } from "@features/staff/UsersAdmin.tsx";
import { ChangeCodeCard } from "@features/staff/ChangeCodeCard.tsx";
import { useStaff } from "@features/staff/use-staff.ts";

import type { Notify } from "@shared/ui/primitives.tsx";

const SECTION_ICONS: Record<SettingsIconKey, LucideIcon> = {
  company: Building2,
  commerce: Store,
  catalogue: Boxes,
  documents: FileText,
  data: HardDrive,
  team: Users,
  system: ShieldCheck,
};

function sectionMeta(id: SettingsSectionId): SettingsSectionMeta {
  const meta = SETTINGS_SECTIONS.find((s) => s.id === id);
  if (!meta) throw new Error(`Rubrique inconnue : ${id}`);
  return meta;
}

/** Ancre stable : la recherche et les raccourcis internes y défilent. */
function CardAnchor({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div id={`settings-card-${id}`} data-settings-card={id} className="scroll-mt-32">
      {children}
    </div>
  );
}

export function SettingsScreen({ notify }: { notify: Notify }): React.JSX.Element {
  const [section, setSection] = useState<SettingsSectionId>("company");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { isManager, hasPermission, refresh: refreshStaff } = useStaff(notify);

  const current = sectionMeta(section);
  const CurrentIcon = SECTION_ICONS[current.icon];
  const cards = settingsCardsForSection(section);
  const hits = searchSettings(query, 8);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goTo(nextSection: SettingsSectionId, cardId?: string): void {
    setSection(nextSection);
    setActiveCard(cardId ?? null);
    setQuery("");
    if (cardId != null) {
      window.setTimeout(() => {
        document
          .getElementById(`settings-card-${cardId}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 80);
    } else {
      contentRef.current?.scrollTo({ top: 0 });
    }
  }

  function onSelectSection(id: SettingsSectionId): void {
    setSection(id);
    setActiveCard(null);
    setQuery("");
    contentRef.current?.scrollTo({ top: 0 });
  }

  function jumpToCard(card: SettingsCardMeta): void {
    setActiveCard(card.id);
    window.setTimeout(() => {
      document
        .getElementById(`settings-card-${card.id}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 30);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Paramètres"
        module="Poste de travail · configuration locale"
        period="Réglages explicites, appliqués immédiatement à la base SQLite locale."
      />
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[290px_1fr]">
        <Card className="max-h-80 overflow-auto p-2 xl:max-h-none">
          <div className="sticky top-0 z-10 space-y-2 bg-[#122131] pb-2">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Rechercher un réglage…"
              ariaLabel="Rechercher dans les paramètres"
              inputRef={searchRef}
              inputClassName="pl-10 pr-16"
              trailing={
                query.trim() === "" ? (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                    <Kbd>Ctrl K</Kbd>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Effacer la recherche"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )
              }
            />
            {query.trim() !== "" ? (
              <div className="rounded-xl border border-white/10 bg-black/25 p-1.5">
                {hits.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-slate-500">
                    Aucun réglage ne correspond à « {query.trim()} ».
                  </p>
                ) : (
                  <ul aria-label="Résultats de recherche" className="space-y-0.5">
                    {hits.map((hit) => (
                      <li key={`${hit.kind}-${hit.id}`}>
                        <button
                          type="button"
                          onClick={() =>
                            goTo(hit.section, hit.kind === "card" ? hit.id : undefined)
                          }
                          className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-amber-400/10"
                        >
                          <Search
                            size={13}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-amber-300"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-bold text-slate-200">
                              {hit.title}
                            </span>
                            <span className="block text-[11px] leading-snug text-slate-500">
                              {hit.kind === "section"
                                ? "Rubrique"
                                : sectionMeta(hit.section).shortLabel}{" "}
                              · {hit.description}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <ul aria-label="Rubriques paramètres" className="mt-1 space-y-2">
            {SETTINGS_NAV_GROUPS.map((group) => (
              <li key={group.label} className="list-none">
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((id) => {
                    const meta = sectionMeta(id);
                    const Icon = SECTION_ICONS[meta.icon];
                    const selected = section === id;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          aria-current={selected ? "page" : undefined}
                          aria-label={meta.label}
                          onClick={() => onSelectSection(id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                            selected
                              ? "bg-amber-400/15 text-amber-100"
                              : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              selected
                                ? "bg-amber-400/20 text-amber-200"
                                : "bg-white/[0.05] text-slate-400",
                            )}
                          >
                            <Icon size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block text-sm",
                                selected ? "font-bold" : "font-semibold",
                              )}
                            >
                              {meta.shortLabel}
                            </span>
                            <span className="block truncate text-[11px] font-normal text-slate-500">
                              {meta.description}
                            </span>
                          </span>
                          <ChevronRight
                            size={14}
                            aria-hidden="true"
                            className={cn(
                              "shrink-0 transition-transform",
                              selected ? "text-amber-300" : "text-slate-600",
                            )}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <div ref={contentRef} className="min-h-0 overflow-auto rounded-xl">
          <div className="sticky top-0 z-20 border-b border-white/10 bg-[#0b1a2b]/95 px-1 pb-2 pt-1 backdrop-blur">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300"
              >
                <CurrentIcon size={20} />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight text-white">
                  {current.shortLabel}
                </h2>
                <p className="text-xs text-slate-500">{current.description}</p>
              </div>
              <span className="ml-auto hidden shrink-0 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-slate-400 sm:block">
                {cards.length} bloc{cards.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => jumpToCard(card)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    activeCard === card.id
                      ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
                      : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white",
                  )}
                >
                  {card.title}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4">
            {section === "company" ? (
              <CardAnchor id="company">
                <CompanySection notify={notify} />
              </CardAnchor>
            ) : null}
            {section === "commerce" ? (
              <>
                <CardAnchor id="sales">
                  <SalesSection notify={notify} />
                </CardAnchor>
                <CardAnchor id="customers">
                  <CustomersSection notify={notify} goSales={() => setSection("commerce")} />
                </CardAnchor>
                <CardAnchor id="announcement">
                  <AnnouncementSection notify={notify} />
                </CardAnchor>
              </>
            ) : null}
            {section === "catalogue" ? (
              <CardAnchor id="products">
                <ProductsSection notify={notify} />
              </CardAnchor>
            ) : null}
            {section === "documents" ? (
              <>
                <CardAnchor id="invoice">
                  <InvoiceSection notify={notify} />
                </CardAnchor>
                <CardAnchor id="printer">
                  <PrinterCard notify={notify} showSilent showHardwareTest showTestPage />
                </CardAnchor>
                <CardAnchor id="zakat">
                  <ZakatSettingsSection notify={notify} />
                </CardAnchor>
              </>
            ) : null}
            {section === "data" ? (
              <>
                <CardAnchor id="backup">
                  <BackupSection notify={notify} />
                </CardAnchor>
                <CardAnchor id="database">
                  <DatabaseSection notify={notify} />
                </CardAnchor>
                <CardAnchor id="sync">
                  <ClientSyncSection notify={notify} />
                </CardAnchor>
              </>
            ) : null}
            {section === "team" ? (
              <>
                <CardAnchor id="team-code">
                  <ChangeCodeCard notify={notify} forced={false} onChanged={() => refreshStaff()} />
                </CardAnchor>
                <CardAnchor id="team-users">
                  <UsersAdmin
                    notify={notify}
                    isManager={isManager}
                    canManageUsers={isManager || hasPermission("users")}
                  />
                </CardAnchor>
              </>
            ) : null}
            {section === "system" ? (
              <>
                <CardAnchor id="security">
                  <SecuritySection notify={notify} />
                </CardAnchor>
                <CardAnchor id="about">
                  <AboutSection notify={notify} />
                </CardAnchor>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
