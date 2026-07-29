/**
 * AI Chat + Blood Test Analysis
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

import { apiFetch, apiUpload } from "@/src/auth";
import { useTheme, SPACING, RADIUS } from "@/src/theme";
import { Card, ThemedText, HeaderGradient, Chip } from "@/src/ui";

type Message = { role: "user" | "assistant"; content: string; created_at?: string };

const SUGGESTIONS_EN = [
  "What should I eat after training?",
  "How can I lower sugar intake?",
  "Suggest cheap high-protein meals",
  "Analyze my blood test",
];
const SUGGESTIONS_RU = [
  "Что съесть после тренировки?",
  "Как снизить потребление сахара?",
  "Дешёвые блюда с высоким белком",
  "Проанализируй анализ крови",
];

export default function ChatScreen() {
  const { colors, t, lang } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bloodReport, setBloodReport] = useState<any | null>(null);
  const [bloodLoading, setBloodLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await apiFetch<{ messages: Message[] }>("/chat/history");
      setMessages(r.messages || []);
    } catch {}
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); }, [messages]);

  const send = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { role: "user", content: msg }]);
    try {
      const r = await apiFetch<{ session_id: string; reply: string }>("/chat/send", {
        method: "POST",
        body: JSON.stringify({ message: msg, session_id: sessionId }),
      });
      if (!sessionId) setSessionId(r.session_id);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, something went wrong: " + (e?.message || "unknown") }]);
    } finally {
      setSending(false);
    }
  };

  const uploadBloodTest = async () => {
    setBloodLoading(true);
    try {
      // Ask user to choose PDF or image
      const doc = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
      if (doc.canceled || !doc.assets?.[0]) { setBloodLoading(false); return; }
      const asset = doc.assets[0];
      const form = new FormData();
      // @ts-expect-error RN FormData typing
      form.append("file", { uri: asset.uri, name: asset.name || "bloodtest", type: asset.mimeType || "application/octet-stream" });
      const r = await apiUpload<any>("/blood-test/analyze", form);
      setBloodReport(r);
    } catch (e: any) {
      setBloodReport({ error: e?.message || "Failed" });
    } finally {
      setBloodLoading(false);
    }
  };

  const suggestions = lang === "ru" ? SUGGESTIONS_RU : SUGGESTIONS_EN;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="chat-screen">
      <HeaderGradient style={{ paddingBottom: 16 }}>
        <SafeAreaView edges={["top"]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <ThemedText weight="500" size={22}>{t("chat.title")}</ThemedText>
              <ThemedText size={13} color={colors.onSurfaceTertiary}>Powered by GPT-5.2</ThemedText>
            </View>
            <TouchableOpacity
              testID="chat-blood-btn"
              onPress={uploadBloodTest}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: colors.brandSecondary }}
            >
              {bloodLoading ? <ActivityIndicator size="small" color={colors.onBrandSecondary} /> : <Ionicons name="flask" size={16} color={colors.onBrandSecondary} />}
              <ThemedText size={12} weight="500" color={colors.onBrandSecondary}>{t("chat.blood_test")}</ThemedText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </HeaderGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 20, paddingBottom: 20, gap: 12 }} style={{ flex: 1 }}>
          {bloodReport && !bloodReport.error && (
            <BloodTestCard report={bloodReport} onClose={() => setBloodReport(null)} />
          )}
          {bloodReport?.error && (
            <Card><ThemedText color={colors.error}>{bloodReport.error}</ThemedText></Card>
          )}

          {messages.length === 0 && !bloodReport && (
            <Card>
              <ThemedText size={15}>{t("onboarding.hi")}</ThemedText>
              <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>{t("chat.suggested")}</ThemedText>
              <View style={{ marginTop: 14, gap: 8 }}>
                {suggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    testID={`chat-suggestion-${i}`}
                    onPress={() => send(s)}
                    style={{ padding: 12, borderRadius: RADIUS.md, backgroundColor: colors.brandTertiary }}
                  >
                    <ThemedText size={14} color={colors.onBrandTertiary}>{s}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          )}

          {messages.map((m, i) => (
            <View key={i} style={{ flexDirection: m.role === "assistant" ? "row" : "row-reverse" }}>
              <View style={{
                maxWidth: "85%",
                backgroundColor: m.role === "assistant" ? colors.surfaceSecondary : colors.brandPrimary,
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
                borderBottomLeftRadius: m.role === "assistant" ? 4 : 18,
                borderBottomRightRadius: m.role === "assistant" ? 18 : 4,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
              }}>
                <ThemedText color={m.role === "assistant" ? colors.onSurface : colors.onBrandPrimary} size={15}>{m.content}</ThemedText>
              </View>
            </View>
          ))}
          {sending && (
            <View style={{ flexDirection: "row" }}>
              <View style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomLeftRadius: 4 }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            </View>
          )}
        </ScrollView>

        <View style={{ padding: 16, paddingBottom: 16 + Math.max(0, insets.bottom - 8), backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TextInput
              testID="chat-input"
              value={input}
              onChangeText={setInput}
              placeholder={t("chat.placeholder")}
              placeholderTextColor={colors.onSurfaceTertiary}
              multiline
              maxLength={2000}
              style={{
                flex: 1,
                backgroundColor: colors.surfaceTertiary,
                color: colors.onSurface,
                borderRadius: 22,
                paddingHorizontal: 18,
                paddingVertical: Platform.OS === "ios" ? 12 : 8,
                fontSize: 15,
                maxHeight: 120,
              }}
            />
            <TouchableOpacity
              testID="chat-send-btn"
              onPress={() => send()}
              disabled={sending || !input.trim()}
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", opacity: sending || !input.trim() ? 0.5 : 1 }}
            >
              <Ionicons name="arrow-up" size={22} color={colors.onBrandPrimary} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function BloodTestCard({ report, onClose }: { report: any; onClose: () => void }) {
  const { colors } = useTheme();
  const statusColor: any = { normal: colors.success, high: colors.error, low: colors.warning };
  return (
    <Card testID="blood-test-card">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="flask" size={20} color={colors.brandPrimary} />
            <ThemedText weight="500" size={17}>Blood Test Analysis</ThemedText>
          </View>
          <ThemedText size={13} color={colors.onSurfaceTertiary} style={{ marginTop: 6 }}>{report.summary}</ThemedText>
        </View>
        <TouchableOpacity onPress={onClose} testID="blood-close-btn"><Ionicons name="close" size={22} color={colors.onSurfaceTertiary} /></TouchableOpacity>
      </View>
      {Array.isArray(report.markers) && (
        <View style={{ marginTop: 14, gap: 8 }}>
          {report.markers.slice(0, 8).map((m: any, i: number) => (
            <View key={i} style={{ padding: 10, backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <ThemedText weight="500" size={14}>{m.name}</ThemedText>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: statusColor[m.status] || colors.surfaceSecondary, borderRadius: 999 }}>
                  <ThemedText size={11} weight="500" color="#FFFFFF">{m.status?.toUpperCase()}</ThemedText>
                </View>
              </View>
              <ThemedText size={12} color={colors.onSurfaceTertiary} style={{ marginTop: 4 }}>{m.value} (ref: {m.reference})</ThemedText>
              <ThemedText size={12} color={colors.onSurfaceSecondary} style={{ marginTop: 4 }}>{m.explanation}</ThemedText>
            </View>
          ))}
        </View>
      )}
      {Array.isArray(report.suggested_foods) && report.suggested_foods.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <ThemedText weight="500" size={14}>Suggested foods</ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {report.suggested_foods.map((f: string, i: number) => (
              <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.brandTertiary, borderRadius: 999 }}>
                <ThemedText size={12} color={colors.onBrandTertiary}>{f}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}
      {report.important_notice ? (
        <View style={{ marginTop: 14, padding: 10, backgroundColor: colors.surfaceTertiary, borderRadius: RADIUS.md }}>
          <ThemedText size={11} color={colors.onSurfaceTertiary}>{report.important_notice}</ThemedText>
        </View>
      ) : null}
    </Card>
  );
}
