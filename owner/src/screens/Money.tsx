// Veloria Owner — Argent : caisse, dépenses, créances (ancres segmentées).
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatMinor,
  formatTime,
  freshnessLabel,
} from "../format.ts";
import type { CashSession, ExpenseRow, OwnerSnapshot } from "../store.ts";
import {
  Amount,
  Badge,
  Card,
  Divider,
  Group,
  IconBubble,
  ReadOnlyNote,
  SectionHead,
  Segmented,
  Tap,
} from "../ui/kit.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";

type Anchor = "cash" | "expenses" | "debts";

function varianceTone(v: number | null): string {
  if (v === null || v === 0) return COLORS.statusOk;
  return v < 0 ? COLORS.statusCritical : COLORS.statusWatch;
}

function varianceLabel(v: number | null): string {
  if (v === null || v === 0) return "Écart nul";
  return v < 0 ? "Manquant" : "Surplus";
}

function varianceText(v: number | null): string {
  if (v === null) return "—";
  return v > 0 ? `+${formatMinor(v)}` : formatMinor(v);
}

function expenseIcon(category: string): IconName {
  if (category === "Logistique") return "car-outline";
  if (category === "Fournitures") return "print-outline";
  return "receipt-outline";
}

function ClosedSessionRow(props: { s: CashSession }): React.JSX.Element {
  const s = props.s;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: SPACE.md,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.md,
        minHeight: 64,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: varianceTone(s.varianceMinor),
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
          {formatDateShortFr(s.openedAt)}
        </Text>
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
          {formatTime(s.openedAt)} – {s.closedAt ? formatTime(s.closedAt) : "—"} · {s.operator}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Amount
          text={varianceText(s.varianceMinor)}
          size={14}
          tone={varianceTone(s.varianceMinor)}
        />
        <Text style={{ ...TYPE.label, color: varianceTone(s.varianceMinor) }}>
          {varianceLabel(s.varianceMinor)}
        </Text>
      </View>
    </View>
  );
}

function ExpenseLine(props: { row: ExpenseRow }): React.JSX.Element {
  return (
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
        paddingVertical: SPACE.md,
        marginTop: SPACE.sm,
      }}
    >
      <IconBubble icon={expenseIcon(props.row.category)} color={COLORS.cardMuted} size={34} />
      <View style={{ flex: 1 }}>
        <Text
          style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}
          numberOfLines={1}
        >
          {props.row.label}
        </Text>
        <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
          {formatDateShortFr(props.row.at)} · {props.row.category}
        </Text>
      </View>
      <Amount text={formatMinor(-props.row.amountMinor)} size={14} tone={COLORS.criticalText} />
    </View>
  );
}

export function MoneyScreen(props: {
  snapshot: OwnerSnapshot;
  onOpenCashAudit: () => void;
  onOpenDebtor: (id: string) => void;
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<Anchor>("cash");
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<Anchor, number>>({ cash: 0, expenses: 0, debts: 0 });
  const money = props.snapshot.money;
  const session = money.activeSession;
  const debts = money.debts;

  function jump(next: Anchor): void {
    setAnchor(next);
    scrollRef.current?.scrollTo({ y: Math.max(0, offsets.current[next] - 8), animated: true });
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          backgroundColor: COLORS.headerBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
          marginBottom: SPACE.md,
        }}
      >
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View>
            <Text style={{ color: COLORS.headerText, ...TYPE.title }}>Argent</Text>
            <Text style={{ color: COLORS.navyMuted, ...TYPE.label, marginTop: 2 }}>
              {formatDateLongFr(props.snapshot.day.date)}
            </Text>
          </View>
          <FreshnessChip label={freshnessLabel(props.snapshot.generatedAt)} />
        </View>
      </View>

      <Segmented
        options={[
          { value: "cash", label: "Caisse" },
          { value: "expenses", label: "Dépenses" },
          { value: "debts", label: "Dettes" },
        ]}
        value={anchor}
        onChange={jump}
      />

      <View onLayout={(e) => (offsets.current.cash = e.nativeEvent.layout.y)}>
        <SectionHead
          title="Session active"
          right={
            <Badge label="En direct" color={COLORS.statusWatch} background={COLORS.watchTone} />
          }
        />
        {session ? (
          <Card>
            <Text style={{ ...TYPE.headline, color: COLORS.cardText }}>{session.label}</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                paddingHorizontal: SPACE.md,
                paddingVertical: SPACE.sm,
                marginTop: SPACE.md,
                gap: SPACE.sm,
              }}
            >
              <Icon name="person-outline" size={15} color={COLORS.cardMuted} />
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, flex: 1 }}>
                Ouverte depuis {formatTime(session.openedAt)} · {session.operator}
              </Text>
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{session.post}</Text>
            </View>

            <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md }}>
              {[
                { label: "Attendu", value: session.expectedMinor, tone: COLORS.cardText },
                { label: "Compté", value: session.countedMinor, tone: COLORS.cardText },
                {
                  label: "Écart brut",
                  value: session.varianceMinor,
                  tone: varianceTone(session.varianceMinor),
                },
              ].map((tile) => (
                <View
                  key={tile.label}
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.toneBg,
                    borderRadius: RADIUS.inner,
                    padding: SPACE.md,
                  }}
                >
                  <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{tile.label}</Text>
                  <Amount
                    text={tile.value === null ? "—" : formatMinor(tile.value)}
                    size={13}
                    tone={tile.tone}
                    style={{ marginTop: 4 }}
                  />
                </View>
              ))}
            </View>

            {session.note ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACE.md }}
              >
                <Icon name="time-outline" size={14} color={COLORS.cardMuted} />
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted, flex: 1 }}>
                  {session.note}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card>
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>
              Aucune session de caisse ouverte.
            </Text>
          </Card>
        )}

        <SectionHead
          title="Sessions clôturées récentes"
          actionLabel="Audit des caisses"
          onPress={props.onOpenCashAudit}
          right={
            <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
              {money.sessions.length} dernières
            </Text>
          }
        />
        <Group>
          {money.sessions.map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider inset={SPACE.lg} /> : null}
              <ClosedSessionRow s={s} />
            </View>
          ))}
        </Group>
      </View>

      <View onLayout={(e) => (offsets.current.expenses = e.nativeEvent.layout.y)}>
        <SectionHead
          title="Dépenses du mois"
          right={
            <Badge
              label={money.expenses.monthLabel}
              color={COLORS.cardMuted}
              dot={false}
              background={COLORS.sunkenBg}
            />
          }
        />
        <Card tone={COLORS.toneBg}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <View>
              <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.6 }}>
                TOTAL ENGAGÉ
              </Text>
              <Amount
                text={formatMinor(money.expenses.totalMinor)}
                size={26}
                style={{ marginTop: 4 }}
              />
            </View>
            <View
              style={{
                backgroundColor: COLORS.cardBg,
                borderRadius: RADIUS.inner,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: SPACE.md,
                paddingVertical: 6,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardText, fontWeight: "700" }}>
                {money.expenses.count} pièces
              </Text>
            </View>
          </View>
        </Card>
        {money.expenses.rows.map((row) => (
          <ExpenseLine key={row.id} row={row} />
        ))}
      </View>

      <View onLayout={(e) => (offsets.current.debts = e.nativeEvent.layout.y)}>
        <SectionHead
          title="Créances clients (Dettes)"
          caption="Encours accordés en boutique"
          right={
            <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{debts.count} comptes</Text>
          }
        />
        <Card>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Total portefeuille dû</Text>
            <Amount text={formatMinor(debts.totalMinor)} size={20} />
          </View>
          <View
            style={{
              backgroundColor: COLORS.toneBg,
              borderRadius: RADIUS.inner,
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.sm,
              marginTop: SPACE.md,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ ...TYPE.label, color: COLORS.statusWatch, fontWeight: "700" }}>
              dont retard critique (+30 j)
            </Text>
            <Amount text={formatMinor(debts.overdueMinor)} size={13} tone={COLORS.statusWatch} />
          </View>
        </Card>

        <Group style={{ marginTop: SPACE.md }}>
          {debts.rows.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider inset={SPACE.lg} /> : null}
              <Tap onPress={() => props.onOpenDebtor(d.id)} accessibilityLabel={d.name}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SPACE.md,
                    paddingHorizontal: SPACE.lg,
                    paddingVertical: SPACE.md,
                    minHeight: 64,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: d.lateDays > 60 ? COLORS.statusCritical : COLORS.statusWatch,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                      {d.name}
                    </Text>
                    <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                      Échéance dépassée · Retard {d.lateDays} jours
                    </Text>
                  </View>
                  <Amount text={formatMinor(d.totalMinor)} size={14} />
                  <Icon name="chevron-forward" size={16} color={COLORS.cardMuted} />
                </View>
              </Tap>
            </View>
          ))}
        </Group>
      </View>

      <ReadOnlyNote text="Mode consultation sécurisée — Lecture seule" />
    </ScrollView>
  );
}

/** Puce de fraîcheur du bandeau Argent (l'en-tête global affiche déjà l'état). */
function FreshnessChip(props: { label: string }): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: COLORS.onNavyChip,
        borderRadius: RADIUS.inner,
        paddingHorizontal: SPACE.sm,
        paddingVertical: 4,
        maxWidth: "58%",
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.statusOk }} />
      <Text style={{ color: COLORS.headerText, fontSize: 11, flexShrink: 1 }} numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}
