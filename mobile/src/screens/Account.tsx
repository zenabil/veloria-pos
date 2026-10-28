// Veloria Client — Écran 05 : compte V4 « Daylight plat ».
// Bandeau profil encre plat, chiffre de dette sur surface teintée (lisible),
// magasin et réglages regroupés en lignes à filet. Plus de carte dans une carte.
// Logique inchangée : props + appel/WhatsApp + logout/changePin/share/langue.
import { Linking, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACE, SIZES, TYPE, debtColor, debtSurface } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateFr, formatMinor } from "../format.ts";
import { Amount, Badge, Button, Card, Divider, Group, Row, SectionHead, flow } from "../ui/kit.tsx";

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
  const rtl = dir === "rtl";
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
      contentContainerStyle={{ padding: SPACE.lg, paddingBottom: SIZES.dockInset, gap: SPACE.md }}
    >
      {/* Identité : bandeau encre, aucune donnée financière dedans. */}
      <View
        style={{
          backgroundColor: COLORS.headerBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
        }}
      >
        <View style={{ flexDirection: flow(dir), alignItems: "center", gap: SPACE.md }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: RADIUS.pill,
              backgroundColor: COLORS.navySoft,
              borderWidth: 1,
              borderColor: COLORS.navyLine,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ ...TYPE.title, color: COLORS.white }}>{initial}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                ...TYPE.title,
                color: COLORS.white,
                textAlign: rtl ? "right" : "left",
              }}
              numberOfLines={1}
            >
              {props.customerName}
            </Text>
            <Text style={{ ...TYPE.body, color: COLORS.headerText }}>{props.phone}</Text>
            <Text style={{ ...TYPE.micro, color: COLORS.navyMuted }}>
              {t(l, "lastLogin")}: {props.lastLoginAt ? formatDateFr(props.lastLoginAt) : "—"}
            </Text>
          </View>
          <Badge
            label={t(l, "verified")}
            color={COLORS.headerAccent}
            icon="shield-checkmark"
            dot={false}
          />
        </View>
      </View>

      {/* Situation financière : surface teintée, encre lisible, chiffre mono. */}
      <Card tone={debtSurface(props.debtStatus, props.overLimit)}>
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "center",
            justifyContent: "space-between",
            gap: SPACE.sm,
          }}
        >
          <Text
            style={{
              ...TYPE.label,
              color: COLORS.cardMuted,
              letterSpacing: 0.5,
              textAlign: rtl ? "right" : "left",
            }}
          >
            {t(l, "financialSituation")}
          </Text>
          <Badge label={situation} color={tone} />
        </View>
        <Amount
          text={props.hidden ? "•••" : formatMinor(props.debtMinor, l)}
          tone={tone}
          size={SIZES.amountLg}
          align={rtl ? "right" : "left"}
          style={{ marginTop: SPACE.xs }}
        />
      </Card>

      <View style={{ flexDirection: flow(dir), gap: SPACE.sm }}>
        <Button
          label={t(l, "changePin")}
          variant="quiet"
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

      {/* Magasin */}
      <SectionHead title={t(l, "shop")} dir={dir} />
      <Group>
        <Row
          dir={dir}
          icon="storefront-outline"
          iconTone={COLORS.headerBg}
          title={props.shopName}
          caption={props.shopAddress ? `${t(l, "addressLabel")} : ${props.shopAddress}` : undefined}
        />
        {props.shopPhone !== "" ? (
          <>
            <Divider />
            <View style={{ flexDirection: flow(dir), gap: SPACE.sm, padding: SPACE.md }}>
              <Button
                label={t(l, "call")}
                variant="quiet"
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
          </>
        ) : null}
      </Group>

      {props.announcement ? (
        <View
          style={{
            flexDirection: flow(dir),
            alignItems: "flex-start",
            gap: SPACE.sm,
            backgroundColor: COLORS.okTone,
            borderRadius: RADIUS.cardSm,
            padding: SPACE.md,
          }}
        >
          <Ionicons
            name="megaphone-outline"
            size={16}
            color={COLORS.debtOk}
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              ...TYPE.caption,
              color: COLORS.announcementText,
              fontWeight: "700",
              flex: 1,
              textAlign: rtl ? "right" : "left",
            }}
          >
            {props.announcement}
          </Text>
        </View>
      ) : null}

      {/* Réglages du compte */}
      <Group>
        <Row
          dir={dir}
          icon="language-outline"
          title={t(l, "language")}
          value={l === "ar" ? "العربية" : "Français"}
          chevron
          onPress={props.onToggleLang}
        />
        <Divider />
        <Row
          dir={dir}
          icon="information-circle-outline"
          title={t(l, "aboutApp")}
          value={`v${props.appVersion} · ${props.developer}`}
        />
        <Divider />
        <Row
          dir={dir}
          icon="call-outline"
          title={t(l, "support")}
          value={props.supportPhone}
          chevron={props.supportPhone !== ""}
          onPress={props.supportPhone !== "" ? () => call(props.supportPhone) : undefined}
        />
      </Group>

      <Button
        label={t(l, "shareStatement")}
        variant="gold"
        size="lg"
        icon="logo-whatsapp"
        onPress={props.onShare}
        full
      />
    </ScrollView>
  );
}
