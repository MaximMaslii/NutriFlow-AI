/**
 * Shopping list view
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

import { apiFetch } from "@/src/auth";
import { useTheme, RADIUS } from "@/src/theme";
import { Card, ThemedText, HeaderGradient } from "@/src/ui";

const CAT_LABELS: Record<string, { label: string; icon: string }> = {
  vegetables: { label: "Vegetables", icon: "leaf" },
  fruit: { label: "Fruit", icon: "nutrition" },
  meat: { label: "Meat", icon: "restaurant" },
  fish: { label: "Fish", icon: "fish" },
  dairy: { label: "Dairy", icon: "egg" },
  grains: { label: "Grains", icon: "cafe" },
  frozen: { label: "Frozen", icon: "snow" },
  drinks: { label: "Drinks", icon: "water" },
  spices: { label: "Spices", icon: "sparkles" },
  cleaning: { label: "Cleaning", icon: "brush" },
  other: { label: "Other", icon: "cube" },
};

export default function ShoppingListScreen() {
  const { plan_id } = useLocalSearchParams<{ plan_id: string }>();
  const { colors, t } = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ categories: Record<string, any[]>; estimated_total_usd: number } | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!plan_id) return;
    setLoading(true);
    try {
      const r = await apiFetch<any>(`/meals/plan/${plan_id}/shopping-list`);
      setData(r);
    } catch {}
    setLoading(false);
  }, [plan_id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const cats = Object.keys(data?.categories || {}).sort();
  const totalItems = cats.reduce((n, c) => n + (data!.categories[c]?.length || 0), 0);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="shopping-list-screen">
      <HeaderGradient>
        <SafeAreaView edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity onPress={() => router.back()} testID="shopping-back-btn" style={{ padding: 4, marginLeft: -4 }}>
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </TouchableOpacity>
            <ThemedText weight="500" size={22}>{t("meals.shopping")}</ThemedText>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
            <View>
              <ThemedText size={13} color={colors.onSurfaceTertiary}>Items</ThemedText>
              <ThemedText weight="500" size={22}>{checkedCount} / {totalItems}</ThemedText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <ThemedText size={13} color={colors.onSurfaceTertiary}>Estimated total</ThemedText>
              <ThemedText weight="500" size={22} color={colors.brandPrimary}>${data?.estimated_total_usd?.toFixed(2)}</ThemedText>
            </View>
          </View>
        </SafeAreaView>
      </HeaderGradient>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom, gap: 16 }} showsVerticalScrollIndicator={false}>
        {cats.map((cat) => {
          const items = data!.categories[cat];
          const info = CAT_LABELS[cat] || { label: cat, icon: "cube" };
          return (
            <Card key={cat}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={info.icon as any} size={16} color={colors.onBrandSecondary} />
                </View>
                <ThemedText weight="500" size={16} style={{ textTransform: "capitalize" }}>{info.label}</ThemedText>
                <View style={{ flex: 1 }} />
                <ThemedText size={12} color={colors.onSurfaceTertiary}>{items.length}</ThemedText>
              </View>
              {items.map((it: any, i: number) => {
                const key = `${cat}-${it.name}-${i}`;
                const isChecked = !!checked[key];
                return (
                  <TouchableOpacity
                    key={key}
                    testID={`shopping-item-${key}`}
                    onPress={() => setChecked((c) => ({ ...c, [key]: !isChecked }))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border }}
                  >
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isChecked ? colors.brandPrimary : colors.borderStrong, backgroundColor: isChecked ? colors.brandPrimary : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {isChecked ? <Ionicons name="checkmark" size={14} color={colors.onBrandPrimary} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText size={14} weight="500" style={{ textDecorationLine: isChecked ? "line-through" : "none", opacity: isChecked ? 0.5 : 1 }}>{it.name}</ThemedText>
                      <ThemedText size={12} color={colors.onSurfaceTertiary}>{it.amount} {it.unit}</ThemedText>
                    </View>
                    <ThemedText size={13} color={colors.onSurfaceTertiary}>${it.est_cost?.toFixed(2)}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
