// Veloria Client — Écran 01 : splash + connexion (V3 « Veloria Fintech »).
// Logique inchangée : téléphone + PIN 6 chiffres, erreurs mappées côté App,
// scan QR (ADR-054) et demande de code WhatsApp préservés.
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Image,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, GRADIENTS, RADIUS, SHADOW, SPACE, SIZES, tint } from "../tokens.ts";
import { t, type Lang } from "../i18n.ts";
import { normalizeDigits } from "../format.ts";
import { Button, flow, Tap } from "../ui/kit.tsx";
import { QrScannerScreen } from "./QrScanner.tsx";

function PinBoxes(props: { pin: string; lang: Lang; revealed: boolean }): React.JSX.Element {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => props.pin[i] ?? "");
  const dir = flow(props.lang === "ar" ? "rtl" : "ltr");
  return (
    <View style={{ flexDirection: dir, gap: 8 }}>
      {cells.map((c, i) => {
        const filled = c !== "";
        const active = i === props.pin.length;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              minHeight: 54,
              borderRadius: RADIUS.field,
              backgroundColor: COLORS.cardBg,
              borderWidth: active ? 2 : 1.5,
              borderColor: active
                ? COLORS.primary
                : filled
                  ? COLORS.headerBg
                  : tint(COLORS.headerBg, "1A"),
              alignItems: "center",
              justifyContent: "center",
              shadowColor: active ? COLORS.primary : "transparent",
              shadowOpacity: active ? 0.5 : 0,
              shadowOffset: { width: 0, height: 4 },
              shadowRadius: 10,
              elevation: active ? 3 : 0,
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: COLORS.cardText,
              }}
            >
              {filled ? (props.revealed ? c : "•") : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function HelpStep(props: { index: number; text: string; dir: "rtl" | "ltr" }): React.JSX.Element {
  return (
    <View
      style={{
        flexDirection: flow(props.dir),
        alignItems: "center",
        gap: SPACE.sm,
        paddingVertical: 5,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: tint(COLORS.primary, "2E"),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 11 }}>
          {props.index}
        </Text>
      </View>
      <Text style={{ color: COLORS.headerText, fontSize: 13, flex: 1 }}>{props.text}</Text>
    </View>
  );
}

export function LoginScreen(props: {
  lang: Lang;
  onLang: (l: Lang) => void;
  onLogin: (
    phone: string,
    pin: string,
    endpoint?: { supabaseUrl: string; anonKey: string } | null,
  ) => Promise<void>;
  error: string | null;
}): React.JSX.Element {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Garde anti double-envoi : l'état React `busy` n'est pas encore vraie au
  // moment du second tap (même frame) — le ref, si.
  const busyRef = useRef(false);
  const [showPin, setShowPin] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const l = props.lang;
  const rtl = l === "ar";

  async function submit(phoneArg?: string, pinArg?: string): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await props.onLogin(
        normalizeDigits(phoneArg ?? phone).trim(),
        normalizeDigits(pinArg ?? pin),
        null,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // QR scanné (ADR-054 V1, ADR-068 V2) : pré-remplit puis connecte via le même
  // `client-sync` — en V2 l'endpoint du magasin voyage dans le QR (APK universel).
  async function submitScanned(
    phoneValue: string,
    pinValue: string,
    endpoint?: { supabaseUrl: string; anonKey: string } | null,
  ): Promise<void> {
    setPhone(phoneValue);
    setPin(pinValue);
    setScanOpen(false);
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await props.onLogin(
        normalizeDigits(phoneValue).trim(),
        normalizeDigits(pinValue),
        endpoint ?? null,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (scanOpen) {
    return (
      <QrScannerScreen
        lang={l}
        onClose={() => setScanOpen(false)}
        onScanned={(p, c, e) => void submitScanned(p, c, e)}
      />
    );
  }

  const helpSteps = [t(l, "help1"), t(l, "help2"), t(l, "help3")];

  return (
    <LinearGradient
      colors={GRADIENTS.heroDeep}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: SPACE.xl, flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Bandeau supérieur : réassurance + langue */}
          <View
            style={{
              flexDirection: flow(rtl ? "rtl" : "ltr"),
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: SPACE.xl,
            }}
          >
            <View
              style={{
                flexDirection: flow(rtl ? "rtl" : "ltr"),
                alignItems: "center",
                gap: 6,
                backgroundColor: tint(COLORS.headerAccent, "1A"),
                borderRadius: RADIUS.pill,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Ionicons name="shield-checkmark" size={13} color={COLORS.headerAccent} />
              <Text style={{ color: COLORS.headerAccent, fontSize: 11, fontWeight: "700" }}>
                {t(l, "fastSecure")}
              </Text>
            </View>
            <View
              style={{
                flexDirection: flow(rtl ? "rtl" : "ltr"),
                backgroundColor: tint(COLORS.white, "14"),
                borderRadius: RADIUS.pill,
                padding: 3,
              }}
            >
              {(["ar", "fr"] as const).map((x) => (
                <Tap
                  key={x}
                  onPress={() => props.onLang(x)}
                  accessibilityLabel={x === "ar" ? "عربي" : "Français"}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: l === x ? COLORS.primary : "transparent",
                    borderRadius: RADIUS.pill,
                  }}
                >
                  <Text
                    style={{
                      color: l === x ? COLORS.primaryText : COLORS.headerText,
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    {x === "ar" ? "عربي" : "FR"}
                  </Text>
                </Tap>
              ))}
            </View>
          </View>

          {/* Marque */}
          <View style={{ alignItems: "center", marginBottom: SPACE.xl }}>
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require("../../assets/brand/veloria-customer.png")}
              style={{ width: 104, height: 104, borderRadius: 28 }}
              accessibilityLabel="Veloria"
            />
            <Text
              style={{
                fontSize: 32,
                fontWeight: "900",
                color: COLORS.white,
                marginTop: SPACE.md,
                letterSpacing: 0.5,
              }}
            >
              Veloria
            </Text>
            <Text style={{ color: COLORS.navyMuted, marginTop: 2, fontSize: 13 }}>
              {t(l, "clientSpace")}
            </Text>
          </View>

          {/* Carte de connexion */}
          <View
            style={[
              {
                backgroundColor: COLORS.cardBg,
                borderRadius: RADIUS.sheet,
                padding: SPACE.xl,
                gap: SPACE.sm,
              },
              SHADOW.raised,
            ]}
          >
            <Text
              style={{
                color: COLORS.cardMuted,
                fontWeight: "700",
                fontSize: 13,
                textAlign: rtl ? "right" : "left",
                marginBottom: 2,
              }}
            >
              {t(l, "phoneLabel")}
            </Text>
            <View
              style={{
                backgroundColor: COLORS.contentBg,
                borderRadius: RADIUS.field,
                borderWidth: 1.5,
                borderColor: COLORS.border,
                flexDirection: flow(rtl ? "rtl" : "ltr"),
                alignItems: "center",
                paddingHorizontal: SPACE.md,
                gap: SPACE.sm,
              }}
            >
              <Ionicons name="call-outline" size={18} color={COLORS.cardMuted} />
              <View
                style={{
                  backgroundColor: COLORS.cardBg,
                  borderRadius: RADIUS.pill,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ fontWeight: "800", color: COLORS.cardText, fontSize: 13 }}>
                  +213
                </Text>
              </View>
              <TextInput
                value={phone}
                onChangeText={(v) => setPhone(normalizeDigits(v))}
                keyboardType="phone-pad"
                maxLength={30}
                placeholder="05…"
                placeholderTextColor={COLORS.cardMuted}
                aria-label={t(l, "phoneLabel")}
                returnKeyType="next"
                onSubmitEditing={() => pinRef.current?.focus()}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  fontSize: 18,
                  minHeight: SIZES.touchMin,
                  fontFamily: "monospace",
                  textAlign: rtl ? "right" : "left",
                  color: COLORS.cardText,
                }}
              />
            </View>

            <View
              style={{
                flexDirection: flow(rtl ? "rtl" : "ltr"),
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: SPACE.sm,
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  color: COLORS.cardText,
                  fontWeight: "700",
                  fontSize: 13,
                  textAlign: rtl ? "right" : "left",
                }}
              >
                {t(l, "pinLabel")}
              </Text>
              <Tap
                onPress={() => setShowPin((s) => !s)}
                accessibilityLabel={showPin ? t(l, "hidePin") : t(l, "showPin")}
                style={{
                  flexDirection: flow(rtl ? "rtl" : "ltr"),
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 4,
                  paddingHorizontal: 6,
                }}
              >
                <Ionicons
                  name={showPin ? "eye-off-outline" : "eye-outline"}
                  size={15}
                  color={COLORS.cardMuted}
                />
                <Text style={{ color: COLORS.cardMuted, fontWeight: "700", fontSize: 12 }}>
                  {showPin ? t(l, "hidePin") : t(l, "showPin")}
                </Text>
              </Tap>
            </View>

            {/* PIN : les cases affichent, un seul champ invisible capte le clavier. */}
            <Tap onPress={() => pinRef.current?.focus()}>
              <PinBoxes pin={pin} lang={l} revealed={showPin} />
            </Tap>
            <TextInput
              ref={pinRef}
              value={pin}
              onChangeText={(v) =>
                setPin(
                  normalizeDigits(v)
                    .replace(/[^0-9]/g, "")
                    .slice(0, 6),
                )
              }
              keyboardType="number-pad"
              maxLength={6}
              secureTextEntry={!showPin}
              aria-label={t(l, "pinLabel")}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              style={{ height: 1, opacity: 0 }}
            />

            {props.error ? (
              <View
                style={{
                  backgroundColor: COLORS.dangerBg,
                  borderRadius: RADIUS.field,
                  borderWidth: 1,
                  borderColor: tint(COLORS.debtOverdue, "40"),
                  padding: SPACE.md,
                  marginTop: SPACE.xs,
                  flexDirection: flow(rtl ? "rtl" : "ltr"),
                  alignItems: "center",
                  gap: SPACE.sm,
                }}
              >
                <Ionicons name="alert-circle" size={18} color={COLORS.debtOverdue} />
                <Text style={{ color: COLORS.dangerText, fontWeight: "700", flex: 1 }}>
                  {props.error}
                </Text>
              </View>
            ) : null}

            <Button
              label={busy ? t(l, "loading") : t(l, "enter")}
              variant="gold"
              size="lg"
              busy={busy}
              icon="log-in-outline"
              onPress={() => void submit()}
              style={{ marginTop: SPACE.sm }}
            />

            <View style={{ gap: SPACE.sm, marginTop: SPACE.xs }}>
              <Button
                label={t(l, "scanQr")}
                variant="outline"
                icon="qr-code-outline"
                onPress={() => setScanOpen(true)}
              />
              <Button
                label={t(l, "requestCode")}
                variant="ghost"
                icon="logo-whatsapp"
                onPress={() =>
                  void Linking.openURL(
                    `https://wa.me/?text=${encodeURIComponent(t(l, "newPinRequest"))}`,
                  ).catch(() => undefined)
                }
              />
            </View>
          </View>

          {/* Aide 3 étapes */}
          <View
            style={{
              marginTop: SPACE.lg,
              backgroundColor: tint(COLORS.white, "0F"),
              borderRadius: RADIUS.card,
              borderWidth: 1,
              borderColor: tint(COLORS.white, "1A"),
              padding: SPACE.lg,
            }}
          >
            <View
              style={{
                flexDirection: flow(rtl ? "rtl" : "ltr"),
                alignItems: "center",
                gap: 6,
                marginBottom: SPACE.xs,
              }}
            >
              <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: "800", fontSize: 13 }}>
                {t(l, "firstSteps")}
              </Text>
            </View>
            {helpSteps.map((s, i) => (
              <HelpStep key={s} index={i + 1} text={s} dir={rtl ? "rtl" : "ltr"} />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
