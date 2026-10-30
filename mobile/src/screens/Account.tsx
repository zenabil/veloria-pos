// Veloria Client — Écran 05 : compte V5 « profil plein bandeau ».
// Le bandeau d'encre devient pleine largeur (identité), la situation financière
// le chevauche en carte teintée, puis actions, magasin, annonce, réglages et
// partage du relevé. Dernière synchro horodatée (le champ `syncedAt` n'est pas
// une date de connexion). Logique inchangée : appel/WhatsApp, logout, PIN,
// partage, langue.
import { useState } from "react";
import { Linking, Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { COLORS, RADIUS, SPACE, SIZES, TYPE, debtColor, debtSurface } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { formatDateTimeFr, formatMinor } from "../format.ts";
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
  onRefresh: () => Promise<void>;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const rtl = dir === "rtl";
  const [spinning, setSpinning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
    <View style={{ flex: 1, backgroundColor: COLORS.contentBg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: COLORS.contentBg }}
        contentContainerStyle={{ paddingBottom: SIZES.dockInset }}
        refreshControl={
          <RefreshControl
            refreshing={spinning}
            onRefresh={() => {
              setSpinning(true);
              void props.onRefresh().finally(() => setSpinning(false));
            }}
          />
        }
      >
        {/* Identité : bandeau encre pleine largeur (aucune donnée financière). */}
        <View style={{ backgroundColor: COLORS.headerBg, padding: SPACE.lg, paddingBottom: 40 }}>
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
                {t(l, "lastSync")}: {props.lastLoginAt ? formatDateTimeFr(props.lastLoginAt) : "—"}
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

        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.md }}>
          {/* Situation financière : carte teintée qui chevauche le bandeau. */}
          <Card tone={debtSurface(props.debtStatus, props.overLimit)} style={{ marginTop: -24 }}>
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
              onPress={() => setConfirmOpen(true)}
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
              caption={
                props.shopAddress ? `${t(l, "addressLabel")} : ${props.shopAddress}` : undefined
              }
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
              <Icon
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
        </View>
      </ScrollView>

      {/* Confirmation de déconnexion : action destructrice, jamais immédiate. */}
      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <Pressable
          onPress={() => setConfirmOpen(false)}
          style={{
            flex: 1,
            backgroundColor: COLORS.overlay,
            justifyContent: "center",
            padding: SPACE.xl,
          }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: COLORS.cardBg,
              borderRadius: RADIUS.card,
              padding: SPACE.lg,
              gap: SPACE.md,
            }}
          >
            <Text
              style={{
                ...TYPE.title,
                color: COLORS.cardText,
                textAlign: rtl ? "right" : "left",
              }}
            >
              {t(l, "logoutConfirm")}
            </Text>
            <Text
              style={{
                ...TYPE.caption,
                color: COLORS.cardMuted,
                lineHeight: 18,
                textAlign: rtl ? "right" : "left",
              }}
            >
              {t(l, "logoutHint")}
            </Text>
            <View style={{ flexDirection: flow(dir), gap: SPACE.sm, marginTop: SPACE.xs }}>
              <Button
                label={t(l, "cancel")}
                variant="quiet"
                onPress={() => setConfirmOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                label={t(l, "logout")}
                variant="danger"
                onPress={() => {
                  setConfirmOpen(false);
                  props.onLogout();
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
