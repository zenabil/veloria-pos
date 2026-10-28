// Veloria Client — États vides + squelettes de chargement (V4 plat).
// Un écran jamais blanc : squelette statique, vide avec icône + conseil.
// NOTE crash APK 2026-10-04 : pas de nœud Animated dans les styles
// (même cause que Tap : Map native au lieu de double) — squelette fixe.
import { Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { COLORS, HAIRLINE, RADIUS, SPACE, TYPE } from "../tokens.ts";
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
          height: props.height ?? 16,
          width: props.width ?? "100%",
          borderRadius: props.radius ?? RADIUS.inner,
          backgroundColor: COLORS.gray200,
        },
        props.style,
      ]}
    />
  );
}

/** Pile de squelettes : une surface à filet (comme les groupes réels). */
export function SkeletonList(props: {
  count?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  bare?: boolean;
}): React.JSX.Element {
  const count = props.count ?? 3;
  const rows = (
    <View style={{ gap: SPACE.md }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ gap: SPACE.sm }}>
          <Skeleton height={14} width="45%" />
          <Skeleton height={18} width="70%" />
          <Skeleton height={12} width="30%" />
        </View>
      ))}
    </View>
  );
  if (props.bare === true) return <View style={props.style}>{rows}</View>;
  return (
    <View
      style={[
        {
          backgroundColor: COLORS.cardBg,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
          ...HAIRLINE,
        },
        props.style,
      ]}
    >
      {rows}
    </View>
  );
}

/** État vide : pastille icône + titre + conseil d'action. */
export function EmptyState(props: {
  icon: IconName;
  title: string;
  hint?: string;
  tone?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  const tone = props.tone ?? COLORS.cardMuted;
  return (
    <View
      style={{
        alignItems: "center",
        paddingVertical: SPACE.xxl,
        paddingHorizontal: SPACE.xl,
        gap: SPACE.sm,
      }}
    >
      <IconBubble icon={props.icon} color={tone} size={56} bg={COLORS.toneBg} />
      <Text
        style={{
          ...TYPE.headline,
          color: COLORS.cardText,
          marginTop: SPACE.sm,
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
            textAlign: "center",
            lineHeight: 18,
          }}
        >
          {props.hint}
        </Text>
      ) : null}
      {props.children}
    </View>
  );
}
