// Veloria Client — Écran 01 : connexion V5 « Connexion directe ».
// Le budget de la V5 est une hauteur d'écran SANS clavier : la marque passe en
// lockup horizontal, l'aide se replie, le téléphone déjà connu ouvre l'écran
// directement sur le PIN, et « دخول » se verrouille tant que le code n'a pas 6
// chiffres (plus d'appel réseau perdu) avec envoi automatique au 6e. Vocabulaire
// V4 conservé (ADR-150) : surfaces plates, filets, un seul accent or. Aucun
// texte existant, aucun `aria-label` existant ne bouge — ajout seul.
import { useEffect, useRef, useState } from "react";
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
import { COLORS, FONTS, RADIUS, SIZES, SPACE, TYPE, tint } from "../tokens.ts";
import { t, type Lang } from "../i18n.ts";
import { normalizeDigits } from "../format.ts";
import { Button, Field, flow, farEdge, haptic, Tap } from "../ui/kit.tsx";
import { QrScannerScreen } from "./QrScanner.tsx";

/** Cases de PIN : l'état actif se lit au filet + un caret doré (où je tape). */
function PinBoxes(props: { pin: string; lang: Lang; revealed: boolean }): React.JSX.Element {
  const cells = [0, 1, 2, 3, 4, 5].map((i) => props.pin[i] ?? "");
  const dir = flow(props.lang === "ar" ? "rtl" : "ltr");
  return (
    <View
      style={{ flexDirection: dir, gap: 8 }}
      // Les cases ne sont que du dessin : le seul nœud accessible du PIN est le
      // champ invisible posé dessus (deux libellés homonymes = ambiguïté).
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
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
            {filled ? (
              <Text
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 20,
                  fontWeight: "800",
                  color: COLORS.cardText,
                }}
              >
                {props.revealed ? c : "•"}
              </Text>
            ) : active ? (
              <View
                style={{
                  width: 2,
                  height: 22,
                  borderRadius: 1,
                  backgroundColor: COLORS.primary,
                }}
              />
            ) : null}
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
  /** Téléphone déjà connu (jamais le PIN) : ouvre l'écran posé sur le code. */
  rememberedPhone?: string;
}): React.JSX.Element {
  const remembered = (props.rememberedPhone ?? "").trim();
  const [phone, setPhone] = useState(remembered);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Garde anti double-envoi : l'état React `busy` n'est pas encore vrai au
  // moment du second tap (même frame) — le ref, si.
  const busyRef = useRef(false);
  const [showPin, setShowPin] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const l = props.lang;
  const rtl = l === "ar";
  const dir = rtl ? "rtl" : "ltr";

  const codeReady = pin.length === 6;
  const phoneReady = normalizeDigits(phone).trim() !== "";
  // Bord de LECTURE (droite en arabe) : le texte d'aide et le libellé replié
  // suivent leur icône, ils ne fuient pas vers le bord opposé.
  const startEdge = rtl ? ("right" as const) : ("left" as const);
  // Règle locale = règle du serveur (`assertCredentials`) : on ne grise le
  // bouton que sur ce que le miroir refuserait déjà (code incomplet).
  const canSubmit = phoneReady && codeReady;

  // Le refus du serveur se lit aussi dans la main (test micro-haptique :
  // l'erreur perçue est corrigée plus vite qu'une erreur seulement affichée).
  useEffect(() => {
    if (props.error !== null) haptic("warning");
  }, [props.error]);

  useEffect(
    () => () => {
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
    },
    [],
  );

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

  function onPinChange(v: string): void {
    const next = normalizeDigits(v)
      .replace(/[^0-9]/g, "")
      .slice(0, 6);
    if (next.length > pin.length) haptic("light");
    setPin(next);
    // Envoi automatique au 6e chiffre : le pattern d'une saisie PIN. Différé
    // d'un battement pour laisser la dernière case se peindre.
    if (next.length === 6 && phoneReady && !busyRef.current) {
      if (autoTimer.current !== null) clearTimeout(autoTimer.current);
      autoTimer.current = setTimeout(() => void submit(undefined, next), 140);
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
          contentContainerStyle={{ padding: SPACE.lg, flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Langue seule en tête : la réassurance « سريع ومحمي » descend en
              pied d'écran, une ligne de moins au-dessus de la feuille. */}
          <View
            style={{
              flexDirection: flow(dir),
              justifyContent: "flex-end",
              marginBottom: SPACE.md,
            }}
          >
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
                    minHeight: 44,
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

          {/* Marque en lockup : logo + nom posés côte à côte (−100 dp de haut). */}
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: SPACE.md,
              marginBottom: SPACE.xl,
            }}
          >
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              source={require("../../assets/brand/veloria-customer.png")}
              style={{ width: 60, height: 60, borderRadius: RADIUS.cardSm }}
              accessibilityLabel="Veloria"
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 24,
                  lineHeight: 30,
                  fontWeight: "800",
                  color: COLORS.white,
                  letterSpacing: 0.4,
                  textAlign: rtl ? "right" : "left",
                }}
              >
                Veloria
              </Text>
              <Text
                style={{
                  ...TYPE.caption,
                  color: COLORS.navyMuted,
                  marginTop: 1,
                  textAlign: rtl ? "right" : "left",
                }}
              >
                {t(l, "clientSpace")}
              </Text>
            </View>
          </View>

          {/* Feuille de connexion : une surface, pas d'ombre portée. */}
          <View
            style={{
              backgroundColor: COLORS.cardBg,
              borderRadius: RADIUS.sheet,
              paddingHorizontal: SPACE.xl,
              paddingVertical: SPACE.lg,
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
              trailing={
                phone === "" ? null : (
                  <Tap
                    onPress={() => {
                      setPhone("");
                      void pinRef.current?.focus();
                    }}
                    accessibilityLabel={t(l, "changeNumber")}
                    hitSlop={8}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name="close-circle" size={17} color={COLORS.cardMuted} />
                  </Tap>
                )
              }
            />

            <View
              style={{
                flexDirection: flow(dir),
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text style={{ ...TYPE.label, color: COLORS.cardMuted, textAlign: farEdge(rtl) }}>
                {t(l, "pinLabel")}
              </Text>
              <Tap
                onPress={() => setShowPin((s) => !s)}
                accessibilityLabel={showPin ? t(l, "hidePin") : t(l, "showPin")}
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 8,
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

            {/* PIN : les cases dessinent, le champ qui capte le clavier est posé
                PAR-DESSUS (opacité 0) : un tap n'importe où sur la rangée le
                met sous focus, et lui seul porte le libellé accessible. */}
            <View>
              <PinBoxes pin={pin} lang={l} revealed={showPin} />
              <TextInput
                ref={pinRef}
                value={pin}
                onChangeText={onPinChange}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry={!showPin}
                aria-label={t(l, "pinLabel")}
                autoCapitalize="none"
                returnKeyType="done"
                autoFocus={remembered !== ""}
                onSubmitEditing={() => void submit()}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  opacity: 0,
                  fontSize: 20,
                }}
              />
            </View>

            {/* Une ligne réservée : le CTA ne bouge pas quand le code se complète. */}
            <View style={{ minHeight: 16, marginTop: -2 }}>
              {!codeReady && (phoneReady || pin !== "") ? (
                <Text
                  style={{
                    ...TYPE.caption,
                    color: COLORS.cardMuted,
                    textAlign: startEdge,
                  }}
                >
                  {t(l, "pinIncomplete")}
                </Text>
              ) : null}
            </View>

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
                accessibilityLiveRegion="polite"
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
              disabled={!canSubmit}
              full
              icon="log-in-outline"
              onPress={() => void submit()}
              style={{ marginTop: SPACE.sm }}
            />

            <Button
              label={t(l, "scanQr")}
              variant="outline"
              icon="qr-code-outline"
              full
              onPress={() => setScanOpen(true)}
              style={{ marginTop: SPACE.xs }}
            />

            {/* Récupération d'un code : un lien, plus un bouton — le CTA doit
                rester la seule chose dorée de la feuille. */}
            <Tap
              onPress={() =>
                void Linking.openURL(
                  `https://wa.me/?text=${encodeURIComponent(t(l, "newPinRequest"))}`,
                ).catch(() => undefined)
              }
              accessibilityLabel={t(l, "requestCode")}
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                minHeight: 44,
                marginTop: SPACE.xs,
              }}
            >
              <Ionicons name="logo-whatsapp" size={15} color={COLORS.cardMuted} />
              <Text
                style={{
                  color: COLORS.cardMuted,
                  fontWeight: "700",
                  fontSize: 13,
                  textDecorationLine: "underline",
                }}
              >
                {t(l, "requestCode")}
              </Text>
            </Tap>
          </View>

          {/* Aide 3 étapes : repliée (−160 dp), elle ne mange plus la ligne de
              flottaison du bouton d'entrée. */}
          <Tap
            onPress={() => setHelpOpen((v) => !v)}
            accessibilityLabel={t(l, "firstSteps")}
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: 6,
              minHeight: SIZES.touchMin,
              marginTop: SPACE.lg,
              paddingHorizontal: SPACE.xs,
            }}
          >
            <Ionicons name="sparkles-outline" size={14} color={COLORS.primary} />
            <Text
              style={{
                color: COLORS.headerText,
                fontWeight: "800",
                fontSize: 13,
                flex: 1,
                textAlign: startEdge,
              }}
            >
              {t(l, "firstSteps")}
            </Text>
            <Ionicons
              name={helpOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={COLORS.navyMuted}
            />
          </Tap>
          {helpOpen ? (
            <View
              style={{
                marginTop: SPACE.sm,
                backgroundColor: COLORS.navySoft,
                borderRadius: RADIUS.cardSm,
                borderWidth: 1,
                borderColor: COLORS.navyLine,
                padding: SPACE.lg,
              }}
            >
              {helpSteps.map((s, i) => (
                <HelpStep key={s} index={i + 1} text={s} dir={dir} />
              ))}
            </View>
          ) : null}

          {/* Réassurance en pied : même message qu'avant, une ligne plus bas. */}
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginTop: SPACE.lg,
              marginBottom: SPACE.md,
            }}
          >
            <Ionicons name="shield-checkmark" size={13} color={COLORS.headerAccent} />
            <Text style={{ color: COLORS.headerAccent, fontSize: 11, fontWeight: "700" }}>
              {t(l, "fastSecure")}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
