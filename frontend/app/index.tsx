/**
 * Landing / redirect gate.
 * - Not authed → landing (login / signup)
 * - Authed but not onboarded → onboarding
 * - Authed + onboarded → tabs home
 */
import React, { useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth } from "@/src/auth";
import { useTheme, SPACING } from "@/src/theme";
import { PrimaryButton, SecondaryButton, MacroRing, GlassCard, ThemedText } from "@/src/ui";

export default function Index() {
  const { user, loading } = useAuth();
  const { colors, scheme, t } = useTheme();

  useEffect(() => {
    if (loading) return;
    if (user) {
      if (user.onboarded) router.replace("/(tabs)");
      else router.replace("/onboarding");
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (user) return null;

  const gradTop = scheme === "dark" ? "#1A2C23" : "#D9E8E0";
  const gradMid = colors.surface;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <LinearGradient colors={[gradTop, gradMid]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="leaf" size={20} color={colors.onBrandPrimary} />
            </View>
            <ThemedText weight="500" size={17}>{t("app.name")}</ThemedText>
          </View>

          <View style={{ marginTop: 48 }}>
            <ThemedText weight="500" size={44} style={{ lineHeight: 50 }}>
              {t("app.tagline")}
            </ThemedText>
            <ThemedText size={16} color={colors.onSurfaceSecondary} style={{ marginTop: 16, lineHeight: 24 }}>
              {t("app.subtitle")}
            </ThemedText>
          </View>

          {/* Dashboard preview */}
          <View style={{ marginTop: 32, alignItems: "center" }}>
            <GlassCard style={{ width: "100%", padding: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
                <MacroRing size={90} strokeWidth={9} progress={0.72} color={colors.protein} label={t("dashboard.protein")} value="72%" />
                <MacroRing size={90} strokeWidth={9} progress={0.55} color={colors.water} label={t("dashboard.water")} value="55%" />
                <MacroRing size={90} strokeWidth={9} progress={0.83} color={colors.fat} label={t("dashboard.calories")} value="83%" />
              </View>
              <View style={{ marginTop: 20, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <ThemedText color={colors.onSurfaceTertiary} size={13}>{t("dashboard.health")}</ThemedText>
                  <ThemedText weight="500" size={13}>92 / 100</ThemedText>
                </View>
                <View style={{ height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ width: "92%", height: "100%", backgroundColor: colors.brandPrimary }} />
                </View>
              </View>
            </GlassCard>
          </View>

          {/* Feature bullets */}
          <View style={{ marginTop: 32, gap: 14 }}>
            {[
              { icon: "restaurant-outline", label: "AI-generated personalized meal plans" },
              { icon: "camera-outline", label: "Photo food scanner with instant macros" },
              { icon: "flask-outline", label: "Blood test analysis in plain language" },
              { icon: "chatbubbles-outline", label: "24/7 AI nutritionist chat" },
            ].map((f, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={f.icon as any} size={18} color={colors.onBrandSecondary} />
                </View>
                <ThemedText size={15} color={colors.onSurfaceSecondary} style={{ flex: 1 }}>{f.label}</ThemedText>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 40, gap: 12 }}>
            <PrimaryButton testID="landing-start-btn" title={t("cta.start_free")} onPress={() => router.push("/register")} />
            <SecondaryButton testID="landing-signin-btn" title={t("cta.sign_in")} onPress={() => router.push("/login")} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
