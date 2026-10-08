// Veloria Client — États vides + squelettes de chargement (V3).
// Un écran jamais blanc : squelette statique, vide avec icône + conseil.
// NOTE crash APK 2026-10-04 : pas de nœud Animated dans les styles
// (même cause que Tap : Map native au lieu de double) — squelette fixe.
import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACE, TYPE, tint } from "../tokens.ts";
import { IconBubble, type IconName } from "./kit.tsx";

/** Bloc squelette (fixe, jamais d'écran blanc). */
export function Skeleton(props: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View
      style={[
        {
          height: props.height ?? 18,
          width: props.width ?? "100%",
          borderRadius: props.radius ?? 10,
          backgroundColor: COLORS.border,
          opacity: 0.7,
        },
        props.style,
      ]}
    />
  );
}

/** Pile de squelettes (liste factures / paiements). */
export function SkeletonList(props: {
  count?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  bare?: boolean;
}): React.JSX.Element {
  const count = props.count ?? 3;
  if (props.bare === true) {
    return (
      <View style={[{ gap: SPACE.sm }, props.style]}>
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={{ gap: SPACE.sm }}>
            <Skeleton height={14} width="45%" />
            <Skeleton height={22} width="70%" />
            <Skeleton height={12} width="30%" />
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={[{ gap: SPACE.sm }, props.style]}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: COLORS.cardBg,
            borderRadius: RADIUS.cardSm,
            padding: SPACE.lg,
            gap: SPACE.sm,
            borderWidth: 1,
            borderColor: tint(COLORS.headerBg, "0D"),
          }}
        >
          <Skeleton height={14} width="45%" />
          <Skeleton height={22} width="70%" />
          <Skeleton height={12} width="30%" />
        </View>
      ))}
    </View>
  );
}

/** État vide : cercle icône + titre + conseil d'action. */
export function EmptyState(props: {
  icon: IconName;
  title: string;
  hint?: string;
  tone?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const tone = props.tone ?? COLORS.cardMuted;
  return (
    <View style={{ alignItems: "center", paddingVertical: SPACE.xxl, paddingHorizontal: SPACE.xl }}>
      <IconBubble icon={props.icon} color={tone} size={64} />
      <Text
        style={{
          ...TYPE.headline,
          color: COLORS.cardText,
          marginTop: SPACE.lg,
          textAlign: "center",
        }}
      >
        {props.title}
      </Text>
      {props.hint ? (
        <Text
          style={{
            ...TYPE.caption,
            color: COLORS.cardMuted,
            marginTop: SPACE.xs,
            textAlign: "center",
          }}
        >
          {props.hint}
        </Text>
      ) : null}
      {props.children}
    </View>
  );
}
