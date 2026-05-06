import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PipelineStage } from "@/hooks/usePipelineStages";
import { BPO_ONBOARDING_PORTAL_PIPELINE } from "@/lib/bpoOnboardingStages";

interface UseBpoOnboardingStagesResult {
  stages: PipelineStage[];
  loading: boolean;
  error: string | null;
}

type StageRow = {
  id: string;
  key: string;
  label: string;
  display_order: number;
  column_class: string | null;
  header_class: string | null;
  is_active: boolean;
};

export function useBpoOnboardingStages(): UseBpoOnboardingStagesResult {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchStages = async () => {
      setLoading(true);
      setError(null);

      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: boolean) => {
              order: (
                column: string,
                opts: { ascending: boolean }
              ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
            };
          };
        };
      };

      const { data, error: fetchError } = await client
        .from("bpo_onboarding_portal_stages")
        .select("id,key,label,display_order,column_class,header_class,is_active")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message ?? "Failed to fetch BPO onboarding stages");
        setStages([]);
        setLoading(false);
        return;
      }

      const mapped = ((data ?? []) as StageRow[]).map((stage) => ({
        id: stage.id,
        pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
        key: stage.key,
        label: stage.label,
        display_order: stage.display_order,
        column_class: stage.column_class,
        header_class: stage.header_class,
        is_active: stage.is_active,
      }));

      if (mapped.length === 0) {
        setError("No active BPO onboarding stages are configured");
      }
      setStages(mapped);
      setLoading(false);
    };

    void fetchStages();

    return () => {
      cancelled = true;
    };
  }, []);

  return { stages, loading, error };
}
