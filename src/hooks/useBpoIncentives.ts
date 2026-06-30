import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Incentive, IncentiveRule, BpoProgress } from "./useIncentives";

export type BpoIncentiveWithProgress = Incentive & {
  rules: IncentiveRule[];
  progress: BpoProgress | null;
};

export const useBpoIncentives = () => {
  const [incentives, setIncentives] = useState<BpoIncentiveWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveIncentives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = supabase as any;
      const { data: userData } = await supabase.auth.getUser();
      const bpoId = userData.user?.id;
      if (!bpoId) throw new Error("Not authenticated");

      const { data: incentivesData, error: incentivesError } = await sb
        .from("incentives")
        .select("*")
        .eq("status", "active")
        .order("end_time", { ascending: true });

      if (incentivesError) throw incentivesError;

      const activeIncentives = (incentivesData ?? []) as Incentive[];

      const enriched = await Promise.all(
        activeIncentives.map(async (incentive) => {
          const { data: rules } = await sb
            .from("incentive_rules")
            .select("*")
            .eq("incentive_id", incentive.id);

          const { data: progress } = await sb
            .from("bpo_incentive_progress")
            .select("*")
            .eq("incentive_id", incentive.id)
            .eq("bpo_id", bpoId)
            .maybeSingle();

          return {
            ...incentive,
            rules: (rules ?? []) as IncentiveRule[],
            progress: (progress ?? null) as BpoProgress | null,
          };
        })
      );

      setIncentives(enriched);
    } catch (e: any) {
      setError(e.message ?? "Failed to load challenges");
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveIncentives();
  }, [fetchActiveIncentives]);

  return {
    incentives,
    loading,
    error,
    refetch: fetchActiveIncentives,
  };
};
