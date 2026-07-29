/**
 * Profile — settings, subscription, logout
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet, Image, Linking } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";

import { useAuth, apiFetch } from "@/src/auth";
import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { Card, ThemedText, HeaderGradient, PrimaryButton, SecondaryButton, GhostButton, Chip } from "@/src/ui";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { colors, t, setLang, lang, setScheme, schemePref } = useTheme();
  const insets = useSafeAreaInsets();
  const [sub, setSub] = useState<any>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ subscription: any }>("/subscription");
      setSub(r.subscription);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const subscribe = async (plan: "pro" | "family") => {
    setCheckingOut(plan);
    try {
      const origin = typeof window !== "undefined" && (window as any).location ? (window as any).location.origin : process.env.EXPO_PUBLIC_BACKEND_URL;
      const r = await apiFetch<{ checkout_url: string; session_id: string }>("/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, origin_url: origin }),
      });
      await WebBrowser.openBrowserAsync(r.checkout_url);
      // give a moment then refresh
      setTimeout(async () => {
        try {
          await apiFetch(`/stripe/session/${r.session_id}`);
        } catch {}
        await load();
      }, 2000);
    } catch (e: any) {
      alert("Checkout failed: " + (e?.message || "unknown"));
    } finally {
      setCheckingOut(null);
    }
  };

  const plan = sub?.plan || "free";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="profile-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <HeaderGradient>
          <SafeAreaView edges={["top"]}>
            <View style={{ alignItems: "center", gap: 12, marginTop: 8 }}>
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={{ width: 84, height: 84, borderRadius: 42 }} />
              ) : (
                <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
                  <ThemedText weight="500" size={30} color={colors.onBrandPrimary}>{(user?.name || user?.email || "?")[0].toUpperCase()}</ThemedText>
                </View>
              )}
              <View style={{ alignItems: "center" }}>
                <ThemedText weight="500" size={22}>{user?.name || user?.email}</ThemedText>
                <ThemedText size={13} color={colors.onSurfaceTertiary}>{user?.email}</ThemedText>
              </View>
            </View>
          </SafeAreaView>
        </HeaderGradient>

        <View style={{ padding: 20, gap: 16 }}>
          {/* Subscription plans */}
          <Card testID="profile-subs-card">
            <ThemedText weight="500" size={17}>{t("sub.title")}</ThemedText>
            <ThemedText size={12} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>{t("profile.current_plan")}: {plan.toUpperCase()}</ThemedText>

            <View style={{ marginTop: 14, gap: 10 }}>
              <PlanCard
                testID="plan-free"
                title="Free"
                price="$0"
                period=""
                features={["1 nutrition plan", "7 days", "Basic recipes", "Limited AI Chat"]}
                active={plan === "free"}
              />
              <PlanCard
                testID="plan-pro"
                title="Pro"
                price="$9.99"
                period={t("sub.month")}
                features={["Unlimited plans", "Unlimited AI Chat", "Food Scanner", "Blood Test Analysis", "PDF export"]}
                active={plan === "pro"}
                onSubscribe={() => subscribe("pro")}
                loading={checkingOut === "pro"}
                highlight
              />
              <PlanCard
                testID="plan-family"
                title="Family"
                price="$19.99"
                period={t("sub.month")}
                features={["Everything in Pro", "Up to 6 profiles", "Shared grocery lists", "Family dashboard"]}
                active={plan === "family"}
                onSubscribe={() => subscribe("family")}
                loading={checkingOut === "family"}
              />
            </View>
          </Card>

          {/* Settings */}
          <Card>
            <ThemedText weight="500" size={17}>{t("profile.settings")}</ThemedText>

            <View style={{ marginTop: 14, gap: 14 }}>
              <View>
                <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("profile.language")}</ThemedText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Chip testID="lang-en" label="English" active={lang === "en"} onPress={() => setLang("en")} />
                  <Chip testID="lang-ru" label="Русский" active={lang === "ru"} onPress={() => setLang("ru")} />
                </View>
              </View>
              <View>
                <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("profile.theme")}</ThemedText>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                  <Chip testID="theme-light" label="Light" active={schemePref === "light"} onPress={() => setScheme("light")} />
                  <Chip testID="theme-dark" label="Dark" active={schemePref === "dark"} onPress={() => setScheme("dark")} />
                  <Chip testID="theme-system" label="System" active={schemePref === "system"} onPress={() => setScheme("system")} />
                </View>
              </View>
            </View>
          </Card>

          <TouchableOpacity
            testID="logout-btn"
            onPress={async () => { await logout(); router.replace("/"); }}
            style={{ padding: 16, borderRadius: RADIUS.pill, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}
          >
            <ThemedText weight="500" size={15} color={colors.error}>{t("profile.logout")}</ThemedText>
          </TouchableOpacity>

          <ThemedText size={11} color={colors.onSurfaceTertiary} style={{ textAlign: "center", marginTop: 12 }}>
            NutriFlow AI · v1.0 · Not medical advice
          </ThemedText>
        </View>
      </ScrollView>
    </View>
  );
}

function PlanCard({ testID, title, price, period, features, active, onSubscribe, loading, highlight }: {
  testID?: string; title: string; price: string; period: string; features: string[]; active: boolean; onSubscribe?: () => void; loading?: boolean; highlight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        padding: 16,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: highlight ? colors.brandPrimary : colors.border,
        backgroundColor: highlight ? colors.brandTertiary : colors.surfaceTertiary,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View>
          <ThemedText weight="500" size={18} color={highlight ? colors.onBrandTertiary : colors.onSurface}>{title}</ThemedText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
            <ThemedText weight="500" size={26} color={highlight ? colors.onBrandTertiary : colors.onSurface}>{price}</ThemedText>
            <ThemedText size={13} color={colors.onSurfaceTertiary}>{period}</ThemedText>
          </View>
        </View>
        {active ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.brandPrimary, borderRadius: 999 }}>
            <ThemedText size={11} weight="500" color={colors.onBrandPrimary}>ACTIVE</ThemedText>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 6, marginTop: 10 }}>
        {features.map((f, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.brandPrimary} />
            <ThemedText size={13} color={colors.onSurfaceSecondary}>{f}</ThemedText>
          </View>
        ))}
      </View>
      {onSubscribe && !active ? (
        <TouchableOpacity
          testID={`${testID}-cta`}
          onPress={onSubscribe}
          disabled={loading}
          style={{ marginTop: 12, backgroundColor: colors.brandPrimary, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center" }}
        >
          <ThemedText weight="500" color={colors.onBrandPrimary}>{loading ? "Loading…" : "Subscribe"}</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
