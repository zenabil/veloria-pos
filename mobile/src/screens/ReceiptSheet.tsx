// Veloria Client — Bottom-sheet "reçu" partagée (facture + paiement).
// Design : stitch_veloria_client_mobile_app/invoice_receipt (ticket 80mm,
// perforations, QR placeholder, partage + WhatsApp). Lecture seule.
// V4 : enveloppe plate à filet + ombre réservée à la feuille superposée ;
// la trame du ticket (centré, mono, pointillés) est intacte.
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, FONTS, HAIRLINE, RADIUS, SHADOW, SPACE, TYPE } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { Button, Dashed, flow } from "../ui/kit.tsx";

function shareWhatsApp(text: string): void {
  void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => undefined);
}

function TicketRow(props: {
  label: string;
  value: string;
  dir: "rtl" | "ltr";
  strong?: boolean;
  red?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: flow(props.dir),
        justifyContent: "space-between",
        paddingVertical: 5,
      }}
    >
      <Text
        style={{
          color: COLORS.cardMuted,
          fontSize: 13,
          textAlign: props.dir === "rtl" ? "right" : "left",
        }}
      >
        {props.label}
      </Text>
      <Text
        style={{
          color: props.red ? COLORS.debtOverdue : COLORS.cardText,
          fontFamily: FONTS.mono,
          fontWeight: props.strong ? "800" : "500",
          fontSize: props.strong ? 17 : 14,
          flex: 1,
          textAlign: props.dir === "rtl" ? "left" : "right",
        }}
      >
        {props.value}
      </Text>
    </View>
  );
}

export function ReceiptSheet(props: {
  lang: Lang;
  title: string;
  shareText: string;
  onClose: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onClose}>
      {/* Voile de fermeture : PAS de role « button » — la feuille contient déjà
          des boutons (partager/fermer) et un bouton dans un bouton casse le DOM
          web (validateDOMNesting) comme l'arbre d'accessibilité. */}
      <Pressable
        onPress={props.onClose}
        style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => undefined}
          style={[
            {
              backgroundColor: COLORS.contentBg,
              borderTopLeftRadius: RADIUS.sheet,
              borderTopRightRadius: RADIUS.sheet,
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.sm,
              paddingBottom: SPACE.lg,
              maxHeight: "88%",
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
            },
            SHADOW.raised,
          ]}
        >
          {/* Poignée + barre (fermeture : bouton « Fermer » en bas) */}
          <View style={{ alignItems: "center", marginBottom: SPACE.sm }}>
            <View
              style={{
                width: 48,
                height: 4,
                borderRadius: RADIUS.pill,
                backgroundColor: COLORS.border,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: flow(dir),
              justifyContent: "space-between",
              alignItems: "center",
              gap: SPACE.sm,
              marginBottom: SPACE.md,
            }}
          >
            <Text
              style={{
                ...TYPE.headline,
                color: COLORS.cardText,
                flex: 1,
                textAlign: "center",
              }}
            >
              {props.title}
            </Text>
            <Button
              label={t(l, "shareStatement")}
              variant="success"
              icon="logo-whatsapp"
              onPress={() => shareWhatsApp(props.shareText)}
            />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {props.children}
          </ScrollView>
          <Button
            label={t(l, "close")}
            variant="quiet"
            size="lg"
            full
            onPress={props.onClose}
            style={{ marginTop: SPACE.md }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Ticket thermique 80mm : en-tête centré + lignes + QR placeholder + note. */
export function Ticket(props: {
  lang: Lang;
  shopName: string;
  headLines: { label: string; value: string }[];
  qrText: string;
}): React.JSX.Element {
  const l = props.lang;
  // Sens du ticket : lignes label/valeur inversées en arabe (AR/RTL ADR-051).
  const dir = direction(l);
  return (
    <View
      style={{
        backgroundColor: COLORS.cardBg,
        borderRadius: RADIUS.card,
        padding: SPACE.lg,
        ...HAIRLINE,
      }}
    >
      <View style={{ alignItems: "center", marginBottom: SPACE.sm }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: RADIUS.cardSm,
            backgroundColor: COLORS.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ ...TYPE.display, color: COLORS.headerBg }}>V</Text>
        </View>
        <Text
          style={{
            ...TYPE.title,
            color: COLORS.cardText,
            marginTop: SPACE.sm,
            letterSpacing: 0.4,
            textAlign: "center",
          }}
        >
          {props.shopName}
        </Text>
      </View>
      <Dashed />
      <View style={{ paddingTop: SPACE.sm }}>
        {props.headLines.map((r) => (
          <TicketRow key={r.label} label={r.label} value={r.value} dir={dir} />
        ))}
      </View>
      <View style={{ alignItems: "center", marginTop: SPACE.sm }}>
        <Dashed style={{ alignSelf: "stretch" }} />
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "center",
            gap: SPACE.sm,
            alignSelf: "stretch",
            backgroundColor: COLORS.sunkenBg,
            borderRadius: RADIUS.inner,
            paddingHorizontal: SPACE.lg,
            paddingVertical: SPACE.md,
            marginTop: SPACE.sm,
          }}
        >
          <Icon name="qr-code-outline" size={18} color={COLORS.headerBg} />
          <Text
            style={{
              fontFamily: FONTS.mono,
              fontWeight: "800",
              color: COLORS.cardText,
              fontSize: 13,
            }}
          >
            {props.qrText}
          </Text>
        </View>
        <Text
          style={{
            ...TYPE.micro,
            color: COLORS.cardMuted,
            marginTop: SPACE.sm,
            textAlign: "center",
            lineHeight: 16,
          }}
        >
          {t(l, "receiptNote")}
        </Text>
      </View>
    </View>
  );
}
