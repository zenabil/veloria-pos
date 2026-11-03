// Veloria Owner — Argent : trois vues courtes (Caisse, Dépenses, Dettes).
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { COLORS, RADIUS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateLongFr,
  formatDateShortFr,
  formatMinorSafe,
  formatPercent,
  formatSignedMinorSafe,
  formatTime,
} from "../format.ts";
import type { CashSession, ExpenseRow, OwnerSnapshot } from "../store.ts";
import {
  Amount,
  Badge,
  Card,
  Divider,
  Group,
  IconBubble,
  ProgressBar,
  ReadOnlyNote,
  SectionHead,
  Segmented,
  Tap,
} from "../ui/kit.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";

type MoneyView = "cash" | "expenses" | "debts";

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
  // Signe + montant en UN seul appel : un chiffre corrompu rend « — » nu,
  // jamais un « +— » hérité d'une concaténation.
  return formatSignedMinorSafe(v);
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
      <Amount text={formatMinorSafe(-props.row.amountMinor)} size={14} tone={COLORS.criticalText} />
    </View>
  );
}

export function MoneyScreen(props: {
  snapshot: OwnerSnapshot;
  onOpenCashAudit: () => void;
  onOpenDebtor: (id: string) => void;
}): React.JSX.Element {
  const [view, setView] = useState<MoneyView>("cash");
  const money = props.snapshot.money;
  const session = money.activeSession;
  const debts = money.debts;
  const overdueShare =
    debts.totalMinor > 0 ? Math.round((debts.overdueMinor / debts.totalMinor) * 100) : 0;
  const expenseAverage =
    money.expenses.count > 0 ? Math.round(money.expenses.totalMinor / money.expenses.count) : 0;
  const topExpense = money.expenses.rows.reduce<ExpenseRow | null>(
    (best, row) => (best && best.amountMinor >= row.amountMinor ? best : row),
    null,
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset + SPACE.lg }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
        {formatDateLongFr(props.snapshot.day.date)}
      </Text>

      <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
        <Segmented
          options={[
            { value: "cash", label: "Caisse" },
            { value: "expenses", label: "Dépenses" },
            { value: "debts", label: "Dettes" },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      {view === "cash" ? (
        <>
          <View style={{ flexDirection: "row", gap: SPACE.sm }}>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Sessions</Text>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "800" }}>
                {money.sessions.length}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Conformité</Text>
              <Text style={{ ...TYPE.bodySm, color: COLORS.statusOk, fontWeight: "800" }}>
                {formatPercent(money.audit.conformityPercent, 2)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Écart net</Text>
              <Amount
                text={varianceText(money.audit.varianceNetMinor)}
                size={13}
                tone={varianceTone(money.audit.varianceNetMinor)}
              />
            </View>
          </View>

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
                  {
                    label: "Attendu",
                    value: session.expectedMinor,
                    tone: COLORS.cardText,
                    signed: false,
                  },
                  {
                    label: "Compté",
                    value: session.countedMinor,
                    tone: COLORS.cardText,
                    signed: false,
                  },
                  {
                    label: "Écart",
                    value: session.varianceMinor,
                    tone: varianceTone(session.varianceMinor),
                    signed: true,
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
                      text={
                        tile.value === null
                          ? "—"
                          : tile.signed
                            ? varianceText(tile.value)
                            : formatMinorSafe(tile.value)
                      }
                      size={13}
                      tone={tile.tone}
                      style={{ marginTop: 4 }}
                    />
                  </View>
                ))}
              </View>

              {session.note ? (
                <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: SPACE.md }}>
                  {session.note}
                </Text>
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
            title="Sessions clôturées"
            actionLabel="Audit des caisses"
            onPress={props.onOpenCashAudit}
          />
          <Group>
            {money.sessions.length === 0 ? (
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, padding: SPACE.lg }}>
                Aucune session clôturée publiée.
              </Text>
            ) : null}
            {money.sessions.map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <Divider inset={SPACE.lg} /> : null}
                <ClosedSessionRow s={s} />
              </View>
            ))}
          </Group>
          <ReadOnlyNote text="Mode consultation sécurisée — Lecture seule" />
        </>
      ) : null}

      {view === "expenses" ? (
        <>
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
                  TOTAL ENGAGÉ · {money.expenses.monthLabel.toUpperCase()}
                </Text>
                <Amount
                  text={formatMinorSafe(money.expenses.totalMinor)}
                  size={26}
                  style={{ marginTop: 4 }}
                />
              </View>
              <Badge
                label={`${money.expenses.count} pièces`}
                color={COLORS.cardText}
                dot={false}
                background={COLORS.cardBg}
              />
            </View>
          </Card>
          <View style={{ flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.sm }}>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Moyenne / pièce</Text>
              <Amount text={formatMinorSafe(expenseAverage)} size={13} />
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.toneBg,
                borderRadius: RADIUS.inner,
                padding: SPACE.sm,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>Poste principal</Text>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "800" }}>
                {topExpense ? topExpense.category : "—"}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: SPACE.sm }}>
            {money.expenses.rows.length === 0 ? (
              <Card>
                <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, textAlign: "center" }}>
                  Aucune dépense publiée ce mois-ci.
                </Text>
              </Card>
            ) : null}
            {money.expenses.rows.map((row) => (
              <ExpenseLine key={row.id} row={row} />
            ))}
          </View>
          <ReadOnlyNote text="Dépenses du mois — lecture seule" />
        </>
      ) : null}

      {view === "debts" ? (
        <>
          <Card>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted }}>Total portefeuille dû</Text>
              <Amount text={formatMinorSafe(debts.totalMinor)} size={20} />
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
              <Amount
                text={formatMinorSafe(debts.overdueMinor)}
                size={13}
                tone={COLORS.statusWatch}
              />
            </View>
            <View style={{ marginTop: SPACE.md }}>
              <ProgressBar
                percent={overdueShare}
                color={COLORS.statusWatch}
                track={COLORS.sunkenBg}
                height={6}
              />
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted, marginTop: 6 }}>
                {overdueShare} % du portefeuille en retard critique
              </Text>
            </View>
          </Card>

          <SectionHead
            title="Clients débiteurs"
            right={
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{debts.count} comptes</Text>
            }
          />
          <Group>
            {debts.rows.length === 0 ? (
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, padding: SPACE.lg }}>
                Aucune créance client.
              </Text>
            ) : null}
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
                        backgroundColor:
                          d.lateDays > 60 ? COLORS.statusCritical : COLORS.statusWatch,
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
                    <Amount text={formatMinorSafe(d.totalMinor)} size={14} />
                    <Icon name="chevron-forward" size={16} color={COLORS.cardMuted} />
                  </View>
                </Tap>
              </View>
            ))}
          </Group>
          <ReadOnlyNote text="Créances clients — lecture seule, aucun encaissement possible" />
        </>
      ) : null}
    </ScrollView>
  );
}
