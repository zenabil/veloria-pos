// Veloria Client — États vides + squelettes de chargement (V3).
// Un écran jamais blanc : squelette qui respire, vide avec icône + conseil.
import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACE, TYPE, tint } from "../tokens.ts";
import { IconBubble, type IconName } from "./kit.tsx";

/** Bloc squelette animé (pulsation douce, pas de spinner global). */
export function Skeleton(props: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        {
          height: props.height ?? 18,
          width: props.width ?? "100%",
          borderRadius: props.radius ?? 10,
          backgroundColor: COLORS.border,
          opacity: pulse,
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
}): React.JSX.Element {
  const count = props.count ?? 3;
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
