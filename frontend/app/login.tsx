import React, { useState } from "react";
import { View, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";
import { PrimaryButton, SecondaryButton, TextField, ThemedText, GhostButton } from "@/src/ui";

export default function LoginScreen() {
  const { signInEmail, signInGoogleSession } = useAuth();
  const { colors, t } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInEmail(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    setLoading(true);
    try {
      const redirectUrl =
        Platform.OS === "web"
          ? (typeof window !== "undefined" ? window.location.origin + "/" : "")
          : ExpoLinking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type !== "success" || !result.url) {
        setLoading(false);
        return;
      }
      // parse session_id
      const url = result.url;
      const hash = url.split("#")[1] || "";
      const query = url.split("?")[1] || "";
      const params = new URLSearchParams(hash || query);
      const sessionId = params.get("session_id");
      if (!sessionId) throw new Error("No session_id");
      await signInGoogleSession(sessionId);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 8 }}>
            <TouchableOpacity onPress={() => router.back()} testID="login-back-btn" style={{ padding: 8, marginLeft: -8 }}>
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </TouchableOpacity>

            <ThemedText weight="500" size={32} style={{ marginTop: 24 }}>{t("auth.login")}</ThemedText>
            <ThemedText color={colors.onSurfaceTertiary} size={15} style={{ marginTop: 8 }}>
              {t("app.name")}
            </ThemedText>

            <View style={{ marginTop: 40, gap: 12 }}>
              <TextField
                testID="login-email-input"
                placeholder={t("auth.email")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <TextField
                testID="login-password-input"
                placeholder={t("auth.password")}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {error ? <ThemedText color={colors.error} size={13}>{error}</ThemedText> : null}
              <PrimaryButton testID="login-submit-btn" title={t("auth.login")} onPress={submit} loading={loading} />
              <SecondaryButton
                testID="login-google-btn"
                title={t("cta.google")}
                onPress={google}
                icon={<Ionicons name="logo-google" size={18} color={colors.onBrandSecondary} />}
              />
              <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 8, gap: 6 }}>
                <ThemedText color={colors.onSurfaceTertiary} size={14}>{t("auth.no_account")}</ThemedText>
                <GhostButton title={t("cta.sign_up")} onPress={() => router.replace("/register")} testID="login-goto-register-btn" />
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
