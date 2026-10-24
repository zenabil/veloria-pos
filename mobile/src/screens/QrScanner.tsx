// Veloria Client — Écran scan QR d'activation (ADR-054, design splash_login).
// Caméra active uniquement quand l'écran est monté ; un seul scan traité
// (garde anti double-déclenchement) ; QR invalide = message ar/fr, on reste.
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SIZES, SPACE, tint } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { flow } from "../ui/kit.tsx";
import { parseActivationQr, QrError } from "../qr.ts";

export function QrScannerScreen(props: {
  lang: Lang;
  onScanned: (
    phone: string,
    pin: string,
    endpoint?: { supabaseUrl: string; anonKey: string } | null,
  ) => void;
  onClose: () => void;
}): React.JSX.Element {
  const l = props.lang;
  const dir = direction(l);
  const [permission, requestPermission] = useCameraPermissions();
  const [denied, setDenied] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const locked = useRef(false);

  function handle(result: BarcodeScanningResult): void {
    if (locked.current) return;
    locked.current = true;
    try {
      const creds = parseActivationQr(result.data);
      props.onScanned(creds.phone, creds.pin, creds.endpoint);
    } catch (e) {
      if (e instanceof QrError) {
        setInvalid(true);
        locked.current = false;
      } else {
        props.onClose();
      }
    }
  }

  async function grant(): Promise<void> {
    try {
      const res = await requestPermission();
      setDenied(!res.granted);
    } catch {
      // Demande rejetée (rejet natif) : on reste sur l'invite (réessai +
      // fermeture possibles), jamais d'écran bloqué ni rejet non géré.
      setDenied(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.headerBg }}>
      {permission == null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: COLORS.headerText }}>{t(l, "loading")}</Text>
        </View>
      ) : !permission.granted || denied ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text
            style={{ color: COLORS.white, fontWeight: "800", fontSize: 17, textAlign: "center" }}
          >
            {t(l, "cameraNeed")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void grant()}
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: 16,
              minHeight: SIZES.touchMin,
              paddingHorizontal: 24,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 16,
            }}
          >
            <Text style={{ color: COLORS.primaryText, fontWeight: "800" }}>
              {t(l, "cameraGrant")}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            style={{ padding: 12, marginTop: 8 }}
          >
            <Text style={{ color: COLORS.headerText, fontWeight: "700" }}>{t(l, "close")}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handle}
          />
          {/* Cadre de visée à coins + barre haute */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: "26%",
              left: "14%",
              right: "14%",
              height: 230,
              borderRadius: RADIUS.cardSm,
              borderWidth: 3,
              borderColor: tint(COLORS.primary, "59"),
            }}
          >
            {(
              [
                { top: -3, left: -3, borderTopWidth: 4, borderLeftWidth: 4 },
                { top: -3, right: -3, borderTopWidth: 4, borderRightWidth: 4 },
                { bottom: -3, left: -3, borderBottomWidth: 4, borderLeftWidth: 4 },
                { bottom: -3, right: -3, borderBottomWidth: 4, borderRightWidth: 4 },
              ] as const
            ).map((corner, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  width: 34,
                  height: 34,
                  borderColor: COLORS.primary,
                  ...corner,
                }}
              />
            ))}
          </View>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              flexDirection: flow(dir),
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: SPACE.md,
              paddingVertical: SPACE.md,
              paddingTop: 40,
              backgroundColor: COLORS.overlay,
            }}
          >
            <Text
              style={{ color: COLORS.white, fontWeight: "900", fontSize: 17, letterSpacing: 0.3 }}
            >
              {t(l, "scanQr")}
            </Text>
          </View>
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: COLORS.overlay,
              borderTopLeftRadius: RADIUS.sheet,
              borderTopRightRadius: RADIUS.sheet,
              padding: SPACE.lg,
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 44,
                height: 5,
                borderRadius: 3,
                backgroundColor: tint(COLORS.white, "3D"),
                marginBottom: SPACE.md,
              }}
            />
            <View
              style={{
                flexDirection: flow(dir),
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <Ionicons name="qr-code-outline" size={18} color={COLORS.primary} />
              <Text style={{ color: COLORS.headerText, fontWeight: "700", fontSize: 13 }}>
                {t(l, "scanQr")}
              </Text>
            </View>
            {invalid ? (
              <View
                style={{
                  flexDirection: flow(dir),
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: tint(COLORS.debtOverdue, "26"),
                  borderRadius: RADIUS.pill,
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <Ionicons name="alert-circle" size={16} color={COLORS.dangerLight} />
                <Text style={{ color: COLORS.dangerLight, fontWeight: "800", fontSize: 12 }}>
                  {t(l, "qrError")}
                </Text>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={props.onClose}
              style={{
                backgroundColor: COLORS.cardBg,
                borderRadius: RADIUS.pill,
                padding: 14,
                alignItems: "center",
              }}
            >
              <Text style={{ color: COLORS.cardText, fontWeight: "800" }}>{t(l, "close")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
