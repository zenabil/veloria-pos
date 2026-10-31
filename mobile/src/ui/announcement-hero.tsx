// Veloria Client — Bandeau hero des annonces du magasin (ADR-166).
// Jusqu'à 4 annonces : image (lien https) et/ou texte, avec compte à rebours
// d'expiration. Une image qui ne charge pas retombe sur le texte ; sans texte
// elle disparaît (jamais une carte vide). Aucun accès réseau propre : la
// liste vient du cliché déjà synchronisé.
import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { Icon } from "./Icon.tsx";
import { flow, Tap } from "./kit.tsx";
import { COLORS, HAIRLINE, RADIUS, SHADOW, SPACE } from "../tokens.ts";
import { direction, t, type Lang } from "../i18n.ts";
import { announcementRemainingLabel, liveAnnouncements, type HomeAnnouncement } from "../views.ts";

export function AnnouncementHero(props: {
  ads: HomeAnnouncement[];
  lang: Lang;
}): React.JSX.Element | null {
  const dir = direction(props.lang);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  // Le compte à rebours se rafraîchit chaque minute (aucun minuteur par annonce).
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const live = liveAnnouncements(props.ads, nowMs).filter(
    (a) => a.text != null || (a.imageUrl != null && !broken[String(a.id)]),
  );
  if (live.length === 0) return null;
  const safeIndex = Math.min(index, live.length - 1);
  const ad = live[safeIndex];
  if (!ad) return null;

  const remaining = announcementRemainingLabel(props.lang, ad.endsAt, nowMs);
  const showImage = ad.imageUrl != null && !broken[String(ad.id)];
  const label = `${t(props.lang, "announcement")}: ${ad.text ?? ""}${
    remaining != null ? ` — ${remaining}` : ""
  }`;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        marginTop: SPACE.md,
        backgroundColor: COLORS.cardBg,
        borderRadius: RADIUS.cardSm,
        overflow: "hidden",
        ...HAIRLINE,
        ...SHADOW.card,
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: ad.imageUrl ?? "" }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          onError={() => setBroken((prev) => ({ ...prev, [String(ad.id)]: true }))}
          style={{ width: "100%", aspectRatio: 2, backgroundColor: COLORS.toneBg }}
        />
      ) : null}
      <View
        style={{
          flexDirection: flow(dir),
          alignItems: "flex-start",
          gap: SPACE.sm,
          padding: SPACE.md,
        }}
      >
        {showImage ? null : <Icon name="megaphone-outline" size={17} color={COLORS.debtOk} />}
        <View style={{ flex: 1, gap: 3 }}>
          {ad.text ? (
            <Text
              style={{
                color: COLORS.announcementText,
                fontWeight: "600",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {ad.text}
            </Text>
          ) : null}
          {remaining ? (
            <View style={{ flexDirection: flow(dir), alignItems: "center", gap: 4 }}>
              <Icon name="time-outline" size={12} color={COLORS.cardMuted} />
              <Text style={{ color: COLORS.cardMuted, fontSize: 11, fontWeight: "700" }}>
                {remaining}
              </Text>
            </View>
          ) : null}
        </View>
        {live.length > 1 ? (
          <View
            style={{
              flexDirection: flow(dir),
              alignItems: "center",
              gap: 6,
              alignSelf: "center",
            }}
          >
            {live.map((a, i) => (
              <Tap
                key={`ad-${a.id}-${i}`}
                onPress={() => setIndex(i)}
                hitSlop={8}
                accessibilityLabel={`${t(props.lang, "announcement")} ${i + 1}/${live.length}`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: i === safeIndex ? COLORS.primary : COLORS.navyLine,
                }}
              >
                <View />
              </Tap>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
