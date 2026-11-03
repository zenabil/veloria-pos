// Veloria Owner — détail d'une opération du jour (vente, retour, paiement,
// dépense) : pièces, totaux, encaissement — lecture seule.
import { ScrollView, Text, View } from "react-native";
import { COLORS, SIZES, SPACE, TYPE } from "../tokens.ts";
import {
  formatDateShortFr,
  formatMinorSafe,
  formatQuantity,
  formatSignedMinorSafe,
  formatTime,
} from "../format.ts";
import type { JournalRow, SaleKind, TransactionDetail } from "../store.ts";
import { Amount, Badge, Card, Divider, Group, ReadOnlyNote } from "../ui/kit.tsx";
import { PageBar } from "../ui/nav.tsx";

const KIND: Record<SaleKind, { label: string; color: string; bg: string }> = {
  sale: { label: "Vente", color: COLORS.cardText, bg: COLORS.toneBg },
  return: { label: "Retour", color: COLORS.statusWatch, bg: COLORS.watchTone },
  payment: { label: "Versement", color: COLORS.cardMuted, bg: COLORS.sunkenBg },
  expense: { label: "Dépense", color: COLORS.criticalText, bg: COLORS.criticalTone },
};

function InfoRow(props: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACE.md,
        paddingVertical: 6,
      }}
    >
      <Text style={{ ...TYPE.bodySm, color: COLORS.cardMuted, flexShrink: 1 }}>{props.label}</Text>
      {typeof props.value === "string" ? (
        <Text
          style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700", textAlign: "right" }}
        >
          {props.value}
        </Text>
      ) : (
        props.value
      )}
    </View>
  );
}

function Lines(props: { tx: TransactionDetail }): React.JSX.Element | null {
  if (props.tx.kind !== "sale" && props.tx.kind !== "return") return null;
  const tx = props.tx;
  return (
    <Group style={{ marginTop: SPACE.md }}>
      {tx.lines.map((line, i) => (
        <View key={`${line.name}-${i}`}>
          {i > 0 ? <Divider inset={SPACE.lg} /> : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACE.md,
              paddingHorizontal: SPACE.lg,
              paddingVertical: SPACE.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ ...TYPE.bodySm, color: COLORS.cardText, fontWeight: "700" }}>
                {line.name}
              </Text>
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
                {formatQuantity(line.qty, "unité", "unités")} × {formatMinorSafe(line.unitMinor)}
              </Text>
            </View>
            <Amount text={formatMinorSafe(line.totalMinor)} size={14} />
          </View>
        </View>
      ))}
    </Group>
  );
}

function SaleDetails(props: {
  tx: Extract<TransactionDetail, { kind: "sale" }>;
}): React.JSX.Element {
  const tx = props.tx;
  return (
    <>
      <Lines tx={tx} />
      <Card style={{ marginTop: SPACE.md }}>
        <InfoRow
          label="Sous-total"
          value={<Amount text={formatMinorSafe(tx.subtotalMinor)} size={14} />}
        />
        {tx.discountMinor > 0 ? (
          <InfoRow
            label="Remise"
            value={
              <Amount
                text={formatMinorSafe(-tx.discountMinor)}
                size={14}
                tone={COLORS.statusWatch}
              />
            }
          />
        ) : null}
        <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }} />
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>Total payé</Text>
          <Amount text={formatMinorSafe(tx.totalMinor)} size={18} />
        </View>
      </Card>

      <Card style={{ marginTop: SPACE.md }}>
        <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.6 }}>
          ENCAISSEMENT
        </Text>
        <View style={{ marginTop: SPACE.xs }}>
          <InfoRow label="Mode" value={tx.payment.label} />
          <InfoRow
            label="Reçu"
            value={<Amount text={formatMinorSafe(tx.payment.receivedMinor)} size={13} />}
          />
          {tx.payment.changeMinor > 0 ? (
            <InfoRow
              label="Monnaie rendue"
              value={<Amount text={formatMinorSafe(tx.payment.changeMinor)} size={13} />}
            />
          ) : null}
          {tx.payment.creditMinor > 0 ? (
            <InfoRow
              label="À crédit"
              value={
                <Amount
                  text={formatMinorSafe(tx.payment.creditMinor)}
                  size={13}
                  tone={COLORS.statusWatch}
                />
              }
            />
          ) : null}
          <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }} />
          <InfoRow label="Caissier" value={tx.cashier} />
          <InfoRow label="Session" value={tx.session} />
        </View>
      </Card>
    </>
  );
}

function ReturnDetails(props: {
  tx: Extract<TransactionDetail, { kind: "return" }>;
}): React.JSX.Element {
  const tx = props.tx;
  return (
    <>
      <Card style={{ marginTop: SPACE.md }}>
        <InfoRow label="Facture d'origine" value={tx.originInvoice} />
        <InfoRow label="Motif" value={tx.reason} />
        <InfoRow label="Opérateur" value={tx.operator} />
      </Card>
      <Lines tx={tx} />
      <Card style={{ marginTop: SPACE.md }}>
        <Text style={{ ...TYPE.badge, color: COLORS.cardMuted, letterSpacing: 0.6 }}>
          REMBOURSEMENT
        </Text>
        <View style={{ marginTop: SPACE.xs }}>
          <InfoRow label="Mode" value={tx.refund.label} />
          <InfoRow
            label="Montant"
            value={<Amount text={formatMinorSafe(tx.refund.amountMinor)} size={14} />}
          />
          {tx.refund.toDebtMinor > 0 ? (
            <InfoRow
              label="Imputé à la dette"
              value={
                <Amount
                  text={formatMinorSafe(tx.refund.toDebtMinor)}
                  size={13}
                  tone={COLORS.statusWatch}
                />
              }
            />
          ) : null}
          <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ ...TYPE.headlineSm, color: COLORS.cardText }}>Total retourné</Text>
            <Amount text={formatMinorSafe(tx.totalMinor)} size={16} tone={COLORS.statusWatch} />
          </View>
        </View>
      </Card>
    </>
  );
}

function PaymentDetails(props: {
  tx: Extract<TransactionDetail, { kind: "payment" }>;
}): React.JSX.Element {
  const tx = props.tx;
  return (
    <Card style={{ marginTop: SPACE.md }}>
      <InfoRow label="Type" value={tx.label} />
      <InfoRow label="Moyen" value={tx.method} />
      <InfoRow label="Référence" value={tx.reference} />
      <InfoRow
        label="Montant"
        value={<Amount text={formatMinorSafe(tx.amountMinor)} size={14} />}
      />
      <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }} />
      <InfoRow label="Opérateur" value={tx.operator} />
      {tx.note ? <InfoRow label="Note" value={tx.note} /> : null}
    </Card>
  );
}

function ExpenseDetails(props: {
  tx: Extract<TransactionDetail, { kind: "expense" }>;
}): React.JSX.Element {
  const tx = props.tx;
  return (
    <Card style={{ marginTop: SPACE.md }}>
      <InfoRow label="Catégorie" value={tx.category} />
      <InfoRow label="Bénéficiaire" value={tx.payee} />
      <InfoRow label="Règlement" value={tx.method} />
      <InfoRow label="Référence" value={tx.reference} />
      <InfoRow
        label="Montant"
        value={<Amount text={formatMinorSafe(tx.amountMinor)} size={14} />}
      />
      <View style={{ height: 1, backgroundColor: COLORS.divider, marginVertical: SPACE.sm }} />
      <InfoRow label="Opérateur" value={tx.operator} />
      {tx.note ? <InfoRow label="Note" value={tx.note} /> : null}
    </Card>
  );
}

export function TransactionDetailScreen(props: {
  entry: JournalRow;
  onBack: () => void;
}): React.JSX.Element {
  const r = props.entry;
  const kind = KIND[r.kind];
  const negative = r.amountMinor < 0;

  return (
    <View style={{ flex: 1 }}>
      <PageBar
        title="Aujourd'hui"
        onBack={props.onBack}
        badge={<Badge label={kind.label} color={kind.color} dot={false} background={kind.bg} />}
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: SPACE.lg,
          paddingBottom: SIZES.dockInset + SPACE.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>
            {formatDateShortFr(r.at)} · {formatTime(r.at)}
          </Text>
          <Text style={{ ...TYPE.headline, color: COLORS.cardText, marginTop: 2 }}>{r.ref}</Text>
          <Text style={{ ...TYPE.label, color: COLORS.cardMuted }}>{r.detail}</Text>
          <Amount
            text={formatSignedMinorSafe(r.amountMinor)}
            size={26}
            tone={negative ? COLORS.criticalText : COLORS.cardText}
            style={{ marginTop: SPACE.sm }}
          />
        </Card>

        {r.tx.kind === "sale" ? <SaleDetails tx={r.tx} /> : null}
        {r.tx.kind === "return" ? <ReturnDetails tx={r.tx} /> : null}
        {r.tx.kind === "payment" ? <PaymentDetails tx={r.tx} /> : null}
        {r.tx.kind === "expense" ? <ExpenseDetails tx={r.tx} /> : null}

        <ReadOnlyNote text="Détail de transaction — lecture seule, aucune correction ni encaissement possible depuis ce terminal." />
      </ScrollView>
    </View>
  );
}
