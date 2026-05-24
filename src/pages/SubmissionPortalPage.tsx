import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBpoOnboardingStages } from "@/hooks/useBpoOnboardingStages";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Pencil, StickyNote, SlidersHorizontal, X } from "lucide-react";
import LogoLoader from "@/components/LogoLoader";
import {
  parseStageLabel,
  deriveParentStages,
  buildStatusLabel,
} from "@/lib/stageUtils";
import { formatBpoRoleLabel, getBpoPortalStageDisplayLabel } from "@/lib/bpo";
import {
  BPO_ONBOARDING_PORTAL_PIPELINE,
  getPublisherFrontendStageKey,
} from "@/lib/bpoOnboardingStages";
import {
  buildCountryOptions,
  CENTER_FILTER_ALL,
  COMPANY_SIZE_OPTIONS,
  type CompanySizeValue,
  getCompanySizeFromAgentCount,
  getCountryFromCenterLocation,
} from "@/lib/centerFilters";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";

type DateRange = "all_time" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";
type PresetDateRange = Exclude<DateRange, "all_time" | "custom">;

const getPresetRangeBounds = (range: PresetDateRange) => {
  const now = new Date();
  if (range === "this_week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return { start, end };
  }

  if (range === "last_week") {
    const ref = subWeeks(now, 1);
    const start = startOfWeek(ref, { weekStartsOn: 1 });
    const end = endOfWeek(ref, { weekStartsOn: 1 });
    return { start, end };
  }

  if (range === "this_month") {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return { start, end };
  }

  const ref = subMonths(now, 1);
  const start = startOfMonth(ref);
  const end = endOfMonth(ref);
  return { start, end };
};

export interface SubmissionPortalRow {
  id: string;
  ui_id?: string;
  submission_id: string;
  pipeline_name?: string | null;
  display_stage_key?: string;
  date?: string;
  insured_name?: string;
  lead_vendor?: string;
  client_phone_number?: string;
  buffer_agent?: string;
  agent?: string;
  licensed_agent_account?: string;
  assigned_attorney_id?: string | null;
  stage_id?: string | null;
  assigned_user_id?: string | null;
  status?: string;
  call_result?: string;
  carrier?: string;
  product_type?: string;
  draft_date?: string;
  monthly_premium?: number;
  face_amount?: number;
  from_callback?: boolean;
  notes?: string;
  policy_number?: string;
  carrier_audit?: string;
  product_type_carrier?: string;
  level_or_gi?: string;
  created_at?: string;
  updated_at?: string;
  application_submitted?: boolean;
  sent_to_underwriting?: boolean;
  submission_date?: string;
  dq_reason?: string;
  call_source?: string;
  submission_source?: string;
  verification_logs?: string;
  has_submission_data?: boolean;
  source_type?: string;
  center_country?: string;
  center_location?: string;
  center_number_of_agents?: string;
  company_size?: CompanySizeValue | "";
}

interface CallLog {
  agent_type: string;
  agent_name: string;
  event_type: string;
  created_at: string;
}

const SubmissionPortalPage = () => {
  const {
    stages: dbSubmissionStages,
    loading: stagesLoading,
    error: stagesError,
  } = useBpoOnboardingStages();

  // --- Derive parent stages (kanban columns) from flat DB stages ---
  const parentStages = useMemo(() => deriveParentStages(dbSubmissionStages), [dbSubmissionStages]);

  const kanbanStages = useMemo(() => {
    return parentStages.map((s) => ({ key: s.key, label: getBpoPortalStageDisplayLabel(s.label) }));
  }, [parentStages]);

  const stageTheme = useMemo(() => {
    const theme: Record<string, { column: string; header: string }> = {};
    parentStages.forEach((s) => {
      theme[s.key] = { column: s.columnClass, header: s.headerClass };
    });
    return theme;
  }, [parentStages]);

  // Map of parent label → reasons for edit form
  const reasonsByParent = useMemo(() => {
    const map: Record<string, string[]> = {};
    parentStages.forEach((s) => {
      if (s.reasons.length > 0) map[s.label] = s.reasons;
    });
    return map;
  }, [parentStages]);

  const deriveStageKey = useCallback((row: SubmissionPortalRow): string => {
    const stageId = (row.display_stage_key || row.stage_id || '').trim();
    if (!stageId) return parentStages[0]?.key ?? '';

    const asKey = dbSubmissionStages.find((s) => s.key === stageId);
    if (asKey?.key) return asKey.key;

    const legacy = dbSubmissionStages.find((s) => s.id === stageId);
    if (legacy?.key) return legacy.key;

    if (parentStages.some((s) => s.key === stageId)) return stageId;
    return parentStages[0]?.key ?? '';
  }, [dbSubmissionStages, parentStages]);

  const handleKanbanDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!draggingId) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const edgeThreshold = 96;
    const maxStep = 24;
    const pointerX = e.clientX - rect.left;

    if (pointerX < edgeThreshold) {
      const intensity = (edgeThreshold - pointerX) / edgeThreshold;
      container.scrollLeft -= Math.ceil(maxStep * intensity);
      return;
    }

    if (pointerX > rect.width - edgeThreshold) {
      const intensity = (pointerX - (rect.width - edgeThreshold)) / edgeThreshold;
      container.scrollLeft += Math.ceil(maxStep * intensity);
    }
  };

  const [data, setData] = useState<SubmissionPortalRow[]>([]);
  const [filteredData, setFilteredData] = useState<SubmissionPortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<DateRange>("all_time");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("__ALL__");
  const [leadVendorFilter, setLeadVendorFilter] = useState("__ALL__");
  const [countryFilter, setCountryFilter] = useState(CENTER_FILTER_ALL);
  const [companySizeFilter, setCompanySizeFilter] = useState(CENTER_FILTER_ALL);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editRow, setEditRow] = useState<SubmissionPortalRow | null>(null);
  const [editStage, setEditStage] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStageOpen, setEditStageOpen] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (!stagesError) return;
    toast({
      title: "BPO Stages Unavailable",
      description: "Run the BPO onboarding stages migration before using this board.",
      variant: "destructive",
    });
  }, [stagesError, toast]);

  // Apply filters
  const applyFilters = useCallback((records: SubmissionPortalRow[]): SubmissionPortalRow[] => {
    let filtered = records;

    // Apply status filter
    if (statusFilter !== "__ALL__") {
      filtered = filtered.filter((record) => (record.status || '') === statusFilter);
    }

    // Apply company filter
    if (leadVendorFilter !== "__ALL__") {
      filtered = filtered.filter((record) => (record.lead_vendor || '') === leadVendorFilter);
    }

    if (countryFilter !== CENTER_FILTER_ALL) {
      filtered = filtered.filter((record) => (record.center_country || '') === countryFilter);
    }

    if (companySizeFilter !== CENTER_FILTER_ALL) {
      filtered = filtered.filter((record) => record.company_size === companySizeFilter);
    }

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(record =>
        (record.insured_name?.toLowerCase().includes(searchLower)) ||
        (record.client_phone_number?.toLowerCase().includes(searchLower)) ||
        (record.lead_vendor?.toLowerCase().includes(searchLower)) ||
        (record.agent?.toLowerCase().includes(searchLower)) ||
        (record.buffer_agent?.toLowerCase().includes(searchLower)) ||
        (record.licensed_agent_account?.toLowerCase().includes(searchLower)) ||
        (record.carrier?.toLowerCase().includes(searchLower)) ||
        (record.product_type?.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [companySizeFilter, countryFilter, leadVendorFilter, searchTerm, statusFilter]);

  const leadVendorOptions = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((r) => {
      const v = (r.lead_vendor || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const countryOptions = useMemo(() => buildCountryOptions(data), [data]);

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    leadVendorFilter !== "__ALL__" ||
    countryFilter !== CENTER_FILTER_ALL ||
    companySizeFilter !== CENTER_FILTER_ALL ||
    statusFilter !== "__ALL__" ||
    timeRange !== "all_time" ||
    customStartDate.length > 0 ||
    customEndDate.length > 0;

  const handleClearFilters = () => {
    setSearchTerm("");
    setLeadVendorFilter("__ALL__");
    setCountryFilter(CENTER_FILTER_ALL);
    setCompanySizeFilter(CENTER_FILTER_ALL);
    setStatusFilter("__ALL__");
    setTimeRange("all_time");
    setCustomStartDate("");
    setCustomEndDate("");
    setShowFilterRow(false);
  };

  // Function to generate verification log summary showing complete call workflow
  const generateVerificationLogSummary = (logs: CallLog[], submission?: unknown): string => {
    if (!logs || logs.length === 0) {
      // Fallback to data from submission/call_results table if available
      const maybeSubmission = submission as {
        has_submission_data?: boolean;
        buffer_agent?: string | null;
        agent?: string | null;
        agent_who_took_call?: string | null;
        licensed_agent_account?: string | null;
      };
      if (maybeSubmission && maybeSubmission.has_submission_data) {
        const workflow = [];
        
        if (maybeSubmission.buffer_agent) {
          workflow.push(`🟡 Buffer: ${maybeSubmission.buffer_agent}`);
        }
        
        if (maybeSubmission.agent && maybeSubmission.agent !== maybeSubmission.buffer_agent) {
          workflow.push(`📞 Handled by: ${maybeSubmission.agent}`);
        }
        
        if (maybeSubmission.licensed_agent_account) {
          if (maybeSubmission.buffer_agent || maybeSubmission.agent_who_took_call) {
            workflow.push(`➡️ Transfer to Licensed`);
          }
          workflow.push(`🔵 Licensed: ${maybeSubmission.licensed_agent_account}`);
        }
        
        if (workflow.length > 0) {
          return workflow.join(' → ');
        }
      }
      
      return "No call activity recorded";
    }

    const sortedLogs = logs.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const workflow: string[] = [];
    let initialAgent: string | null = null;
    let currentAgent: string | null = null;
    let bufferAgent: string | null = null;
    let licensedAgent: string | null = null;
    let hasTransfer = false;
    
    for (const log of sortedLogs) {
      const agentName = log.agent_name || `${log.agent_type} agent`;
      
      switch (log.event_type) {
        case 'verification_started':
          if (!initialAgent) {
            initialAgent = agentName;
            currentAgent = agentName;
            
            if (log.agent_type === 'buffer') {
              bufferAgent = agentName;
              workflow.push(`� Buffer "${agentName}" picked up initially`);
            } else if (log.agent_type === 'licensed') {
              licensedAgent = agentName;
              workflow.push(`🔵 Licensed "${agentName}" picked up initially`);
            }
          }
          break;
          
        case 'call_picked_up':
          if (agentName !== currentAgent) {
            if (log.agent_type === 'buffer') {
              bufferAgent = agentName;
              workflow.push(`� Buffer "${agentName}" picked up`);
            } else {
              licensedAgent = agentName;
              workflow.push(`🔵 Licensed "${agentName}" picked up`);
            }
            currentAgent = agentName;
          }
          break;
          
        case 'call_claimed':
          if (log.agent_type === 'buffer') {
            bufferAgent = agentName;
            workflow.push(`� Buffer "${agentName}" claimed dropped call`);
          } else {
            licensedAgent = agentName;
            workflow.push(`🔵 Licensed "${agentName}" claimed dropped call`);
          }
          currentAgent = agentName;
          break;
          
        case 'transferred_to_la':
          hasTransfer = true;
          workflow.push(`➡️ Transferred to Licensed Agent`);
          break;
          
        case 'call_dropped':
          workflow.push(`❌ "${agentName}" dropped call`);
          break;
          
        case 'application_submitted':
          workflow.push(`✅ Application submitted by "${agentName}"`);
          break;
          
        case 'application_not_submitted':
          workflow.push(`❌ Application not submitted`);
          break;
          
        case 'call_disconnected':
          workflow.push(`📞 Call disconnected from "${agentName}"`);
          break;
      }
    }

    // If no workflow events, show basic structure
    if (workflow.length === 0) {
      return "No detailed workflow events recorded";
    }

    // Add summary at the end showing final state
    const summary = [];
    if (bufferAgent) summary.push(`Buffer: ${bufferAgent}`);
    if (hasTransfer || licensedAgent) summary.push(`Licensed: ${licensedAgent || 'TBD'}`);
    
    if (summary.length > 0) {
      workflow.push(`📋 Summary: ${summary.join(' → ')}`);
    }

    return workflow.join(" → ");
  };

  // Fetch data from Supabase
  const fetchData = useCallback(async (showRefreshToast = false) => {
    try {
      setRefreshing(true);

      type QueryRes = { data: unknown[] | null; error: { message?: string } | null };
      type AppUsersQuery = PromiseLike<QueryRes> & {
        eq: (column: string, value: string | boolean) => AppUsersQuery;
        gte: (column: string, value: string) => AppUsersQuery;
        lt: (column: string, value: string) => AppUsersQuery;
        in: (column: string, values: readonly string[]) => AppUsersQuery;
        order: (column: string, opts: { ascending: boolean }) => AppUsersQuery;
      };
      const sb = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => AppUsersQuery;
        };
      };

      const resolveDateRange = (): { startIso: string; endExclusiveIso: string } | null => {
        if (timeRange === "all_time") return null;

        let start: Date;
        let end: Date;

        if (timeRange === "custom") {
          if (!customStartDate || !customEndDate) return null;
          start = startOfDay(parseISO(customStartDate));
          end = startOfDay(parseISO(customEndDate));
          if (end < start) end = start;
        } else {
          const bounds = getPresetRangeBounds(timeRange as PresetDateRange);
          start = bounds.start;
          end = bounds.end;
        }

        const startIso = start.toISOString();
        const endExclusiveIso = addDays(startOfDay(end), 1).toISOString();
        return { startIso, endExclusiveIso };
      };

      const range = resolveDateRange();

      let publisherQ = sb
        .from("app_users")
        .select("user_id,email,display_name,role,center_id,account_status,created_at,updated_at")
        .eq("role", "publisher_admin");

      if (range) {
        publisherQ = publisherQ.gte("created_at", range.startIso).lt("created_at", range.endExclusiveIso);
      }

      publisherQ = publisherQ.order("created_at", { ascending: false });

      const [publisherRes, centersRes, stagePositionsRes] = await Promise.all([
        publisherQ,
        sb
          .from("centers")
          .select("id,center_name,lead_vendor,contact_email,contact_phone,location,number_of_agents,is_active,created_at,updated_at")
          .order("center_name", { ascending: true }),
        sb
          .from("bpo_onboarding_portal_user_stages")
          .select("user_id,stage_key,notes,updated_at,updated_by"),
      ]);

      if (publisherRes.error) {
        console.error('Error fetching BPO publisher admin accounts:', publisherRes.error);
        toast({
          title: 'Error',
          description: 'Failed to fetch BPO publisher admin accounts',
          variant: 'destructive',
        });
        return;
      }
      if (centersRes.error) {
        console.warn('BPO center details unavailable; loading publisher admin accounts without center names:', centersRes.error);
        toast({
          title: 'Center Details Unavailable',
          description: 'Publisher admin accounts loaded without BPO company details.',
        });
      }
      if (stagePositionsRes.error) {
        console.warn('BPO stage positions unavailable; loading publisher admin accounts with inferred stages:', stagePositionsRes.error);
        toast({
          title: 'Stage Tracking Unavailable',
          description: 'Publisher admin accounts loaded with inferred board stages.',
        });
      }

      const publishers = ((publisherRes.data ?? []) as unknown as Array<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        role: string | null;
        center_id: string | null;
        account_status: string | null;
        created_at: string | null;
        updated_at: string | null;
      }>);
      const centers = ((centersRes.error ? [] : centersRes.data ?? []) as unknown as Array<{
        id: string;
        center_name: string | null;
        lead_vendor: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        location: string | null;
        number_of_agents: string | null;
        is_active: boolean | null;
        created_at: string | null;
        updated_at: string | null;
      }>);
      const centerById = new Map(centers.map((center) => [center.id, center]));
      const stagePositions = ((stagePositionsRes.error ? [] : stagePositionsRes.data ?? []) as unknown as Array<{
        user_id: string;
        stage_key: string | null;
        notes: string | null;
        updated_at: string | null;
        updated_by: string | null;
      }>);
      const stagePositionByUserId = new Map(stagePositions.map((row) => [row.user_id, row]));

      const mapped: SubmissionPortalRow[] = publishers.map((publisher) => {
        const persistedPosition = stagePositionByUserId.get(publisher.user_id);
        const persistedStageKey = (persistedPosition?.stage_key || '').trim();
        const inferredStageKey = getPublisherFrontendStageKey(publisher.account_status);
        const stageKey = dbSubmissionStages.some((stage) => stage.key === persistedStageKey)
          ? persistedStageKey
          : dbSubmissionStages.some((stage) => stage.key === inferredStageKey)
            ? inferredStageKey
            : dbSubmissionStages[0]?.key ?? '';
        const stageLabel = dbSubmissionStages.find((s) => s.key === stageKey)?.label ?? dbSubmissionStages[0]?.label;
        const center = publisher.center_id ? centerById.get(publisher.center_id) : null;
        const displayName = (publisher.display_name || '').trim() || publisher.email || 'Unnamed publisher';
        const companyName = center?.center_name || center?.lead_vendor || 'No BPO assigned';
        const centerCountry = getCountryFromCenterLocation(center?.location);
        const companySize = getCompanySizeFromAgentCount(center?.number_of_agents);
        const roleLabel = formatBpoRoleLabel(publisher.role);
        const accountStatus = String(publisher.account_status || '').trim() || 'Not set';
        const notes = (persistedPosition?.notes || '').trim()
          || (center?.is_active === false ? 'Center inactive' : undefined);

        return {
          id: publisher.user_id,
          submission_id: publisher.user_id,
          pipeline_name: BPO_ONBOARDING_PORTAL_PIPELINE,
          display_stage_key: stageKey,
          insured_name: displayName,
          client_phone_number: center?.contact_phone || center?.contact_email || publisher.email || undefined,
          lead_vendor: companyName,
          center_country: centerCountry || undefined,
          center_location: center?.location ?? undefined,
          center_number_of_agents: center?.number_of_agents ?? undefined,
          company_size: companySize,
          stage_id: stageKey,
          assigned_user_id: null,
          status: stageLabel,
          submission_date: publisher.created_at ?? undefined,
          created_at: publisher.created_at ?? undefined,
          updated_at: persistedPosition?.updated_at ?? publisher.updated_at ?? undefined,
          agent: roleLabel,
          call_result: accountStatus,
          notes,
          date: (publisher.created_at || '').slice(0, 10) || undefined,
        };
      });

      const combined = mapped.sort((a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      setData(combined);
      fetchNoteCounts(combined);

      if (showRefreshToast) {
        toast({
          title: "Success",
          description: "Data refreshed successfully",
        });
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    customEndDate,
    customStartDate,
    dbSubmissionStages,
    timeRange,
    toast,
  ]);

  // Update filtered data whenever data or filters change
  useEffect(() => {
    setFilteredData(applyFilters(data));
  }, [applyFilters, data]);

  useEffect(() => {
    if (stagesLoading) return;
    if (dbSubmissionStages.length === 0) {
      setData([]);
      setFilteredData([]);
      setLoading(false);
      return;
    }
    void fetchData();
  }, [dbSubmissionStages.length, fetchData, stagesLoading]);

  const handleRefresh = () => {
    void fetchData(true);
  };

  const fetchNoteCounts = (rows: SubmissionPortalRow[] | null | undefined) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const counts: Record<string, number> = {};

    safeRows.forEach((r) => {
      counts[r.id] = (r.notes || '').trim() ? 1 : 0;
    });

    setNoteCounts(counts);
  };

  const persistPublisherStage = useCallback(
    async (userId: string, stageKey: string, notes?: string | null) => {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id ?? null;
      const payload: {
        user_id: string;
        stage_key: string;
        updated_by: string | null;
        notes?: string | null;
      } = {
        user_id: userId,
        stage_key: stageKey,
        updated_by: authUserId,
      };

      if (notes !== undefined) {
        payload.notes = notes && notes.trim() ? notes.trim() : null;
      }

      const client = supabase as unknown as {
        from: (table: string) => {
          upsert: (
            row: typeof payload,
            opts: { onConflict: string }
          ) => Promise<{ error: { message?: string } | null }>;
        };
      };

      return client
        .from("bpo_onboarding_portal_user_stages")
        .upsert(payload, { onConflict: "user_id" });
    },
    []
  );

  const handleDropToStage = async (rowId: string, stageKey: string) => {
    const stage = dbSubmissionStages.find((s) => s.key === stageKey);
    if (!stage) return;

    const previousData = data;
    setData((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              stage_id: stage.key,
              display_stage_key: stage.key,
              status: stage.label,
              pipeline_name: BPO_ONBOARDING_PORTAL_PIPELINE,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );

    const { error } = await persistPublisherStage(rowId, stage.key);

    if (error) {
      setData(previousData);
      toast({
        title: 'Stage Update Failed',
        description: error.message || 'Failed to save publisher stage.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Stage Updated',
      description: `Publisher moved to "${getBpoPortalStageDisplayLabel(stage.label)}".`,
    });
  };

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, SubmissionPortalRow[]>();
    kanbanStages.forEach((stage) => grouped.set(stage.key, []));
    filteredData.forEach((row) => {
      const stageKey = deriveStageKey(row);
      grouped.get(stageKey)?.push(row);
    });
    return grouped;
  }, [filteredData, kanbanStages, deriveStageKey]);

  useEffect(() => {
    setColumnPage((prev) => {
      const next: Record<string, number> = { ...prev };
      kanbanStages.forEach((stage) => {
        const rows = leadsByStage.get(stage.key) || [];
        const pageSize = 25;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const current = Number(next[stage.key] ?? 1);
        next[stage.key] = Math.min(Math.max(1, current), totalPages);
      });
      return next;
    });
  }, [kanbanStages, leadsByStage]);

  const getStageDisplayLabel = (label: string) => getBpoPortalStageDisplayLabel(label);

  const allParentStageLabels = useMemo(
    () => parentStages.map((s) => s.label),
    [parentStages]
  );

  const editStageMatches = useMemo(() => {
    const pool = allParentStageLabels;
    const query = (editStage || '').trim().toLowerCase();
    if (!query) return pool;
    return pool.filter((label) => label.toLowerCase().includes(query));
  }, [allParentStageLabels, editStage]);

  // Available reasons for the currently selected parent in the edit form.
  const editAvailableReasons = useMemo(() => {
    const parentLabel = (editStage || '').trim();
    return reasonsByParent[parentLabel] || [];
  }, [editStage, reasonsByParent]);

  if (loading) {
    return <LogoLoader page label="Loading BPO portal..." />;
  }

  if (dbSubmissionStages.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            BPO onboarding stages are not configured. Run the migration that creates
            public.bpo_onboarding_portal_stages before using this board.
          </div>
        </div>
      </div>
    );
  }

  const handleOpenEdit = (row: SubmissionPortalRow) => {
    setEditRow(row);
    const stageId = row.display_stage_key || row.stage_id || '';
    const currentLabel =
      dbSubmissionStages.find((s) => s.key === stageId)?.label ||
      dbSubmissionStages.find((s) => s.id === stageId)?.label ||
      '';
    const { parent, reason } = parseStageLabel(currentLabel.trim());
    setEditStage(parent);
    setEditReason(reason || '');
    setEditNotes(row.notes || '');
    setEditStageOpen(false);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editRow) return;
    const parentLabel = (editStage || '').trim();
    if (!parentLabel) return;

    const reasons = reasonsByParent[parentLabel];
    const selectedReason = (editReason || '').trim();
    const nextStage = reasons && reasons.length > 0 && selectedReason
      ? buildStatusLabel(parentLabel, selectedReason)
      : parentLabel;
    const nextStageRow = dbSubmissionStages.find((s) => s.label === nextStage);

    if (!nextStageRow) return;

    setEditSaving(true);

    const trimmedNote = (editNotes || '').trim();
    const nextNotes = trimmedNote || undefined;
    const nowIso = new Date().toISOString();
    const optimisticUpdate = (r: SubmissionPortalRow) =>
      r.id === editRow.id
        ? {
            ...r,
            stage_id: nextStageRow.key,
            display_stage_key: nextStageRow.key,
            notes: nextNotes,
            status: nextStageRow.label,
            pipeline_name: BPO_ONBOARDING_PORTAL_PIPELINE,
            updated_at: nowIso,
          }
        : r;

    try {
      const { error } = await persistPublisherStage(editRow.id, nextStageRow.key, trimmedNote);

      if (error) {
        toast({
          title: 'Publisher Update Failed',
          description: error.message || 'Failed to save publisher stage.',
          variant: 'destructive',
        });
        return;
      }

      setData((prev) => prev.map(optimisticUpdate));
      setFilteredData((prev) => prev.map(optimisticUpdate));
      setNoteCounts((prev) => ({
        ...prev,
        [editRow.id]: nextNotes ? 1 : 0,
      }));

      toast({
        title: 'Publisher Updated',
        description: 'Stage and notes saved.',
      });

      setEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(300px,1fr)_auto_auto]">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Search</Label>
                  <div className="relative" ref={searchDropdownRef}>
                    <Input
                      ref={searchInputRef}
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSearchDropdownOpen(true);
                      }}
                      onFocus={() => setSearchDropdownOpen(true)}
                      onBlur={() => {
                        window.setTimeout(() => setSearchDropdownOpen(false), 200);
                      }}
                      placeholder="Search by BPO, company, phone..."
                      className="w-full"
                    />

                    {searchDropdownOpen && (() => {
                      const query = searchTerm.trim().toLowerCase();
                      const base = data;
                      const suggestions = (query ? base : base).filter((lead) => {
                        if (!query) return true;
                        const name = (lead.insured_name || "").toLowerCase();
                        const firm = (lead.lead_vendor || "").toLowerCase();
                        const phone = (lead.client_phone_number || "").toLowerCase();
                        return name.includes(query) || firm.includes(query) || phone.includes(query);
                      });

                      const displayItems = suggestions.slice(0, 50);
                      if (displayItems.length === 0) return null;

                      return (
                        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                          {displayItems.map((lead) => {
                            const name = (lead.insured_name || "N/A").trim() || "N/A";
                            const firm = (lead.lead_vendor || "").trim();
                            const phone = (lead.client_phone_number || "").trim();
                            const sub = [firm, phone].filter(Boolean).join(" • ");
                            const nextTerm = (lead.insured_name || lead.lead_vendor || lead.client_phone_number || "").trim();

                            return (
                              <button
                                key={lead.id}
                                type="button"
                                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSearchTerm(nextTerm);
                                  setSearchDropdownOpen(false);
                                }}
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="truncate font-medium">{name}</span>
                                  {sub ? <span className="truncate text-xs text-muted-foreground">{sub}</span> : null}
                                </div>
                              </button>
                            );
                          })}

                          {suggestions.length > 50 && (
                            <div className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                              {suggestions.length - 50} more results...
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <Button
                  type="button"
                  variant={showFilterRow ? "default" : "outline"}
                  className="gap-2 xl:self-end"
                  onClick={() => setShowFilterRow((prev) => !prev)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </Button>
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 xl:self-end"
                    onClick={handleClearFilters}
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                ) : (
                  <div className="hidden xl:block" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="px-3 py-1">
                  {filteredData.length} publisher admins
                </Badge>
                <Button onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {showFilterRow && (
              <div className="mt-4 border-t pt-4">
                <div className="grid gap-3 xl:grid-cols-[repeat(5,minmax(170px,1fr))]">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Company</Label>
                    <Select value={leadVendorFilter} onValueChange={(v) => setLeadVendorFilter(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Companies" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__ALL__">All Companies</SelectItem>
                          {leadVendorOptions.map((vendor) => (
                            <SelectItem key={vendor} value={vendor}>
                              {vendor}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Country</Label>
                    <Select value={countryFilter} onValueChange={setCountryFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Countries" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={CENTER_FILTER_ALL}>All Countries</SelectItem>
                          {countryOptions.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Company Size</Label>
                    <Select value={companySizeFilter} onValueChange={setCompanySizeFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Sizes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={CENTER_FILTER_ALL}>All Sizes</SelectItem>
                          {COMPANY_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Status</Label>
                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__ALL__">All Statuses</SelectItem>
                          {dbSubmissionStages.map((s) => (
                            <SelectItem key={s.key} value={s.label}>
                              {getBpoPortalStageDisplayLabel(s.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Date</Label>
                    <Select
                      value={timeRange}
                      onValueChange={(v) => {
                        const next = v as DateRange;
                        if (next === "custom" && timeRange !== "custom") {
                          const seed: PresetDateRange = timeRange === "all_time" ? "this_month" : (timeRange as PresetDateRange);
                          const bounds = getPresetRangeBounds(seed);
                          setCustomStartDate(bounds.start.toISOString().slice(0, 10));
                          setCustomEndDate(bounds.end.toISOString().slice(0, 10));
                        }
                        setTimeRange(next);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all_time">All Time</SelectItem>
                          <SelectItem value="this_week">This Week</SelectItem>
                          <SelectItem value="last_week">Last Week</SelectItem>
                          <SelectItem value="this_month">This Month</SelectItem>
                          <SelectItem value="last_month">Last Month</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {timeRange === "custom" && (
                  <div className="mt-2 grid grid-cols-2 gap-4 max-w-[360px]">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Start Date</Label>
                      <Input
                        type="date"
                        className="w-full pr-10 tabular-nums"
                        value={customStartDate}
                        max={customEndDate || undefined}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">End Date</Label>
                      <Input
                        type="date"
                        className="w-full pr-10 tabular-nums"
                        value={customEndDate}
                        min={customStartDate || undefined}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto" onDragOver={handleKanbanDragOver}>
            <div className="p-4">
              <div
                className="flex min-h-0 gap-3 pr-2"
                style={{ minWidth: `${kanbanStages.length * 18}rem` }}
              >
                {kanbanStages.map((stage) => {
                  const rows = leadsByStage.get(stage.key) || [];
                  const pageSize = 25;
                  const current = Number(columnPage[stage.key] ?? 1);
                  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                  const startIndex = (current - 1) * pageSize;
                  const endIndex = startIndex + pageSize;
                  const pageRows = rows.slice(startIndex, endIndex);

                  return (
                    <Card
                      key={stage.key}
                      className={
                        "flex min-h-[560px] w-[26rem] flex-col bg-muted/20 " +
                        stageTheme[stage.key].column +
                        (dragOverStage === stage.key ? " ring-2 ring-primary/30" : "")
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setDragOverStage(stage.key)}
                      onDragLeave={() => setDragOverStage((prev) => (prev === stage.key ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedId = e.dataTransfer.getData('text/plain');
                        if (!droppedId) return;
                        void handleDropToStage(droppedId, stage.key);
                        setDraggingId(null);
                        setDragOverStage(null);
                      }}
                    >
                      <CardHeader
                        className={
                          "flex flex-row items-center justify-between border-b px-3 py-2 " +
                          stageTheme[stage.key].header
                        }
                      >
                        <CardTitle className="text-sm font-semibold">{getStageDisplayLabel(stage.label)}</CardTitle>
                        <Badge variant="secondary">{rows.length}</Badge>
                      </CardHeader>
                      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                        {pageRows.length === 0 ? (
                          <div className="flex flex-1 h-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                            No publishers
                          </div>
                        ) : (
                          pageRows.map((row) => {
                            const publisherRole = row.agent || "-";
                            const accountStatus = row.call_result || "-";

                            return (
                              <Card
                                key={row.ui_id ?? row.id}
                                draggable
                                onClick={() => handleOpenEdit(row)}
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', row.id);
                                  setDraggingId(row.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingId(null);
                                  setDragOverStage(null);
                                }}
                                className={
                                  "w-full transition cursor-pointer " +
                                  (draggingId === row.id ? "opacity-70" : "")
                                }
                              >
                                <CardContent className="p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold">{row.insured_name || '—'}</div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                          <span>{row.client_phone_number || '—'}</span>
                                          <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                            <StickyNote className="h-3.5 w-3.5" />
                                            <span>{noteCounts[row.id] ?? 0}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="shrink-0">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenEdit(row);
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <Badge variant="secondary" className="text-xs">{row.lead_vendor || '—'}</Badge>
                                    <div className="text-xs text-muted-foreground">{row.date || ''}</div>
                                  </div>

                                  {(() => {
                                    const { reason } = parseStageLabel((row.status || '').trim());
                                    return reason ? (
                                      <div className="mt-1.5">
                                        <Badge variant="outline" className="text-[11px] font-normal">{reason}</Badge>
                                      </div>
                                    ) : null;
                                  })()}

                                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                                    <div>
                                      <span className="font-medium">Publisher Role:</span> {publisherRole}
                                    </div>
                                    <div>
                                      <span className="font-medium">Account Status:</span> {accountStatus}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })
                        )}
                      </CardContent>
                      <div className="flex items-center justify-between border-t px-3 py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setColumnPage((prev) => ({
                              ...prev,
                              [stage.key]: Math.max(1, (Number(prev[stage.key] ?? 1) - 1)),
                            }))
                          }
                          disabled={current <= 1}
                        >
                          Previous
                        </Button>
                        <div className="text-xs text-muted-foreground">
                          Page {current} of {totalPages}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setColumnPage((prev) => ({
                              ...prev,
                              [stage.key]: Math.min(totalPages, (Number(prev[stage.key] ?? 1) + 1)),
                            }))
                          }
                          disabled={current >= totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditRow(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Publisher</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Stage</Label>
              <div className="relative">
                <Input
                  value={editStage}
                  placeholder="Type stage..."
                  onFocus={() => setEditStageOpen(true)}
                  onChange={(e) => {
                    setEditStage(e.target.value);
                    setEditReason('');
                    setEditStageOpen(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setEditStageOpen(false), 150);
                  }}
                />

                {editStageOpen && (
                  <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                    {editStageMatches.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">No matching found.</div>
                    ) : (
                      editStageMatches.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEditStage(label);
                            setEditReason('');
                            setEditStageOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {editAvailableReasons.length > 0 && (
              <div className="space-y-2">
                <Label>Reason</Label>
                <Select value={editReason} onValueChange={(v) => setEditReason(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {editAvailableReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={5} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveEdit} disabled={editSaving || !editStage}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubmissionPortalPage;
