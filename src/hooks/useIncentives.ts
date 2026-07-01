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

export type IncentiveStatus =
  | "pending"
  | "active"
  | "paused"
  | "completed"
  | "expired"
  | "rejected"
  | "archived";

export type Incentive = {
  id: string;
  title: string;
  description: string | null;
  payout_amount: number;
  target_type: "first_to_finish" | "milestone";
  target_quantity: number;
  status: IncentiveStatus;
  creator_id: string;
  approver_id: string | null;
  start_time: string | null;
  end_time: string;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
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

type DbError = { message?: string; code?: string };
type DbResult<T> = Promise<{ data: T | null; error: DbError | null }>;
type EqResult<T> = Promise<{ data: T[] | null; error: DbError | null }> & {
  eq: (column: string, value: unknown) => EqResult<T>;
  maybeSingle: () => DbResult<T>;
};
type SelectChain<T> = {
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => DbResult<T[]>;
  eq: (column: string, value: unknown) => EqResult<T>;
};
type IncentiveDbClient = {
  from: {
    (table: "incentives"): {
      select: (columns: string) => SelectChain<Incentive>;
    };
    (table: "incentive_rules"): {
      select: (columns: string) => SelectChain<IncentiveRule>;
    };
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => DbResult<T>;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

export const useIncentives = () => {
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sb = supabase as unknown as IncentiveDbClient;

  const fetchIncentives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await sb
        .from("incentives")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      const incentives = ((data ?? []) as Incentive[]).filter(
        (incentive) => incentive.status !== "archived"
      );

      const incentivesWithRules = await Promise.all(
        incentives.map(async (incentive) => {
          const { data: rules } = await sb
            .from("incentive_rules")
            .select("*")
            .eq("incentive_id", incentive.id);

          return { ...incentive, rules: (rules ?? []) as IncentiveRule[] };
        })
      );

      setIncentives(incentivesWithRules);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to load incentives"));
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    fetchIncentives();
  }, [fetchIncentives]);

  const createIncentive = async (data: IncentiveFormData): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const validRules = data.rules.filter(
        (r) => r.state || r.max_sol_months || r.attorney_id
      );

      const { error: createError } = await sb.rpc<string>("create_incentive_with_rules", {
        p_title: data.title,
        p_description: data.description || null,
        p_payout_amount: data.payout_amount,
        p_target_type: data.target_type,
        p_target_quantity: data.target_quantity,
        p_end_time: data.end_time,
        p_rules: validRules.map((rule) => ({
            state: rule.state || null,
            max_sol_months: rule.max_sol_months || null,
            attorney_id: rule.attorney_id || null,
        })),
      });

      if (createError) throw createError;

      toast.success("Incentive created and submitted for approval");
      fetchIncentives();
      return true;
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Failed to create incentive"));
      return false;
    }
  };

  const updateIncentiveStatus = async (
    id: string,
    status: "active" | "paused" | "rejected"
  ): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const current = incentives.find((incentive) => incentive.id === id);
      if (status === "active" && current && new Date(current.end_time).getTime() <= Date.now()) {
        throw new Error("Cannot approve an incentive after its expiration time");
      }

      const rpcName =
        status === "active"
          ? current?.status === "paused"
            ? "resume_incentive"
            : "approve_incentive"
          : status === "paused"
            ? "pause_incentive"
            : "reject_incentive";

      const { error } = await sb.rpc<Incentive>(rpcName, {
        p_incentive_id: id,
      });

      if (error) throw error;

      toast.success(
        status === "active"
          ? "Incentive is active"
          : status === "paused"
            ? "Incentive paused"
          : "Incentive rejected"
      );
      fetchIncentives();
      return true;
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Failed to update incentive"));
      return false;
    }
  };

  const deleteIncentive = async (id: string): Promise<boolean> => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await sb.rpc<{ action?: "deleted" | "archived" }>(
        "archive_incentive",
        {
          p_incentive_id: id,
          p_reason: "Deleted from Incentives admin",
        }
      );

      if (error) throw error;

      toast.success(data?.action === "deleted" ? "Incentive deleted" : "Incentive archived");
      fetchIncentives();
      return true;
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Failed to delete incentive"));
      return false;
    }
  };

  const expireIncentives = async () => {
    try {
      const { error } = await sb.rpc("expire_incentives");
      if (error) throw error;
      fetchIncentives();
    } catch (e: unknown) {
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
    deleteIncentive,
    expireIncentives,
  };
};
