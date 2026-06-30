import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type IncentiveRule = {
  id: string;
  incentive_id: string;
  state: string | null;
  max_sol_months: number | null;
  attorney_id: string | null;
};

export type Incentive = {
  id: string;
  title: string;
  description: string | null;
  payout_amount: number;
  target_type: "first_to_finish" | "milestone";
  target_quantity: number;
  status: "pending" | "active" | "completed" | "expired" | "rejected";
  creator_id: string;
  approver_id: string | null;
  start_time: string | null;
  end_time: string;
  created_at: string;
  updated_at: string;
  rules?: IncentiveRule[];
};

export type BpoProgress = {
  id: string;
  incentive_id: string;
  bpo_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
};

export type IncentivePayout = {
  id: string;
  incentive_id: string;
  bpo_id: string;
  amount_paid: number;
  payout_status: "unpaid" | "processing" | "paid";
  paid_at: string | null;
};

export type IncentiveFormData = {
  title: string;
  description: string;
  payout_amount: number;
  target_type: "first_to_finish" | "milestone";
  target_quantity: number;
  end_time: string;
  rules: {
    state: string;
    max_sol_months: string;
    attorney_id: string;
  }[];
};

export const useIncentives = () => {
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncentives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await (supabase as any)
        .from("incentives")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      const incentives = (data ?? []) as Incentive[];

      const incentivesWithRules = await Promise.all(
        incentives.map(async (incentive) => {
          const { data: rules } = await (supabase as any)
            .from("incentive_rules")
            .select("*")
            .eq("incentive_id", incentive.id);

          return { ...incentive, rules: (rules ?? []) as IncentiveRule[] };
        })
      );

      setIncentives(incentivesWithRules);
    } catch (e: any) {
      setError(e.message ?? "Failed to load incentives");
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncentives();
  }, [fetchIncentives]);

  const createIncentive = async (data: IncentiveFormData): Promise<boolean> => {
    try {
      const sb = supabase as any;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data: incentive, error: insertError } = await sb
        .from("incentives")
        .insert({
          title: data.title,
          description: data.description || null,
          payout_amount: data.payout_amount,
          target_type: data.target_type,
          target_quantity: data.target_quantity,
          end_time: data.end_time,
          creator_id: userData.user.id,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const validRules = data.rules.filter(
        (r) => r.state || r.max_sol_months || r.attorney_id
      );

      if (validRules.length > 0 && incentive) {
        const { error: rulesError } = await sb.from("incentive_rules").insert(
          validRules.map((rule) => ({
            incentive_id: incentive.id,
            state: rule.state || null,
            max_sol_months: rule.max_sol_months ? Number(rule.max_sol_months) : null,
            attorney_id: rule.attorney_id || null,
          }))
        );

        if (rulesError) throw rulesError;
      }

      toast.success("Incentive created and submitted for approval");
      fetchIncentives();
      return true;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create incentive");
      return false;
    }
  };

  const updateIncentiveStatus = async (
    id: string,
    status: "active" | "rejected"
  ): Promise<boolean> => {
    try {
      const sb = supabase as any;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const updateData: any = {
        status,
        approver_id: userData.user.id,
        updated_at: new Date().toISOString(),
      };

      if (status === "active") {
        updateData.start_time = new Date().toISOString();
      }

      const { error } = await sb
        .from("incentives")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success(
        status === "active"
          ? "Incentive approved and now live!"
          : "Incentive rejected"
      );
      fetchIncentives();
      return true;
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update incentive");
      return false;
    }
  };

  const expireIncentives = async () => {
    try {
      const sb = supabase as any;
      const { error } = await sb.rpc("expire_incentives");
      if (error) throw error;
      fetchIncentives();
    } catch (e: any) {
      console.error("Failed to expire incentives:", e);
    }
  };

  return {
    incentives,
    loading,
    error,
    refetch: fetchIncentives,
    createIncentive,
    updateIncentiveStatus,
    expireIncentives,
  };
};
