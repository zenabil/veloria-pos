// Veloria Owner — Aujourd'hui : deux vues courtes, Synthèse et Opérations.

import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatMinorSafe,
  formatPercent,
  formatSignedMinorSafe,
  formatTime,
} from "../format.ts";
import type { JournalRow, OwnerSnapshot, SaleKind } from "../store.ts";
import {
  Amount,
  Badge,
  Card,
  Chip,
  Divider,
  Group,
  ProgressBar,
  ReadOnlyNote,
  SectionHead,
  Segmented,
  Tap,
} from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";

const KIND_LABEL: Record<SaleKind, string> = {
  sale: "Vente",
  return: "Retour",
  payment: "Versement",
  expense: "Dépense",
};

const KIND_TONE: Record<SaleKind, { bg: string; fg: string }> = {
  sale: { bg: COLORS.toneBg, fg: COLORS.cardText },
  return: { bg: COLORS.watchTone, fg: COLORS.statusWatch },
  expense: { bg: COLORS.criticalTone, fg: COLORS.criticalText },
  payment: { bg: COLORS.sunkenBg, fg: COLORS.cardMuted },
};

function KpiCard(props: {
  label: string;
  value: string;
  caption?: string;
  captionTone?: string;
}): React.JSX.Element {
  return (
    <Card style={{ flex: 1, minHeight: 96 }}>
      <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>{props.label}</Text>
      <Amount text={props.value} size={20} style={{ marginTop: SPACE.sm }} />
      {props.caption ? (
        <Text style={{ ...TYPE.label, color: props.captionTone ?? COLORS.cardMuted, marginTop: 4 }}>
          {props.caption}
        </Text>
      ) : null}
    </Card>
  );
}

function JournalLine(props: { row: JournalRow; onPress: () => void }): React.JSX.Element {
  const tone = KIND_TONE[props.row.kind];
  return (
    <Tap onPress={props.onPress} accessibilityLabel={`Détails ${props.row.ref}`}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.md,
          paddingHorizontal: SPACE.lg,
          paddingVertical: SPACE.md,
          minHeight: 58,
        }}
      >
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted, width: 40 }}>
          {formatTime(props.row.at)}
        </Text>
        <View
          style={{
            backgroundColor: tone.bg,
            borderRadius: RADIUS.inner,
            paddingHorizontal: 7,
            paddingVertical: 2,
          }}
        >
          <Text style={{ ...TYPE.badge, color: tone.fg }}>{KIND_LABEL[props.row.kind]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}
            numberOfLines={1}
          >
            {props.row.ref}
          </Text>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }} numberOfLines={1}>
            {props.row.detail}
          </Text>
        </View>
        <Amount
          text={formatSignedMinorSafe(props.row.amountMinor)}
          size={14}
          tone={
            props.row.kind === "return" || props.row.kind === "expense"
              ? COLORS.criticalText
              : COLORS.cardText
          }
        />
        <Icon name="chevron-forward" size={16} color={COLORS.cardMuted} />
      </View>
    </Tap>
  );
}

export function TodayScreen(props: {
  snapshot: OwnerSnapshot;
  view: "summary" | "journal";
  onView: (v: "summary" | "journal") => void;
  kindFilter: "all" | SaleKind;
  onKindFilter: (v: "all" | SaleKind) => void;
  onOpenTransaction: (id: string) => void;
}): React.JSX.Element {
  const { view, kindFilter } = props;
  const day = props.snapshot.day;
  const journalRows =
    kindFilter === "all" ? day.journal : day.journal.filter((r) => r.kind === kindFilter);
  const objectivePct =
    day.objectiveMinor && day.objectiveMinor > 0
      ? Math.round((day.salesMinor / day.objectiveMinor) * 100)
      : null;
  // Marge / CA : division GARDÉE. Avant la première vente du jour, `salesMinor`
  // vaut 0 → `0/0` rendait « NaN % » (et un CA nul avec marge « Infinity % »).
  // Même convention que `Periods` / `Money` / `ProductDetail` : 0 quand le
  // dénominateur est nul, jamais un tiers comportement.
  const marginSharePercent =
    day.salesMinor > 0
      ? ((day.profitMinor / day.salesMinor) * 100).toFixed(1).replace(".", ",")
      : "0,0";

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.lg,
        paddingBottom: SIZES.dockInset + SPACE.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ ...TYPE.title, color: COLORS.cardText }}>{formatDateLongFr(day.date)}</Text>

      <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
        <Segmented
          options={[
            { value: "summary", label: "Synthèse" },
            { value: "journal", label: `Opérations (${day.journal.length})` },
          ]}
          value={view}
          onChange={props.onView}
        />
      </View>

      {view === "summary" ? (
        <>
          <View
            style={{
              backgroundColor: COLORS.headerBg,
              borderRadius: RADIUS.card,
              padding: SPACE.lg,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.navyMuted, ...TYPE.badge, letterSpacing: 0.8 }}>
                CHIFFRE D'AFFAIRES NET
              </Text>
              <Badge
                label={`${day.comparison.deltaPercent >= 0 ? "↑" : "↓"} ${formatPercent(Math.abs(day.comparison.deltaPercent))} vs ${day.comparison.previousLabel}`}
                color={day.comparison.deltaPercent >= 0 ? "#4ADEA3" : "#FF9B9B"}
                dot={false}
              />
            </View>
            <Amount
              text={formatMinorSafe(day.salesMinor)}
              size={30}
              tone={COLORS.primary}
              style={{ marginTop: SPACE.sm }}
            />
            {objectivePct !== null && day.objectiveMinor ? (
              <View style={{ marginTop: SPACE.md, gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="checkmark-circle-outline" size={15} color={COLORS.navyMuted} />
                  <Text style={{ color: COLORS.navyMuted, ...TYPE.label, flex: 1 }}>
                    Objectif atteint à {objectivePct} % · {formatMinorSafe(day.objectiveMinor)} fixé
                  </Text>
                </View>
                <ProgressBar
                  percent={objectivePct}
                  color={COLORS.primary}
                  track={COLORS.navyLine}
                  height={6}
                />
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
            <KpiCard
              label="Tickets"
              value={String(day.salesCount)}
              caption={day.ticketsDelta !== null ? `+${day.ticketsDelta} tickets` : undefined}
              captionTone={COLORS.statusOk}
            />
            <KpiCard label="Panier moyen" value={formatMinorSafe(day.basketMinor)} />
          </View>
          <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
            <KpiCard
              label="Marge brute"
              value={formatMinorSafe(day.profitMinor)}
              caption={`${marginSharePercent} % du CA`}
            />
            <KpiCard
              label="Espèces caisse"
              value={formatMinorSafe(day.cashMinor)}
              caption="Session active"
              captionTone={COLORS.statusOk}
            />
          </View>

          <SectionHead title="Encaissements par mode" />
          <Card>
            {day.methods.length === 0 ? (
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
                Aucun encaissement publié pour cette journée.
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                height: 8,
                borderRadius: RADIUS.pill,
                overflow: "hidden",
              }}
            >
              {day.methods.map((m, i) => (
                <View
                  key={m.method}
                  style={{
                    width: `${m.sharePercent}%`,
                    backgroundColor:
                      i === 0 ? COLORS.headerBg : i === 1 ? COLORS.primary : "#7D8FA9",
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: SPACE.lg, marginTop: SPACE.lg }}>
              {day.methods.map((m) => (
                <View key={m.method} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor:
                          m.method === "cash"
                            ? COLORS.headerBg
                            : m.method === "card"
                              ? COLORS.primary
                              : "#7D8FA9",
                      }}
                    />
                    <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                      {m.label}
                    </Text>
                  </View>
                  <Amount text={formatMinorSafe(m.totalMinor)} size={13} style={{ marginTop: 4 }} />
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{m.sharePercent} %</Text>
                </View>
              ))}
            </View>
          </Card>

          {day.returnsCount > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: SPACE.sm,
                backgroundColor: COLORS.watchTone,
                borderRadius: RADIUS.control,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                marginTop: SPACE.md,
              }}
            >
              <Icon name="return-down-back-outline" size={16} color={COLORS.statusWatch} />
              <Text style={{ ...TYPE.label, color: COLORS.statusWatch, flex: 1 }}>
                {day.returnsCount} retour{day.returnsCount > 1 ? "s" : ""} sur la journée
              </Text>
              <Amount
                text={formatMinorSafe(-day.returnsMinor)}
                size={12}
                tone={COLORS.statusWatch}
              />
            </View>
          ) : null}

          <ReadOnlyNote text="Supervision gestion — lecture seule active" />
        </>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: SPACE.sm, marginBottom: SPACE.md }}
          >
            <Chip
              label="Toutes"
              count={day.journal.length}
              active={kindFilter === "all"}
              onPress={() => props.onKindFilter("all")}
            />
            {(["sale", "return", "payment", "expense"] as SaleKind[]).map((k) => {
              const count = day.journal.filter((r) => r.kind === k).length;
              if (count === 0) return null;
              return (
                <Chip
                  key={k}
                  label={KIND_LABEL[k]}
                  count={count}
                  active={kindFilter === k}
                  onPress={() => props.onKindFilter(k)}
                />
              );
            })}
          </ScrollView>
          <Group>
            {journalRows.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <JournalLine row={r} onPress={() => props.onOpenTransaction(r.id)} />
              </View>
            ))}
          </Group>
          {journalRows.length === 0 ? (
            <Card style={{ marginTop: SPACE.md }}>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
                Aucune opération pour ce filtre.
              </Text>
            </Card>
          ) : null}
          <ReadOnlyNote text="Journal du jour — lecture seule, aucune correction possible" />
        </>
      )}
    </ScrollView>
  );
}
