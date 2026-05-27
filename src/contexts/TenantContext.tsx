import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapStoreSettings } from "@/lib/store-settings";
import type { Store, StoreSettings } from "@/types/database";
import { resolveTenantSlug } from "@/lib/tenant";

interface TenantContextValue {
  store: Store | null;
  settings: StoreSettings | null;
  slug: string | null;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  store: null, settings: null, slug: null, isLoading: false,
});

interface Props {
  children: ReactNode;
  fromRoute?: boolean;
}

export function TenantProvider({ children, fromRoute = false }: Props) {
  const params = useParams<{ slug?: string }>();
  const slug = (fromRoute && params.slug) || resolveTenantSlug() || null;

  const { data: store = null, isLoading: loadingStore } = useQuery<Store | null>({
    queryKey: ["store", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Store | null;
    },
    enabled: !!slug,
  });

  const { data: settings = null, isLoading: loadingSettings } = useQuery<StoreSettings | null>({
    queryKey: ["store-settings", store?.id],
    queryFn: async () => {
      if (!store?.id) return null;
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("store_id", store.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return mapStoreSettings(data);
    },
    enabled: !!store?.id,
  });

  const value = useMemo<TenantContextValue>(() => ({
    store,
    settings,
    slug,
    isLoading: loadingStore || loadingSettings,
  }), [store, settings, slug, loadingStore, loadingSettings]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export const useTenant = () => useContext(TenantContext);

export function useRequiredTenant() {
  const t = useTenant();
  if (!t.store) {
    throw new Error("useRequiredTenant: no store resolved for current context");
  }
  return t as Required<TenantContextValue>;
}