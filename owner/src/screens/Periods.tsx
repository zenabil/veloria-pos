// Veloria Owner — Périodes : trois vues courtes (Ventes, Marges, Top).
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatDelta,
  formatMinor,
  formatNumber,
  formatPercent,
} from "../format.ts";
import type { OwnerSnapshot } from "../store.ts";
import {
  Amount,
  Badge,
  BarChart,
  Card,
  Chip,
  ProgressBar,
  ReadOnlyNote,
  Segmented,
} from "../ui/kit.tsx";
import { Icon } from "../ui/Icon.tsx";

const SHORT_DAY = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

type PeriodView = "sales" | "margins" | "top";

export function PeriodsScreen(props: { snapshot: OwnerSnapshot }): React.JSX.Element {
  const [range, setRange] = useState<"7" | "30">("7");
  const [view, setView] = useState<PeriodView>("sales");
  const p = props.snapshot.periods;
  const last = p.days[p.days.length - 1];
  const bars = p.days.map((d) => {
    const date = new Date(d.date);
    return {
      label: SHORT_DAY[date.getDay()] ?? "—",
      sub: String(date.getDate()),
      valueMinor: d.totalMinor,
      highlight: d.date === last?.date,
    };
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted, flex: 1 }}>
          {formatDateLongFr(props.snapshot.day.date)}
        </Text>
        <Chip label="7 j" active={range === "7"} onPress={() => setRange("7")} />
        <Chip label="30 j" active={range === "30"} onPress={() => setRange("30")} />
      </View>

      {range === "30" ? (
        <Card style={{ marginTop: SPACE.md }}>
          <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
            Aucune liasse sur 30 jours n'est encore publiée. Le POS produira cette période dès
            l'activation de la supervision.
          </Text>
        </Card>
      ) : (
        <>
          <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
            <Segmented
              options={[
                { value: "sales", label: "Ventes" },
                { value: "margins", label: "Marges" },
                { value: "top", label: "Top" },
              ]}
              value={view}
              onChange={setView}
            />
          </View>

          {view === "sales" ? (
            <>
              <View
                style={{
                  backgroundColor: COLORS.headerBg,
                  borderRadius: RADIUS.card,
                  padding: SPACE.lg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.primary, ...TYPE.badge, letterSpacing: 0.8 }}>
                    SYNTHÈSE (7 J)
                  </Text>
                  <Text style={{ color: COLORS.headerText, ...TYPE.headline, marginTop: 4 }}>
                    Performance du point de vente
                  </Text>
                </View>
                <Icon name="trending-up-outline" size={26} color={COLORS.primary} />
              </View>

              <Card style={{ marginTop: SPACE.md }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
                    Chiffre d'affaires cumulé
                  </Text>
                  <Badge
                    label={`↗ ${formatDelta(12.4)}`}
                    color={COLORS.statusOk}
                    dot={false}
                    background={COLORS.okTone}
                  />
                </View>
                <Amount text={formatMinor(p.totalMinor)} size={28} style={{ marginTop: 4 }} />
              </Card>

              <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
                <Card tone={COLORS.toneBg} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="receipt-outline" size={15} color={COLORS.cardMuted} />
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Tickets émis</Text>
                  </View>
                  <Text style={{ ...TYPE.title, color: COLORS.cardText, marginTop: 4 }}>
                    {formatNumber(p.tickets)} <Text style={{ ...TYPE.label }}>trans.</Text>
                  </Text>
                </Card>
                <Card tone={COLORS.toneBg} style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="basket-outline" size={15} color={COLORS.cardMuted} />
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Panier moyen</Text>
                  </View>
                  <Amount text={formatMinor(p.basketMinor)} size={17} style={{ marginTop: 4 }} />
                </Card>
              </View>

              <Card style={{ marginTop: SPACE.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>
                    Ventes par jour
                  </Text>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Milliers DZD</Text>
                </View>
                <View style={{ marginTop: SPACE.lg }}>
                  <BarChart bars={bars} />
                </View>
                {last ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SPACE.sm,
                      backgroundColor: COLORS.toneBg,
                      borderRadius: RADIUS.inner,
                      paddingHorizontal: SPACE.md,
                      paddingVertical: SPACE.sm,
                      marginTop: SPACE.md,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: COLORS.primary,
                      }}
                    />
                    <Text style={{ ...TYPE.label, color: COLORS.cardText, flex: 1 }}>
                      Aujourd'hui ({formatDateShortFr(last.date)})
                    </Text>
                    <Amount text={formatMinor(last.totalMinor)} size={13} />
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}

          {view === "margins" ? (
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="pie-chart-outline" size={17} color={COLORS.cardText} />
                    <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>
                      Marge par catégorie
                    </Text>
                  </View>
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: 2 }}>
                    Contribution brute aux bénéfices
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Amount text={formatMinor(p.marginTotalMinor)} size={16} />
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                    Marge moy. {formatPercent(p.marginPercent)}
                  </Text>
                </View>
              </View>

              <View style={{ gap: SPACE.lg, marginTop: SPACE.lg }}>
                {p.categories.map((c) => (
                  <View key={c.name}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: SPACE.sm,
                      }}
                    >
                      <Text
                        style={{ ...TYPE.bodySm, color: COLORS.cardText, flex: 1 }}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Amount text={formatMinor(c.salesMinor)} size={13} />
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar percent={c.sharePercent} color={COLORS.headerBg} height={7} />
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginTop: 4,
                      }}
                    >
                      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                        {c.sharePercent} % du volume
                      </Text>
                      <Text style={{ ...TYPE.label, color: COLORS.statusOk, fontWeight: "700" }}>
                        Taux : {c.marginPercent} %
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {view === "top" ? (
            <Card padded={false}>
              {p.top.map((t, i) => (
                <View
                  key={t.name}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACE.md,
                    paddingHorizontal: SPACE.lg,
                    paddingVertical: SPACE.md,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: COLORS.divider,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: i === 0 ? COLORS.primary : COLORS.sunkenBg,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "800",
                        fontSize: 12,
                        color: i === 0 ? COLORS.primaryText : COLORS.cardMuted,
                      }}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}
                      numberOfLines={1}
                    >
                      {t.name}
                    </Text>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                      {t.qty} articles écoulés
                    </Text>
                  </View>
                  <Amount text={formatMinor(t.totalMinor)} size={14} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}

      <ReadOnlyNote text="Mode consultation sécurisée — Données comptables certifiées synchronisées Veloria POS" />
    </ScrollView>
  );
}
