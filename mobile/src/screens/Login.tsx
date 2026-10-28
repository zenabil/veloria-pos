// Veloria Client — Écran 01 : connexion V4 « Daylight plat ».
// Écran d'encre plate (plus de dégradé), feuille blanche à angle resserré,
// PIN sans halo, aide en bloc `navySoft`. Logique inchangée : téléphone +
// PIN 6 chiffres, erreurs mappées côté App, scan QR (ADR-054/068) et demande
// de code WhatsApp préservés — ni les textes ni les aria-label ne bougent.
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
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACE, tint } from "../tokens.ts";
import { t, type Lang } from "../i18n.ts";
import { normalizeDigits } from "../format.ts";
import { Button, Field, flow, farEdge, Tap } from "../ui/kit.tsx";
import { QrScannerScreen } from "./QrScanner.tsx";

/** Libellé du PIN : même rythme que les labels de `Field`. */
const PIN_LABEL_STYLE = { fontSize: 12, lineHeight: 16, fontWeight: "700" } as const;

/** Cases de PIN : l'état actif se lit au filet, plus à l'ombre portée. */
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
              minHeight: 52,
              borderRadius: RADIUS.field,
              backgroundColor: active ? COLORS.cardBg : COLORS.sunkenBg,
              borderWidth: active ? 2 : 1,
              borderColor: active ? COLORS.primary : filled ? COLORS.gray300 : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.cardText }}>
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
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: COLORS.navyLine,
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
  // Garde anti double-envoi : l'état React `busy` n'est pas encore vrai au
  // moment du second tap (même frame) — le ref, si.
  const busyRef = useRef(false);
  const [showPin, setShowPin] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const l = props.lang;
  const rtl = l === "ar";
  const dir = rtl ? "rtl" : "ltr";

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
    <View style={{ flex: 1, backgroundColor: COLORS.headerBg }}>
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
              flexDirection: flow(dir),
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: SPACE.xl,
            }}
          >
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                gap: 6,
                backgroundColor: COLORS.navySoft,
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
                flexDirection: flow(dir),
                backgroundColor: COLORS.navySoft,
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
                    minHeight: 36,
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
              style={{ width: 96, height: 96, borderRadius: RADIUS.card }}
              accessibilityLabel="Veloria"
            />
            <Text
              style={{
                fontSize: 28,
                lineHeight: 34,
                fontWeight: "800",
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

          {/* Feuille de connexion : une surface, pas d'ombre portée. */}
          <View
            style={{
              backgroundColor: COLORS.cardBg,
              borderRadius: RADIUS.sheet,
              padding: SPACE.xl,
              gap: SPACE.sm,
            }}
          >
            <Field
              label={t(l, "phoneLabel")}
              value={phone}
              onChangeText={(v) => setPhone(normalizeDigits(v))}
              placeholder="05…"
              lang={l}
              prefix="+213"
              icon="call-outline"
              keyboardType="phone-pad"
              maxLength={30}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
              ariaLabel={t(l, "phoneLabel")}
            />

            <View
              style={{
                flexDirection: flow(dir),
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: SPACE.sm,
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  ...PIN_LABEL_STYLE,
                  color: COLORS.cardMuted,
                  textAlign: farEdge(rtl),
                }}
              >
                {t(l, "pinLabel")}
              </Text>
              <Tap
                onPress={() => setShowPin((s) => !s)}
                accessibilityLabel={showPin ? t(l, "hidePin") : t(l, "showPin")}
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 6,
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

            {/* PIN : les cases affichent, un seul champ invisible capte le
                clavier — et lui seul porte le libellé accessible (sinon deux
                nœuds homonymes dans l'arbre, ambigu au lecteur d'écran). */}
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
                  backgroundColor: COLORS.dangerTone,
                  borderRadius: RADIUS.inner,
                  borderWidth: 1,
                  borderColor: tint(COLORS.debtOverdue, "33"),
                  padding: SPACE.md,
                  marginTop: SPACE.xs,
                  flexDirection: flow(dir),
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
              full
              icon="log-in-outline"
              onPress={() => void submit()}
              style={{ marginTop: SPACE.sm }}
            />

            <View style={{ gap: SPACE.sm, marginTop: SPACE.xs }}>
              <Button
                label={t(l, "scanQr")}
                variant="outline"
                icon="qr-code-outline"
                full
                onPress={() => setScanOpen(true)}
              />
              <Button
                label={t(l, "requestCode")}
                variant="quiet"
                icon="logo-whatsapp"
                full
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
              backgroundColor: COLORS.navySoft,
              borderRadius: RADIUS.cardSm,
              borderWidth: 1,
              borderColor: COLORS.navyLine,
              padding: SPACE.lg,
            }}
          >
            <View
              style={{
                flexDirection: flow(dir),
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
              <HelpStep key={s} index={i + 1} text={s} dir={dir} />
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
