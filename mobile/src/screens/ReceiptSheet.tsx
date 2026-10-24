// Veloria Client — Bottom-sheet "reçu" partagée (facture + paiement).
// Design : stitch_veloria_client_mobile_app/invoice_receipt (ticket 80mm,
// perforations, QR placeholder, partage + WhatsApp). Lecture seule.
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONTS, GRADIENTS, RADIUS, SPACE, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { flow } from "../ui/kit.tsx";

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(l, "close")}
        onPress={props.onClose}
        style={{ flex: 1, backgroundColor: COLORS.overlay, justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: COLORS.contentBg,
            borderTopLeftRadius: RADIUS.sheet,
            borderTopRightRadius: RADIUS.sheet,
            padding: 16,
            maxHeight: "88%",
          }}
        >
          {/* Poignée + barre (fermeture : bouton « Fermer » en bas) */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <View
              style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: COLORS.border }}
            />
          </View>
          <View
            style={{
              flexDirection: flow(dir),
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: COLORS.cardText,
                fontWeight: "900",
                fontSize: 16,
                flex: 1,
                textAlign: "center",
              }}
            >
              {props.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(l, "shareStatement")}
              onPress={() => shareWhatsApp(props.shareText)}
              style={{
                backgroundColor: COLORS.debtOk,
                borderRadius: RADIUS.pill,
                paddingHorizontal: 14,
                paddingVertical: 9,
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <Ionicons name="logo-whatsapp" size={14} color={COLORS.white} />
              <Text style={{ color: COLORS.white, fontWeight: "800", fontSize: 12 }}>
                {t(l, "shareStatement")}
              </Text>
            </Pressable>
          </View>
          {props.children}
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            style={{
              backgroundColor: COLORS.cardBg,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: RADIUS.pill,
              padding: 12,
              marginTop: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: COLORS.cardText, fontWeight: "800" }}>{t(l, "close")}</Text>
          </Pressable>
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
        borderWidth: 1,
        borderColor: tint(COLORS.headerBg, "0D"),
      }}
    >
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <LinearGradient
          colors={GRADIENTS.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 50,
            height: 50,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: COLORS.headerBg, fontWeight: "900", fontSize: 24 }}>V</Text>
        </LinearGradient>
        <Text
          style={{
            color: COLORS.cardText,
            fontWeight: "900",
            fontSize: 18,
            marginTop: 8,
            letterSpacing: 0.3,
          }}
        >
          {props.shopName}
        </Text>
      </View>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          borderStyle: "dashed",
          paddingTop: 8,
        }}
      >
        {props.headLines.map((r) => (
          <TicketRow key={r.label} label={r.label} value={r.value} dir={dir} />
        ))}
      </View>
      <View style={{ alignItems: "center", marginTop: 10 }}>
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: COLORS.contentBg,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Ionicons name="qr-code-outline" size={18} color={COLORS.headerBg} />
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
        <Text style={{ color: COLORS.cardMuted, fontSize: 11, marginTop: 8, textAlign: "center" }}>
          {t(l, "receiptNote")}
        </Text>
      </View>
    </View>
  );
}
