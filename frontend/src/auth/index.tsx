/**
 * Auth context + API client for NutriFlow AI
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "nutriflow.token";

export type User = {
  user_id: string;
  email: string;
  name?: string;
  picture?: string;
  provider?: string;
  onboarded?: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  token: string | null;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInGoogleSession: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function saveToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}
async function loadToken(): Promise<string | null> {
  return await storage.secureGet(TOKEN_KEY, null as string | null);
}
async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

export async function apiFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.detail || ""; } catch {}
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function apiUpload<T = any>(path: string, formData: FormData): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Do NOT set Content-Type; RN will set multipart boundary automatically
  const res = await fetch(`${BACKEND}/api${path}`, { method: "POST", headers, body: formData as any });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.detail || ""; } catch {}
    throw new Error(detail || `Upload failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await loadToken();
    setToken(t);
    if (!t) { setUser(null); setLoading(false); return; }
    try {
      const data = await apiFetch<{ user: User }>("/auth/me");
      setUser(data.user);
    } catch {
      await clearToken();
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string, name?: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const signInGoogleSession = useCallback(async (sessionId: string) => {
    const data = await apiFetch<{ token: string; user: User }>("/auth/google/session", {
      method: "POST",
      body: JSON.stringify({ session_token: sessionId }),
    });
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    await clearToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, token, signInEmail, signUpEmail, signInGoogleSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
