// Veloria Client — Écran 05 : compte V3 (héros profil dégradé, groupe magasin,
// liste de réglages à icônes + chevrons, actions danger).
// Logique inchangée : props + appel/WhatsApp + logout/changePin/share/langue.
import { Linking, ScrollView, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SPACE, SIZES, debtColor, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { Amount, Badge, Button, Card, IconBubble, Tap, flow, type IconName } from "../ui/kit.tsx";

function SettingRow(props: {
  icon: IconName;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
  dir: "rtl" | "ltr";
  last?: boolean;
}): React.JSX.Element {
  const rtl = props.dir === "rtl";
  const color = props.danger === true ? COLORS.debtOverdue : COLORS.cardText;
  return (
    <Tap
      onPress={props.onPress}
      disabled={props.onPress === undefined}
      accessibilityLabel={props.label}
      style={{
        flexDirection: flow(props.dir),
        alignItems: "center",
        gap: SPACE.md,
        paddingVertical: SPACE.md,
        borderBottomWidth: props.last === true ? 0 : 1,
        borderBottomColor: COLORS.border,
        opacity: props.onPress === undefined ? 0.85 : 1,
      }}
    >
      <IconBubble
        icon={props.icon}
        color={props.danger === true ? COLORS.debtOverdue : COLORS.headerBg}
        size={36}
      />
      <Text style={{ fontWeight: "700", color, flex: 1, textAlign: rtl ? "right" : "left" }}>
        {props.label}
      </Text>
      {props.value ? (
        <Text
          style={{
            color: COLORS.cardMuted,
            fontSize: 13,
            maxWidth: 140,
            textAlign: rtl ? "left" : "right",
          }}
          numberOfLines={1}
        >
          {props.value}
        </Text>
      ) : null}
      <Ionicons
        name={rtl ? "chevron-back" : "chevron-forward"}
        size={16}
        color={COLORS.cardMuted}
        style={{ opacity: props.onPress === undefined ? 0 : 1 }}
      />
    </Tap>
  );
}

export function AccountScreen(props: {
  lang: Lang;
  customerName: string;
  phone: string;
  lastLoginAt: string | null;
  shopName: string;
  shopPhone: string;
  shopAddress: string | null;
  announcement: string | null;
  appVersion: string;
  developer: string;
  supportPhone: string;
  onLogout: () => void;
  onChangePin: () => void;
  onShare: () => void;
  onToggleLang: () => void;
  debtMinor: number;
  debtStatus: string;
  overLimit: boolean;
  hidden: boolean;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const tone = debtColor(props.debtStatus, props.overLimit);
  const call = (num: string): void => {
    void Linking.openURL(`tel:${num}`).catch(() => undefined);
  };
  const whatsapp = (num: string, text: string): void => {
    void Linking.openURL(`https://wa.me/${num}?text=${encodeURIComponent(text)}`).catch(
      () => undefined,
    );
  };
  const initial = (Array.from(props.customerName.trim())[0] ?? "V").toUpperCase();
  const situation =
    props.overLimit || props.debtStatus === "over_limit"
      ? t(l, "overLimit")
      : props.debtStatus === "overdue"
        ? t(l, "late")
        : props.debtStatus === "due"
          ? t(l, "indebted")
          : t(l, "upToDate");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.contentBg }}
      contentContainerStyle={{ padding: SPACE.md, paddingBottom: 110 }}
    >
      {/* Profil */}
      <LinearGradient
        colors={GRADIENTS.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          {
            borderRadius: RADIUS.card,
            padding: SPACE.lg,
            marginBottom: SPACE.md,
            gap: SPACE.md,
          },
          SHADOW.raised,
        ]}
      >
        <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.md }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: tint(COLORS.white, "1A"),
              borderWidth: 2,
              borderColor: COLORS.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: "900", color: COLORS.white }}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 20, fontWeight: "900", color: COLORS.white, letterSpacing: 0.3 }}
              numberOfLines={1}
            >
              {props.customerName}
            </Text>
            <Text style={{ color: COLORS.headerText, marginTop: 2, fontSize: 14 }}>
              {props.phone}
            </Text>
            <Text style={{ color: COLORS.navyMuted, fontSize: 11, marginTop: 2 }}>
              {t(l, "lastLogin")}: {props.lastLoginAt ? formatDateFr(props.lastLoginAt) : "—"}
            </Text>
          </View>
          <Badge label={t(l, "verified")} color={COLORS.headerAccent} icon="shield-checkmark" />
        </View>

        <View
          style={{
            backgroundColor: tint(COLORS.white, "14"),
            borderRadius: RADIUS.cardSm,
            padding: SPACE.md,
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE.sm,
          }}
        >
          <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 6 }}>
            <Text style={{ color: COLORS.headerText, fontSize: 12 }}>
              {t(l, "financialSituation")}
            </Text>
            <Badge label={situation} color={tone} />
          </View>
          <Amount
            text={props.hidden ? "•••" : formatMinor(props.debtMinor, l)}
            tone={COLORS.white}
            size={SIZES.amountMd}
          />
        </View>

        <View style={{ flexDirection: flow(dir), gap: SPACE.sm }}>
          <Button
            label={t(l, "changePin")}
            variant="outline"
            icon="key-outline"
            onPress={props.onChangePin}
            style={{ flex: 1 }}
          />
          <Button
            label={t(l, "logout")}
            variant="danger"
            icon="log-out-outline"
            onPress={props.onLogout}
            style={{ flex: 1 }}
          />
        </View>
      </LinearGradient>

      {/* Magasin */}
      <Card style={{ marginBottom: SPACE.md, gap: SPACE.sm }}>
        <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.sm }}>
          <IconBubble icon="storefront-outline" color={COLORS.headerBg} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: COLORS.cardMuted, fontWeight: "700" }}>
              {t(l, "shop")}
            </Text>
            <Text style={{ fontWeight: "900", color: COLORS.cardText, fontSize: 16 }}>
              {props.shopName}
            </Text>
          </View>
        </View>
        {props.shopAddress ? (
          <Text style={{ color: COLORS.cardMuted, fontSize: 13 }}>
            {t(l, "addressLabel")} : {props.shopAddress}
          </Text>
        ) : null}
        {props.announcement ? (
          <View
            style={{
              flexDirection: flow(dir),
              gap: 6,
              backgroundColor: tint(COLORS.debtOk, "14"),
              borderRadius: RADIUS.inner,
              padding: SPACE.sm,
              alignItems: "flex-start",
            }}
          >
            <Ionicons name="megaphone-outline" size={15} color={COLORS.debtOk} />
            <Text
              style={{ color: COLORS.announcementText, fontWeight: "700", flex: 1, fontSize: 12 }}
            >
              {props.announcement}
            </Text>
          </View>
        ) : null}
        {props.shopPhone !== "" ? (
          <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.xs }}>
            <Button
              label={t(l, "call")}
              variant="ghost"
              icon="call-outline"
              onPress={() => call(props.shopPhone)}
              style={{ flex: 1 }}
            />
            <Button
              label={t(l, "whatsapp")}
              variant="success"
              icon="logo-whatsapp"
              onPress={() => whatsapp(props.shopPhone, t(l, "contactShop"))}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </Card>

      {/* Réglages */}
      <Card style={{ paddingHorizontal: SPACE.md, marginBottom: SPACE.md }}>
        <SettingRow
          icon="language-outline"
          label={t(l, "language")}
          value={l === "ar" ? "العربية" : "Français"}
          onPress={props.onToggleLang}
          dir={dir}
        />
        <SettingRow
          icon="information-circle-outline"
          label={t(l, "aboutApp")}
          value={`v${props.appVersion} · ${props.developer}`}
          dir={dir}
        />
        <SettingRow
          icon="call-outline"
          label={t(l, "support")}
          value={props.supportPhone}
          onPress={props.supportPhone !== "" ? () => call(props.supportPhone) : undefined}
          dir={dir}
          last
        />
      </Card>

      <Button
        label={t(l, "shareStatement")}
        variant="gold"
        size="lg"
        icon="logo-whatsapp"
        onPress={props.onShare}
      />
    </ScrollView>
  );
}
