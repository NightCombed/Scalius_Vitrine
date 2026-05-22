import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapStoreSettings } from "@/lib/store-settings";
import type { StoreSettings } from "@/types/database";

export function useStoreSettings(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store-settings", storeId],
    queryFn: async () => {
      if (!storeId) return null;
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
        
      if (error) throw error;
      if (!data) return null;

      return mapStoreSettings(data);
    },
    enabled: !!storeId,
    // Add a bit of staleTime to avoid constant refetching
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
