import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  Flame,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Target,
  PauseCircle,
  PlayCircle,
  Trash2,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIncentives, type IncentiveFormData, type Incentive } from "@/hooks/useIncentives";
import { useAttorneys } from "@/hooks/useAttorneys";
import { US_STATES } from "@/lib/us-states";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";

const MONEY_HEX = "#AE4010";

const STATUS_META: Record<string, { label: string; hex: string }> = {
  pending: { label: "Pending", hex: "#D9962B" },
  active: { label: "Active", hex: "#3A9D5C" },
  paused: { label: "Paused", hex: "#E8622A" },
  completed: { label: "Completed", hex: "#4A90D9" },
  expired: { label: "Expired", hex: "#8A8580" },
  rejected: { label: "Rejected", hex: "#DC2626" },
  archived: { label: "Archived", hex: "#8A8580" },
};

const formatMoney = (value: number | string | null | undefined) => {
  const amount = Number(value ?? 0);
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-US", {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })}`;
};

const typeMeta = (type: string) =>
  type === "first_to_finish"
    ? { label: "First to finish", Icon: Zap, hex: "#E8622A" }
    : { label: "Milestone", Icon: Target, hex: "#8A8580" };

const formatRule = (rule: { state?: string | null; max_sol_months?: number | null; attorney_id?: string | null }) =>
  [
    rule.state ? rule.state.toUpperCase() : null,
    rule.max_sol_months != null ? `SOL ≤ ${rule.max_sol_months}mo` : null,
    rule.attorney_id ? "Specific attorney" : null,
  ]
    .filter(Boolean)
    .join(" · ") || "All qualified cases";

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
      style={{ color: s.hex, backgroundColor: `${s.hex}1a`, border: `1px solid ${s.hex}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.hex }} />
      {s.label}
    </span>
  );
}

function TypeChip({ type }: { type: string }) {
  const t = typeMeta(type);
  const Icon = t.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]"
      style={{ color: t.hex, backgroundColor: `${t.hex}14` }}
    >
      <Icon className="h-3 w-3" />
      {t.label}
    </span>
  );
}

function ExpiryStamp({ endTime }: { endTime: string }) {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const expired = end <= now;
  const soon = !expired && end - now <= 86_400_000;
  const color = expired ? "#DC2626" : soon ? "#D9962B" : "var(--dash-text-muted)";
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      <Clock className="h-3 w-3" />
      {expired ? "Expired" : format(new Date(endTime), "MMM d, h:mm a")}
    </span>
  );
}

function StatCell({ label, value, hex }: { label: string; value: number; hex: string }) {
  return (
    <div className="min-w-[74px] rounded-xl border border-[var(--dash-border)] bg-background/40 px-4 py-2.5 text-center">
      <div className="text-2xl font-bold leading-none tabular-nums" style={{ color: hex }}>
        {value}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
        {label}
      </div>
    </div>
  );
}

function IncentiveRow({
  incentive,
  actions,
  index,
}: {
  incentive: Incentive;
  actions: ReactNode;
  index: number;
}) {
  const s = STATUS_META[incentive.status] ?? STATUS_META.pending;
  const rules = incentive.rules ?? [];

  return (
    <div
      className="dash-animate-in group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 pl-5 shadow-[var(--dash-shadow)] backdrop-blur-[var(--dash-blur)] transition-all duration-300 hover:border-[var(--dash-border-hover)] hover:shadow-[var(--dash-shadow-hover)] sm:flex-row sm:items-center sm:gap-5"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span
        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full transition-all duration-300 group-hover:top-0 group-hover:bottom-0"
        style={{ backgroundColor: s.hex }}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip type={incentive.target_type} />
          <h3
            className="truncate text-sm font-semibold text-[var(--dash-text)]"
            title={incentive.description || incentive.title}
          >
            {incentive.title}
          </h3>
          <StatusBadge status={incentive.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--dash-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Target className="h-3 w-3" />
            {incentive.target_type === "milestone"
              ? `${incentive.target_quantity} sales`
              : `First to ${incentive.target_quantity}`}
          </span>
          <span className="text-[var(--dash-border-hover)]">•</span>
          <ExpiryStamp endTime={incentive.end_time} />
          <span className="text-[var(--dash-border-hover)]">•</span>
          <span>Created {format(new Date(incentive.created_at), "MMM d")}</span>
        </div>

        {rules.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {rules.map((rule) => (
              <span
                key={rule.id}
                className="rounded-md border border-[var(--dash-border)] px-1.5 py-0.5 text-[10px] text-[var(--dash-text-muted)]"
              >
                {formatRule(rule)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[var(--dash-border)] pt-3 sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:pt-0">
        <div className="text-left leading-none sm:text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--dash-text-muted)]">
            Payout
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: MONEY_HEX }}>
            {formatMoney(incentive.payout_amount)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">{actions}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="dash-animate-in flex flex-col items-center rounded-2xl border border-dashed border-[var(--dash-border)] bg-[var(--dash-surface)] px-6 py-14 text-center backdrop-blur-[var(--dash-blur)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#AE4010]/10 text-[#AE4010]">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-[var(--dash-text)]">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-[var(--dash-text-muted)]">{sub}</p>
    </div>
  );
}

const defaultFormData: IncentiveFormData = {
  title: "",
  description: "",
  payout_amount: 0,
  target_type: "milestone",
  target_quantity: 1,
  end_time: "",
  rules: [{ state: "", max_sol_months: "", attorney_id: "" }],
};

export default function IncentivesPage() {
  const { incentives, loading, error, refetch, createIncentive, updateIncentiveStatus, deleteIncentive } =
    useIncentives();
  const { attorneys } = useAttorneys();
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState<IncentiveFormData>(defaultFormData);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (!createOpen) {
      setFormData(defaultFormData);
    }
  }, [createOpen]);

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.end_time) {
      toast.error("Expiration date/time is required");
      return;
    }
    if (formData.payout_amount <= 0) {
      toast.error("Payout amount must be greater than 0");
      return;
    }
    if (formData.target_quantity <= 0) {
      toast.error("Target quantity must be greater than 0");
      return;
    }

    const endDate = new Date(formData.end_time);
    if (Number.isNaN(endDate.getTime())) {
      toast.error("Expiration date/time is invalid");
      return;
    }
    if (endDate.getTime() <= Date.now()) {
      toast.error("Expiration must be in the future");
      return;
    }

    setSubmitting(true);
    const success = await createIncentive({
      ...formData,
      end_time: endDate.toISOString(),
    });
    setSubmitting(false);
    if (success) setCreateOpen(false);
  };

  const handleApprove = async (id: string) => {
    const incentive = incentives.find((item) => item.id === id);
    if (incentive && new Date(incentive.end_time).getTime() <= Date.now()) {
      toast.error("Cannot approve an incentive after its expiration time");
      return;
    }

    await updateIncentiveStatus(id, "active");
  };

  const handleReject = async (id: string) => {
    await updateIncentiveStatus(id, "rejected");
  };

  const handlePause = async (id: string) => {
    await updateIncentiveStatus(id, "paused");
  };

  const handleResume = async (id: string) => {
    const incentive = incentives.find((item) => item.id === id);
    if (incentive && new Date(incentive.end_time).getTime() <= Date.now()) {
      toast.error("Cannot resume an incentive after its expiration time");
      return;
    }

    await updateIncentiveStatus(id, "active");
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;

    const success = await deleteIncentive(deleteTargetId);
    if (success) setDeleteTargetId(null);
  };

  const updateForm = <K extends keyof IncentiveFormData>(field: K, value: IncentiveFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateRule = (index: number, field: string, value: string) => {
    setFormData((prev) => {
      const rules = [...prev.rules];
      rules[index] = { ...rules[index], [field]: value === "__any__" ? "" : value };
      return { ...prev, rules };
    });
  };

  const addRule = () => {
    setFormData((prev) => ({
      ...prev,
      rules: [...prev.rules, { state: "", max_sol_months: "", attorney_id: "" }],
    }));
  };

  const removeRule = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  const pendingIncentives = incentives.filter((i) => i.status === "pending");
  const activeIncentives = incentives.filter((i) => i.status === "active");
  const pausedIncentives = incentives.filter((i) => i.status === "paused");
  const deleteTarget = deleteTargetId
    ? incentives.find((incentive) => incentive.id === deleteTargetId) ?? null
    : null;

  const totalInPlay = useMemo(
    () => activeIncentives.reduce((sum, i) => sum + Number(i.payout_amount ?? 0), 0),
    [activeIncentives],
  );
  const endingSoon = useMemo(
    () =>
      activeIncentives.filter((i) => {
        const remaining = new Date(i.end_time).getTime() - Date.now();
        return remaining > 0 && remaining <= 86_400_000;
      }).length,
    [activeIncentives],
  );

  const isInitialLoading = loading && incentives.length === 0;

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#AE4010]/40 bg-[#AE4010]/10 text-[#AE4010]">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--dash-text)]">Incentives &amp; Flash Bonuses</h1>
              <p className="text-xs text-[var(--dash-text-muted)]">
                Mint, approve, and steer campaigns. Publishers only ever see approved, active bonuses.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              className="border-[var(--dash-border)] bg-background/50 text-[var(--dash-text)] hover:bg-background/80"
            >
              <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  New Flash Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-[#AE4010]" />
                    Create New Flash Incentive
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Incentive Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => updateForm("title", e.target.value)}
                      placeholder='e.g. "Florida Sprint Bonus"'
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => updateForm("description", e.target.value)}
                      placeholder="Describe the challenge and what BPOs need to do"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="payout">Payout Amount ($)</Label>
                      <Input
                        id="payout"
                        type="number"
                        min={0}
                        step="0.01"
                        value={formData.payout_amount || ""}
                        onChange={(e) => updateForm("payout_amount", parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_time">Expires At</Label>
                      <Input
                        id="end_time"
                        type="datetime-local"
                        value={formData.end_time}
                        onChange={(e) => updateForm("end_time", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="target_type">Challenge Type</Label>
                      <Select
                        value={formData.target_type}
                        onValueChange={(v: "first_to_finish" | "milestone") =>
                          updateForm("target_type", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="milestone">Milestone (Do X sales)</SelectItem>
                          <SelectItem value="first_to_finish">First to Finish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="target_quantity">Target Quantity</Label>
                      <Input
                        id="target_quantity"
                        type="number"
                        min={1}
                        value={formData.target_quantity}
                        onChange={(e) =>
                          updateForm("target_quantity", parseInt(e.target.value) || 1)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Criteria Rules</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addRule}>
                        <Plus className="mr-1 h-3 w-3" />
                        Add Rule
                      </Button>
                    </div>

                    {formData.rules.map((rule, index) => (
                      <div key={index} className="flex items-start gap-2 rounded-lg border p-3">
                        <div className="grid flex-1 grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              State
                            </Label>
                            <Select
                              value={rule.state}
                              onValueChange={(v) => updateRule(index, "state", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Any" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__any__">Any State</SelectItem>
                                {US_STATES.map((s) => (
                                  <SelectItem key={s.code} value={s.code}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Max SOL (months)
                            </Label>
                            <Input
                              className="h-8 text-xs"
                              type="number"
                              min={0}
                              placeholder="Any"
                              value={rule.max_sol_months}
                              onChange={(e) =>
                                updateRule(index, "max_sol_months", e.target.value)
                              }
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Attorney
                            </Label>
                            <Select
                              value={rule.attorney_id}
                              onValueChange={(v) =>
                                updateRule(index, "attorney_id", v === "__any__" ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Any" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__any__">Any Attorney</SelectItem>
                                {attorneys.map((a) => (
                                  <SelectItem key={a.user_id} value={a.user_id}>
                                    {a.full_name || a.primary_email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {formData.rules.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRule(index)}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleCreate}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit for Approval"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Control-room hero */}
        <section className="dash-animate-in relative overflow-hidden rounded-2xl border border-[#AE4010]/35 bg-[var(--dash-surface)] shadow-[var(--dash-shadow)] backdrop-blur-[var(--dash-blur)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(120deg, rgba(174,64,16,0.12) 0%, rgba(174,64,16,0.03) 45%, transparent 75%)" }}
          />
          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-muted)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: MONEY_HEX }} />
                Flash bonus control
              </p>
              <p className="mt-2 text-[34px] font-bold leading-none tabular-nums" style={{ color: MONEY_HEX }}>
                {formatMoney(totalInPlay)}
                <span className="ml-2 text-sm font-medium text-[var(--dash-text-muted)]">in play</span>
              </p>
              <p className="mt-1.5 text-xs text-[var(--dash-text-muted)]">
                committed across {activeIncentives.length} live campaign{activeIncentives.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatCell label="Awaiting" value={pendingIncentives.length} hex={STATUS_META.pending.hex} />
              <StatCell label="Live" value={activeIncentives.length} hex={STATUS_META.active.hex} />
              <StatCell label="Paused" value={pausedIncentives.length} hex={STATUS_META.paused.hex} />
            </div>
          </div>
          {endingSoon > 0 && (
            <div className="relative flex items-center gap-2 border-t border-[#D9962B]/25 bg-[#D9962B]/8 px-5 py-2.5 text-xs font-medium text-[#D9962B]">
              <AlertTriangle className="h-4 w-4" />
              {endingSoon} live bonus{endingSoon === 1 ? "" : "es"} expiring within 24 hours
            </div>
          )}
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <Tabs defaultValue="pending">
          <TabsList className="h-auto gap-1 border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1 backdrop-blur-[var(--dash-blur)]">
            <TabsTrigger
              value="pending"
              className="text-[var(--dash-text-muted)] data-[state=active]:bg-[#AE4010]/12 data-[state=active]:text-[#AE4010]"
            >
              Pending Approval
              {pendingIncentives.length > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                  style={{ backgroundColor: `${STATUS_META.pending.hex}26`, color: STATUS_META.pending.hex }}
                >
                  {pendingIncentives.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="active"
              className="text-[var(--dash-text-muted)] data-[state=active]:bg-[#AE4010]/12 data-[state=active]:text-[#AE4010]"
            >
              Active
              {activeIncentives.length > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                  style={{ backgroundColor: `${STATUS_META.active.hex}26`, color: STATUS_META.active.hex }}
                >
                  {activeIncentives.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="paused"
              className="text-[var(--dash-text-muted)] data-[state=active]:bg-[#AE4010]/12 data-[state=active]:text-[#AE4010]"
            >
              Paused
              {pausedIncentives.length > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                  style={{ backgroundColor: `${STATUS_META.paused.hex}26`, color: STATUS_META.paused.hex }}
                >
                  {pausedIncentives.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="all"
              className="text-[var(--dash-text-muted)] data-[state=active]:bg-[#AE4010]/12 data-[state=active]:text-[#AE4010]"
            >
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {isInitialLoading ? (
              <LoadingRows />
            ) : pendingIncentives.length === 0 ? (
              <EmptyState
                icon={<CheckCircle className="h-6 w-6" />}
                title="Nothing awaiting approval"
                sub="New campaigns submitted for review will queue up here for your sign-off."
              />
            ) : (
              pendingIncentives.map((incentive, index) => (
                <IncentiveRow
                  key={incentive.id}
                  incentive={incentive}
                  index={index}
                  actions={
                    <>
                      <Button size="sm" className="h-8" onClick={() => handleApprove(incentive.id)}>
                        <CheckCircle className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-[var(--dash-border)] bg-background/40"
                        onClick={() => handleReject(incentive.id)}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTargetId(incentive.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-4 space-y-3">
            {isInitialLoading ? (
              <LoadingRows />
            ) : activeIncentives.length === 0 ? (
              <EmptyState
                icon={<Zap className="h-6 w-6" />}
                title="No live bonuses right now"
                sub="Approve a pending campaign and it will go live for publishers instantly."
              />
            ) : (
              activeIncentives.map((incentive, index) => (
                <IncentiveRow
                  key={incentive.id}
                  incentive={incentive}
                  index={index}
                  actions={
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-[var(--dash-border)] bg-background/40"
                        onClick={() => handlePause(incentive.id)}
                      >
                        <PauseCircle className="mr-1 h-4 w-4" />
                        Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTargetId(incentive.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="paused" className="mt-4 space-y-3">
            {isInitialLoading ? (
              <LoadingRows />
            ) : pausedIncentives.length === 0 ? (
              <EmptyState
                icon={<PauseCircle className="h-6 w-6" />}
                title="No paused campaigns"
                sub="Bonuses you pause stay hidden from publishers until you resume them."
              />
            ) : (
              pausedIncentives.map((incentive, index) => (
                <IncentiveRow
                  key={incentive.id}
                  incentive={incentive}
                  index={index}
                  actions={
                    <>
                      <Button size="sm" className="h-8" onClick={() => handleResume(incentive.id)}>
                        <PlayCircle className="mr-1 h-4 w-4" />
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTargetId(incentive.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <div className="dash-animate-in overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[var(--dash-shadow)] backdrop-blur-[var(--dash-blur)]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--dash-border)] hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Campaign
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Status
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Payout
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Target
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Expires
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Created
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-[0.06em] text-[var(--dash-text-muted)]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incentives.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-[var(--dash-text-muted)]">
                        {isInitialLoading ? "Loading incentives…" : "No incentives found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    incentives.map((incentive) => (
                      <TableRow key={incentive.id} className="border-[var(--dash-border)]">
                        <TableCell className="font-medium text-[var(--dash-text)]">
                          <div className="flex items-center gap-2">
                            <TypeChip type={incentive.target_type} />
                            <span className="truncate">{incentive.title}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={incentive.status} />
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums" style={{ color: MONEY_HEX }}>
                          {formatMoney(incentive.payout_amount)}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--dash-text-muted)]">
                          {incentive.target_type === "milestone"
                            ? `${incentive.target_quantity} sales`
                            : `First to ${incentive.target_quantity}`}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--dash-text-muted)]">
                          {format(new Date(incentive.end_time), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--dash-text-muted)]">
                          {format(new Date(incentive.created_at), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {incentive.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[var(--dash-border)] bg-background/40"
                                  onClick={() => handleApprove(incentive.id)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-[var(--dash-border)] bg-background/40"
                                  onClick={() => handleReject(incentive.id)}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {incentive.status === "active" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[var(--dash-border)] bg-background/40"
                                onClick={() => handlePause(incentive.id)}
                              >
                                <PauseCircle className="mr-1 h-4 w-4" />
                                Pause
                              </Button>
                            )}
                            {incentive.status === "paused" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[var(--dash-border)] bg-background/40"
                                onClick={() => handleResume(incentive.id)}
                              >
                                <PlayCircle className="mr-1 h-4 w-4" />
                                Resume
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTargetId(incentive.id)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        <AlertDialog open={Boolean(deleteTargetId)} onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove incentive?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `This will remove "${deleteTarget.title}" from the admin and publisher views. Pending incentives with no activity are deleted; incentives with lifecycle, progress, or payout history are archived for auditability.`
                  : "This will remove this incentive from normal views and preserve financial history when present."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleConfirmDelete}
              >
                Remove incentive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 pl-5"
        >
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-[var(--dash-border-hover)]" />
            <div className="h-2.5 w-64 animate-pulse rounded bg-[var(--dash-border)]" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded bg-[var(--dash-border-hover)]" />
        </div>
      ))}
    </>
  );
}
