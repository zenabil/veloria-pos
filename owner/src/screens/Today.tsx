// Veloria Owner — Aujourd'hui : synthèse, encaissements, journal du jour.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatMinor,
  formatPercent,
  formatSignedMinor,
  formatTime,
} from "../format.ts";
import type { JournalRow, OwnerSnapshot, SaleKind } from "../store.ts";
import {
  Amount,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  ReadOnlyNote,
  SectionHead,
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
  status?: "ok" | "watch" | "critical";
}): React.JSX.Element {
  const dot =
    props.status === "critical"
      ? COLORS.statusCritical
      : props.status === "watch"
        ? COLORS.statusWatch
        : COLORS.statusOk;
  return (
    <Card style={{ flex: 1, minHeight: 104 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>{props.label}</Text>
        {props.status ? (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
        ) : null}
      </View>
      <Amount text={props.value} size={20} style={{ marginTop: SPACE.sm }} />
      {props.caption ? (
        <Text style={{ ...TYPE.label, color: props.captionTone ?? COLORS.cardMuted, marginTop: 4 }}>
          {props.caption}
        </Text>
      ) : null}
    </Card>
  );
}

function JournalLine(props: { row: JournalRow }): React.JSX.Element {
  const tone = KIND_TONE[props.row.kind];
  return (
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
        text={formatSignedMinor(props.row.amountMinor)}
        size={14}
        tone={
          props.row.kind === "return" || props.row.kind === "expense"
            ? COLORS.criticalText
            : COLORS.cardText
        }
      />
    </View>
  );
}

export function TodayScreen(props: {
  snapshot: OwnerSnapshot;
  refreshing: boolean;
  offline: boolean;
  onRefresh: () => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const day = props.snapshot.day;
  const objectivePct =
    day.objectiveMinor && day.objectiveMinor > 0
      ? Math.round((day.salesMinor / day.objectiveMinor) * 100)
      : null;
  const rows = expanded ? day.journal : day.journal.slice(0, 6);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: SPACE.lg,
        paddingTop: SPACE.lg,
        paddingBottom: SIZES.dockInset + SPACE.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SPACE.md,
          backgroundColor: COLORS.cardBg,
          borderRadius: RADIUS.control,
          borderWidth: 1,
          borderColor: COLORS.border,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          marginBottom: SPACE.md,
        }}
      >
        <Icon name="arrow-down-circle-outline" size={18} color={COLORS.cardMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
            Tirer pour actualiser
          </Text>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
            {props.offline ? "Hors ligne — dernière liasse locale" : "Dernière synchro automatique"}
          </Text>
        </View>
        <Button
          label={props.refreshing ? "…" : "Actualiser"}
          variant="ink"
          icon="refresh"
          busy={props.refreshing}
          onPress={props.onRefresh}
          accessibilityLabel="Actualiser les données"
          style={{ minHeight: 44 }}
        />
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: SPACE.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.8 }}>
            SYNTHÈSE D'ACTIVITÉ
          </Text>
          <Text style={{ ...TYPE.title, color: COLORS.cardText, marginTop: 2 }}>
            {formatDateLongFr(day.date)}
          </Text>
        </View>
      </View>

      <View
        style={{
          backgroundColor: COLORS.headerBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
        }}
      >
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
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
          text={formatMinor(day.salesMinor)}
          size={30}
          tone={COLORS.primary}
          style={{ marginTop: SPACE.sm }}
        />
        {objectivePct !== null && day.objectiveMinor ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACE.md }}>
            <Icon name="checkmark-circle-outline" size={15} color={COLORS.navyMuted} />
            <Text style={{ color: COLORS.navyMuted, ...TYPE.label }}>
              Objectif journalier atteint à {objectivePct} % · {formatMinor(day.objectiveMinor)}{" "}
              fixé
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
        <KpiCard
          label="Tickets"
          value={String(day.salesCount)}
          caption={day.ticketsDelta !== null ? `+${day.ticketsDelta} tickets` : undefined}
          captionTone={COLORS.statusOk}
          status="ok"
        />
        <KpiCard
          label="Panier moyen"
          value={formatMinor(day.basketMinor)}
          caption="+2,1 %"
          captionTone={COLORS.statusOk}
          status="ok"
        />
      </View>
      <View style={{ flexDirection: "row", gap: SPACE.md, marginTop: SPACE.md }}>
        <KpiCard
          label="Marge brute"
          value={formatMinor(day.profitMinor)}
          caption={`${((day.profitMinor / day.salesMinor) * 100).toFixed(1).replace(".", ",")} % du CA`}
          status="ok"
        />
        <KpiCard
          label="Espèces caisse"
          value={formatMinor(day.cashMinor)}
          caption="Session active"
          captionTone={COLORS.statusOk}
          status="ok"
        />
      </View>

      <SectionHead
        title="Encaissements par mode"
        right={
          <Badge
            label="100 % audité"
            color={COLORS.cardMuted}
            dot={false}
            background={COLORS.sunkenBg}
          />
        }
      />
      <Card>
        <View
          style={{ flexDirection: "row", height: 8, borderRadius: RADIUS.pill, overflow: "hidden" }}
        >
          {day.methods.map((m, i) => (
            <View
              key={m.method}
              style={{
                width: `${m.sharePercent}%`,
                backgroundColor: i === 0 ? COLORS.headerBg : i === 1 ? COLORS.primary : "#7D8FA9",
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
              <Amount text={formatMinor(m.totalMinor)} size={13} style={{ marginTop: 4 }} />
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{m.sharePercent} %</Text>
            </View>
          ))}
        </View>
      </Card>

      <SectionHead
        title="Opérations du jour"
        actionLabel={expanded ? undefined : "Tout voir"}
        onPress={() => setExpanded(true)}
        right={<Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{day.salesCount}</Text>}
      />
      <Group>
        {rows.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider inset={SPACE.lg} /> : null}
            <JournalLine row={r} />
          </View>
        ))}
        {!expanded && day.journal.length > rows.length ? (
          <Tap
            onPress={() => setExpanded(true)}
            accessibilityLabel="Afficher tout le journal"
            style={{
              alignItems: "center",
              justifyContent: "center",
              minHeight: 48,
              borderTopWidth: 1,
              borderTopColor: COLORS.divider,
            }}
          >
            <Text style={{ color: COLORS.headerBg, ...TYPE.bodySm, fontWeight: "800" }}>
              Afficher les {day.journal.length - rows.length} opérations restantes
            </Text>
          </Tap>
        ) : null}
      </Group>

      <ReadOnlyNote text="Supervision gestion — lecture seule active" />
    </ScrollView>
  );
}
