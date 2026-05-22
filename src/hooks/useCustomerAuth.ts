import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CustomerProfile,
  AuthResponse,
  saveSession,
  clearSession,
  getStoredToken,
  getStoredProfile,
  CUSTOMER_TOKEN_KEY,
} from "@/types/customer";

interface UseCustomerAuthReturn {
  customer: CustomerProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  register: (args: { store_id: string; email: string; password: string; full_name?: string }) => Promise<AuthResponse>;
  login: (args: { store_id: string; email: string; password: string }) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  /** Silently links an anonymous order to the logged-in customer */
  linkOrder: (orderId: string) => Promise<void>;
  /** Returns last delivery address + profile data for checkout pre-fill */
  getLastAddress: () => Promise<{ customer: any; last_order: any } | null>;
}

export function useCustomerAuth(): UseCustomerAuthReturn {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialized = useRef(false);

  // ── Restore session on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const token = getStoredToken();
    const profile = getStoredProfile();

    if (!token || !profile) {
      setIsLoading(false);
      return;
    }

    // Decode exp from JWT payload (no library needed)
    try {
      const [, b64] = token.split(".");
      let paddedB64 = b64.replace(/-/g, "+").replace(/_/g, "/");
      while (paddedB64.length % 4 !== 0) {
        paddedB64 += "=";
      }
      const payload = JSON.parse(atob(paddedB64));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        // Token expired — clean up silently
        clearSession();
        setIsLoading(false);
        return;
      }
    } catch {
      clearSession();
      setIsLoading(false);
      return;
    }

    // Restore immediately from localStorage (fast), verify in background
    setCustomer(profile);
    setIsLoading(false);
  }, []);

  // ── Cross-tab & Same-tab synchronization ───────────────────────────────────────────────
  useEffect(() => {
    const syncState = () => {
      const token = getStoredToken();
      if (!token) {
        setCustomer(null);
      } else {
        const profile = getStoredProfile();
        if (profile) setCustomer(profile);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === CUSTOMER_TOKEN_KEY) syncState();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("customer-auth-changed", syncState);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("customer-auth-changed", syncState);
    };
  }, []);

  // ── Shared fetch helper ─────────────────────────────────────────────────────
  const callAuth = useCallback(async (body: Record<string, unknown>): Promise<AuthResponse> => {
    const { data, error } = await supabase.functions.invoke("customer-auth", { body });
    if (error) throw new Error(error.message ?? "Erro de autenticação");
    if (data?.error) throw new Error(data.error);
    return data as AuthResponse;
  }, []);

  // ── Register ────────────────────────────────────────────────────────────────
  const register = useCallback(
    async (args: { store_id: string; email: string; password: string; full_name?: string }) => {
      const result = await callAuth({ action: "register", ...args });
      saveSession(result);
      setCustomer(result.customer);
      window.dispatchEvent(new Event("customer-auth-changed"));
      return result;
    },
    [callAuth]
  );

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(
    async (args: { store_id: string; email: string; password: string }) => {
      const result = await callAuth({ action: "login", ...args });
      saveSession(result);
      setCustomer(result.customer);
      window.dispatchEvent(new Event("customer-auth-changed"));
      return result;
    },
    [callAuth]
  );

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    const token = getStoredToken();
    try {
      if (token) await callAuth({ action: "logout", token });
    } finally {
      clearSession();
      setCustomer(null);
      window.dispatchEvent(new Event("customer-auth-changed"));
    }
  }, [callAuth]);

  // ── Link anonymous order to customer after login/register ────────────────────
  const linkOrder = useCallback(async (orderId: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const result = await callAuth({ action: "link_order", token, order_id: orderId });
      if (result.customer) {
        // Update local state and localStorage with the profile that now has name/phone
        setCustomer(result.customer);
        localStorage.setItem("customer_profile", JSON.stringify(result.customer));
        window.dispatchEvent(new Event("customer-auth-changed"));
      }
    } catch {
      // Fail silently — linking is a best-effort improvement
    }
  }, [callAuth]);

  // ── Get last delivery address for checkout pre-fill ──────────────────────────
  const getLastAddress = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return null;
    try {
      const { data, error } = await supabase.functions.invoke("customer-auth", {
        body: { action: "get_last_address", token },
      });
      if (error || data?.error) return null;
      return data as { customer: any; last_order: any };
    } catch {
      return null;
    }
  }, []);

  return { customer, isLoading, isAuthenticated: !!customer, register, login, logout, linkOrder, getLastAddress };
}
