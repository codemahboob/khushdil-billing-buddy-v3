import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchAllInvoices,
  fetchProfile,
  fetchCustomServices,
  type BusinessProfile,
} from "@/lib/cloud-storage";
import { BUILTIN_SERVICES, type Invoice, type PresetItem } from "@/lib/invoice-storage";
import { runLocalMigrationOnce } from "@/lib/migration-from-local";

export type CloudData = {
  loading: boolean;
  userId: string | null;
  profile: BusinessProfile | null;
  invoices: Invoice[];
  deleted: Invoice[];
  presets: PresetItem[];
  refresh: () => Promise<void>;
};

export function useCloudData(): CloudData {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [all, setAll] = useState<Invoice[]>([]);
  const [custom, setCustom] = useState<PresetItem[]>([]);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const [invs, prof, customs] = await Promise.all([
        fetchAllInvoices(),
        fetchProfile(),
        fetchCustomServices(),
      ]);
      setAll(invs);
      setProfile(prof);
      setCustom(customs);
    } catch (e) {
      console.error("Cloud refresh failed", e);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const uid = "00000000-0000-0000-0000-000000000001";
      if (cancelled) return;
      setUserId(uid);
      // One-time legacy import into the shared cloud workspace.
      try {
        await runLocalMigrationOnce(uid);
      } catch (e) {
        console.warn("Local migration failed", e);
      }
      await refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`khushdil-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_items", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  const invoices = all.filter((i) => !i.deletedAt);
  const deleted = all.filter((i) => !!i.deletedAt);
  const presets: PresetItem[] = [...BUILTIN_SERVICES, ...custom];

  return { loading, userId, profile, invoices, deleted, presets, refresh };
}
