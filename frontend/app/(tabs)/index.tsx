/**
 * Dashboard — Home tab. Body analysis, macro rings, habits, streaks.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { useAuth, apiFetch } from "@/src/auth";
import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { Card, MacroRing, ThemedText, HeaderGradient, PrimaryButton } from "@/src/ui";

type Analysis = {
  bmi: number; bmi_category: string;
  calories: number; protein_g: number; fat_g: number; carbs_g: number; fiber_g: number; water_l: number;
  target_weight_kg: number; estimated_finish: string;
  metabolism_score: number; nutrition_score: number; hydration_score: number; health_score: number;
};

export default function DashboardScreen() {
  const { user } = useAuth();
  const { colors, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [habits, setHabits] = useState<{ logs: any[]; streak: number }>({ logs: [], streak: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [waterAdded, setWaterAdded] = useState(0);

  const load = useCallback(async () => {
    try {
      const a = await apiFetch<{ analysis: Analysis }>("/analysis/body");
      setAnalysis(a.analysis);
      const h = await apiFetch<any>("/habits");
      setHabits({ logs: h.logs || [], streak: h.streak || 0 });
      const today = new Date().toISOString().slice(0, 10);
      const todayLog = (h.logs || []).find((l: any) => l.date === today);
      setWaterAdded(todayLog?.water_ml || 0);
    } catch (e) {
      console.log("dashboard load", e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addWater = async (amount: number) => {
    const newTotal = waterAdded + amount;
    setWaterAdded(newTotal);
    try {
      await apiFetch("/habits/log", { method: "POST", body: JSON.stringify({ water_ml: newTotal }) });
      const h = await apiFetch<any>("/habits");
      setHabits({ logs: h.logs || [], streak: h.streak || 0 });
    } catch (e) { /* ignore */ }
  };

  const waterTargetMl = Math.round(((analysis?.water_l ?? 2.5) * 1000));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="dashboard-screen">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <HeaderGradient>
          <SafeAreaView edges={["top"]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.today")}</ThemedText>
                <ThemedText weight="500" size={28} style={{ marginTop: 2 }}>{user?.name || "You"}</ThemedText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.pill }}>
                <Ionicons name="flame" size={16} color={colors.warning} />
                <ThemedText weight="500" size={13}>{habits.streak} {t("dashboard.streak")}</ThemedText>
              </View>
            </View>
          </SafeAreaView>
        </HeaderGradient>

        {analysis && (
          <View style={{ padding: 20, gap: 16 }}>
            {/* Macro rings hero */}
            <Card testID="dashboard-macro-card">
              <ThemedText weight="500" size={17}>Your Targets</ThemedText>
              <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 2 }}>Daily macronutrient goals</ThemedText>
              <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 20 }}>
                <MacroRing testID="ring-calories" size={100} strokeWidth={10} progress={0.6} color={colors.brandPrimary} label={t("dashboard.calories")} value={`${analysis.calories}`} />
                <MacroRing testID="ring-protein" size={100} strokeWidth={10} progress={0.7} color={colors.protein} label={t("dashboard.protein")} value={`${analysis.protein_g}g`} />
                <MacroRing testID="ring-carbs" size={100} strokeWidth={10} progress={0.5} color={colors.carbs} label={t("dashboard.carbs")} value={`${analysis.carbs_g}g`} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.fat")}</ThemedText>
                  <ThemedText weight="500" size={17}>{analysis.fat_g}g</ThemedText>
                </View>
                <View style={{ alignItems: "center" }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.fiber")}</ThemedText>
                  <ThemedText weight="500" size={17}>{analysis.fiber_g}g</ThemedText>
                </View>
                <View style={{ alignItems: "center" }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.water")}</ThemedText>
                  <ThemedText weight="500" size={17}>{analysis.water_l}L</ThemedText>
                </View>
                <View style={{ alignItems: "center" }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.bmi")}</ThemedText>
                  <ThemedText weight="500" size={17}>{analysis.bmi}</ThemedText>
                </View>
              </View>
            </Card>

            {/* Scores */}
            <Card>
              <ThemedText weight="500" size={17}>{t("dashboard.scores")}</ThemedText>
              <View style={{ gap: 12, marginTop: 14 }}>
                {[
                  { label: t("dashboard.metabolism"), value: analysis.metabolism_score, color: colors.brandPrimary },
                  { label: t("dashboard.nutrition"), value: analysis.nutrition_score, color: colors.protein },
                  { label: t("dashboard.hydration"), value: analysis.hydration_score, color: colors.water },
                  { label: t("dashboard.health"), value: analysis.health_score, color: colors.success },
                ].map((s) => (
                  <View key={s.label}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <ThemedText size={14} color={colors.onSurfaceSecondary}>{s.label}</ThemedText>
                      <ThemedText size={14} weight="500">{s.value} / 100</ThemedText>
                    </View>
                    <View style={{ height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden" }}>
                      <View style={{ width: `${s.value}%`, height: "100%", backgroundColor: s.color }} />
                    </View>
                  </View>
                ))}
              </View>
            </Card>

            {/* Target */}
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.target")}</ThemedText>
                  <ThemedText weight="500" size={26}>{analysis.target_weight_kg} kg</ThemedText>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <ThemedText size={13} color={colors.onSurfaceTertiary}>{t("dashboard.finish")}</ThemedText>
                  <ThemedText weight="500" size={15}>{analysis.estimated_finish}</ThemedText>
                </View>
              </View>
            </Card>

            {/* Water quick add */}
            <Card testID="dashboard-water-card">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <ThemedText weight="500" size={17}>{t("dashboard.water")}</ThemedText>
                  <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 2 }}>
                    {waterAdded} / {waterTargetMl} ml
                  </ThemedText>
                  <View style={{ height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
                    <View style={{ width: `${Math.min(100, (waterAdded / waterTargetMl) * 100)}%`, height: "100%", backgroundColor: colors.water }} />
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                {[250, 500, 750].map((ml) => (
                  <TouchableOpacity
                    key={ml}
                    testID={`water-add-${ml}`}
                    onPress={() => addWater(ml)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: colors.brandSecondary, alignItems: "center" }}
                  >
                    <ThemedText size={14} weight="500" color={colors.onBrandSecondary}>+{ml}ml</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            {/* Quick actions */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity testID="dash-meals-btn" onPress={() => router.push("/(tabs)/meals")} style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                <Ionicons name="restaurant" size={22} color={colors.brandPrimary} />
                <ThemedText weight="500" size={15} style={{ marginTop: 8 }}>{t("meals.title")}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity testID="dash-scan-btn" onPress={() => router.push("/(tabs)/scan")} style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                <Ionicons name="scan" size={22} color={colors.brandPrimary} />
                <ThemedText weight="500" size={15} style={{ marginTop: 8 }}>{t("scan.title")}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity testID="dash-chat-btn" onPress={() => router.push("/(tabs)/chat")} style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                <Ionicons name="chatbubbles" size={22} color={colors.brandPrimary} />
                <ThemedText weight="500" size={15} style={{ marginTop: 8 }}>{t("chat.title")}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
