import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowUpRight,
  Building2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

import LogoLoader from "@/components/LogoLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  BPO_USER_ROLES,
  formatBpoRoleLabel,
  isBpoAccountActive,
  splitBpoContactName,
} from "@/lib/bpo";
import { cn } from "@/lib/utils";

type AppUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  center_id?: string | null;
  account_status?: string | null;
  created_at: string;
  updated_at: string;
};

type CenterRow = {
  id: string;
  center_name: string;
  lead_vendor: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active?: boolean | null;
  admin_user_id?: string | null;
  slack_channel?: string | null;
  center_did?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BpoAccountItem = AppUserRow & {
  center: CenterRow | null;
};

const DASH_INPUT_CLASS =
  "h-10 border-[var(--dash-border)] bg-background/80 text-[13px] text-[var(--dash-text)] placeholder:text-[var(--dash-text-muted)]/55 backdrop-blur-sm focus:border-[#AE4010]/45 focus:ring-[#AE4010]/30";
const DASH_SCROLLBAR_CLASS = "dash-scrollbar";

function SectionCard({
  icon,
  title,
  description,
  children,
  className,
  bodyClassName,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-[#AE4010]/50 bg-[var(--dash-surface)] shadow-[var(--dash-shadow)] backdrop-blur-[var(--dash-blur)] transition-all duration-300 hover:border-[#AE4010]/65 hover:shadow-[0_14px_30px_rgba(174,64,16,0.14)] focus-within:border-[#AE4010]/75 focus-within:shadow-[0_16px_34px_rgba(174,64,16,0.18)]",
        className
      )}
    >
      <div className="relative flex items-start gap-3 border-b border-[#AE4010]/12 bg-[linear-gradient(90deg,rgba(174,64,16,0.18)_0%,rgba(174,64,16,0.1)_28%,rgba(174,64,16,0.04)_54%,rgba(174,64,16,0)_84%)] px-5 py-3.5">
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#AE4010] via-[#AE4010]/50 to-transparent" />
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#AE4010]/45 bg-[#AE4010]/10 text-[#AE4010]">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[var(--dash-text)]">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-5 text-[var(--dash-text-muted)]">{description}</p>
          ) : null}
        </div>
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "N/A";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const normalizeAccountStatus = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "active";
  return normalized;
};

const formatAccountStatusLabel = (value: string | null | undefined) => {
  return normalizeAccountStatus(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getAccountStatusBadgeClass = (value: string | null | undefined, center?: CenterRow | null) => {
  const active = isBpoAccountActive(value) && center?.is_active !== false;

  if (active) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
};

const getBpoName = (account: BpoAccountItem | null | undefined) =>
  account?.center?.center_name || account?.center?.lead_vendor || "No BPO assigned";

const formatOptional = (value: string | null | undefined) => {
  const trimmed = String(value ?? "").trim();
  return trimmed || "Not set";
};

const BpoManagementPage = () => {
  const { toast } = useToast();
  const bpoPortalUrl = import.meta.env.VITE_BPO_PORTAL_URL?.trim() || undefined;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [launchingUserId, setLaunchingUserId] = useState<string | null>(null);
  const [statusUpdatingUserId, setStatusUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [bpoAccounts, setBpoAccounts] = useState<BpoAccountItem[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadBpoAccounts = useCallback(async () => {
    setError(null);

    try {
      const client = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            in: (
              column: string,
              values: readonly string[]
            ) => {
              order: (
                column: string,
                options?: { ascending?: boolean; nullsFirst?: boolean }
              ) => Promise<{ data: AppUserRow[] | null; error: { message?: string } | null }>;
            };
            order: (
              column: string,
              options?: { ascending?: boolean; nullsFirst?: boolean }
            ) => Promise<{ data: CenterRow[] | null; error: { message?: string } | null }>;
          };
        };
      };

      const [appUsersRes, centersRes] = await Promise.all([
        client
          .from("app_users")
          .select("user_id,email,display_name,role,account_status,center_id,created_at,updated_at")
          .in("role", BPO_USER_ROLES)
          .order("created_at", { ascending: false }),
        client
          .from("centers")
          .select("id,center_name,lead_vendor,contact_email,contact_phone,is_active,admin_user_id,slack_channel,center_did,created_at,updated_at")
          .order("center_name", { ascending: true }),
      ]);

      if (appUsersRes.error) {
        throw new Error(appUsersRes.error.message || "Failed to load BPO accounts");
      }
      if (centersRes.error) {
        throw new Error(centersRes.error.message || "Failed to load BPO centers");
      }

      const centers = centersRes.data ?? [];
      const centerById = new Map(centers.map((center) => [center.id, center]));
      const centerByAdminUserId = new Map(
        centers
          .filter((center) => center.admin_user_id)
          .map((center) => [center.admin_user_id as string, center])
      );

      const merged = (appUsersRes.data ?? [])
        .filter((row) => row.user_id)
        .map((row) => ({
          ...row,
          center:
            (row.center_id ? centerById.get(row.center_id) : null) ??
            centerByAdminUserId.get(row.user_id) ??
            null,
        }));

      setBpoAccounts(merged);
      setSelectedUserId((current) => {
        if (current && merged.some((account) => account.user_id === current)) return current;
        return merged[0]?.user_id ?? null;
      });
    } catch (loadError) {
      setBpoAccounts([]);
      setSelectedUserId(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load BPO accounts.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      await loadBpoAccounts();
      if (mounted) setLoading(false);
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [loadBpoAccounts]);

  const handleRefresh = useCallback(async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (refreshing) return;

    setRefreshing(true);
    try {
      await loadBpoAccounts();
    } finally {
      setRefreshing(false);
    }
  }, [loadBpoAccounts, refreshing]);

  const filteredBpoAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return bpoAccounts;

    return bpoAccounts.filter((account) => {
      const name = splitBpoContactName(account.display_name, account.email);
      const center = account.center;
      const haystack = [
        name.fullName,
        name.firstName,
        name.lastName,
        account.email ?? "",
        account.user_id,
        account.role ?? "",
        center?.center_name ?? "",
        center?.lead_vendor ?? "",
        center?.contact_email ?? "",
        center?.contact_phone ?? "",
        center?.center_did ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [bpoAccounts, query]);

  useEffect(() => {
    if (filteredBpoAccounts.length === 0) return;
    if (selectedUserId && filteredBpoAccounts.some((account) => account.user_id === selectedUserId)) return;
    setSelectedUserId(filteredBpoAccounts[0].user_id);
  }, [filteredBpoAccounts, selectedUserId]);

  const selectedBpo = useMemo(
    () => bpoAccounts.find((account) => account.user_id === selectedUserId) ?? null,
    [bpoAccounts, selectedUserId]
  );
  const selectedName = splitBpoContactName(selectedBpo?.display_name, selectedBpo?.email);
  const selectedBpoIsActive = selectedBpo
    ? isBpoAccountActive(selectedBpo.account_status) && selectedBpo.center?.is_active !== false
    : false;
  const isUpdatingSelectedBpoStatus = selectedBpo ? statusUpdatingUserId === selectedBpo.user_id : false;

  const handleAccountStatusToggle = useCallback(
    async (checked: boolean) => {
      if (!selectedBpo) return;

      const nextStatus = checked ? "active" : "inactive";
      const previousStatus = selectedBpo.account_status ?? null;
      const previousUpdatedAt = selectedBpo.updated_at;
      const previousCenterActive = selectedBpo.center?.is_active ?? null;

      setStatusUpdatingUserId(selectedBpo.user_id);
      setBpoAccounts((current) =>
        current.map((account) =>
          account.user_id === selectedBpo.user_id
            ? {
                ...account,
                account_status: nextStatus,
                updated_at: new Date().toISOString(),
                center: account.center ? { ...account.center, is_active: checked } : account.center,
              }
            : account
        )
      );

      try {
        const appUsersUpdate = supabase as unknown as {
          from: (table: string) => {
            update: (values: Record<string, unknown>) => {
              eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
            };
          };
        };

        const { error: updateError } = await appUsersUpdate
          .from("app_users")
          .update({ account_status: nextStatus })
          .eq("user_id", selectedBpo.user_id);

        if (updateError) {
          throw new Error(updateError.message || "Failed to update BPO account status");
        }

        if (selectedBpo.center?.id) {
          const { error: centerError } = await appUsersUpdate
            .from("centers")
            .update({ is_active: checked })
            .eq("id", selectedBpo.center.id);

          if (centerError) {
            throw new Error(centerError.message || "Failed to update BPO center status");
          }
        }

        toast({
          title: checked ? "BPO activated" : "BPO deactivated",
          description: checked
            ? "This BPO can access the portal again."
            : "This BPO will be blocked from launching the portal until reactivated.",
        });
      } catch (statusError) {
        setBpoAccounts((current) =>
          current.map((account) =>
            account.user_id === selectedBpo.user_id
              ? {
                  ...account,
                  account_status: previousStatus,
                  updated_at: previousUpdatedAt,
                  center: account.center
                    ? { ...account.center, is_active: previousCenterActive }
                    : account.center,
                }
              : account
          )
        );

        toast({
          title: "Status update failed",
          description:
            statusError instanceof Error ? statusError.message : "Unable to update the BPO account status.",
          variant: "destructive",
        });
      } finally {
        setStatusUpdatingUserId(null);
      }
    },
    [selectedBpo, toast]
  );

  const handleOpenPortal = useCallback(async () => {
    if (!selectedBpo) return;

    const popup = window.open("", "_blank");
    if (!popup) {
      toast({
        title: "Popup blocked",
        description: "Allow popups for this site so we can open the BPO portal in a new window.",
        variant: "destructive",
      });
      return;
    }

    try {
      popup.opener = null;
      popup.document.title = "Opening BPO Portal...";
      popup.document.body.style.margin = "0";
      popup.document.body.innerHTML =
        "<div style=\"font-family:Inter,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8f7f4;color:#3b2a1f;\">Launching BPO portal...</div>";
    } catch {
      // The popup may already be cross-origin in some browsers; the redirect below is enough.
    }

    setLaunchingUserId(selectedBpo.user_id);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-bpo-portal-launch", {
        method: "POST",
        body: {
          bpo_user_id: selectedBpo.user_id,
          requested_path: "/dashboard",
          bpo_portal_url: bpoPortalUrl,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || "Failed to create BPO portal launch");
      }

      if (!data?.actionLink || typeof data.actionLink !== "string") {
        throw new Error("Launch link was not returned by the server");
      }

      popup.location.replace(data.actionLink);

      toast({
        title: "BPO portal opened",
        description: `${selectedName.fullName || selectedBpo.email || "Selected BPO"} opened in a new BPO portal window.`,
      });
    } catch (launchError) {
      popup.close();
      toast({
        title: "Unable to open BPO portal",
        description:
          launchError instanceof Error
            ? launchError.message
            : "The BPO portal launch could not be created.",
        variant: "destructive",
      });
    } finally {
      setLaunchingUserId(null);
    }
  }, [selectedBpo, selectedName.fullName, bpoPortalUrl, toast]);

  return (
    <div className="dashboard-premium min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-[var(--dash-text)]">BPO Management</h1>
          <p className="mt-0.5 text-[12px] text-[var(--dash-text-muted)]">
            Search a BPO and open their portal instantly. This keeps the workflow fast while your onboarding session stays in place.
          </p>
        </div>

        <SectionCard
          icon={<Search className="h-3.5 w-3.5" />}
          title="Find BPO"
          description="Search by contact, company, email, phone, role, or user ID."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--dash-text-muted)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={loading}
                placeholder="Search BPO accounts..."
                className={cn(DASH_INPUT_CLASS, "pl-9")}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={(event) => {
                void handleRefresh(event);
              }}
              disabled={refreshing || loading}
              className="h-10 border-[var(--dash-border)] bg-background/70 text-[var(--dash-text-muted)] hover:bg-white/[0.03] hover:text-[var(--dash-text)]"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <SectionCard
            icon={<UserRound className="h-3.5 w-3.5" />}
            title="BPO Accounts"
            description={`${filteredBpoAccounts.length} result${filteredBpoAccounts.length === 1 ? "" : "s"}`}
            bodyClassName="p-3"
          >
            {loading ? (
              <div className="px-2 py-10">
                <LogoLoader label="Loading BPO accounts..." />
              </div>
            ) : filteredBpoAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--dash-border)] bg-white/[0.02] px-4 py-12 text-center">
                <p className="text-[12px] text-[var(--dash-text-muted)]">No BPO accounts matched your search.</p>
              </div>
            ) : (
              <div className={cn("max-h-[640px] space-y-2 overflow-auto pr-1", DASH_SCROLLBAR_CLASS)}>
                {filteredBpoAccounts.map((account) => {
                  const name = splitBpoContactName(account.display_name, account.email);
                  const isSelected = account.user_id === selectedUserId;

                  return (
                    <button
                      key={account.user_id}
                      type="button"
                      onClick={() => setSelectedUserId(account.user_id)}
                      className={cn(
                        "w-full rounded-xl border px-4 py-3 text-left transition-all",
                        isSelected
                          ? "border-[#AE4010]/45 bg-[#AE4010]/8 shadow-[0_12px_26px_rgba(174,64,16,0.12)]"
                          : "border-[var(--dash-border)] bg-white/[0.02] hover:border-[#AE4010]/28 hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-[var(--dash-text)]">{name.fullName}</div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--dash-text-muted)]">
                            {account.email || "No email available"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--dash-text-muted)]">
                            {getBpoName(account)}
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={cn("shrink-0 text-[10px]", getAccountStatusBadgeClass(account.account_status, account.center))}
                        >
                          {formatAccountStatusLabel(account.account_status)}
                        </Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--dash-text-muted)]">
                        <Badge
                          variant="outline"
                          className="border-[var(--dash-border)] bg-background/80 text-[10px] text-[var(--dash-text-muted)]"
                        >
                          {formatBpoRoleLabel(account.role)}
                        </Badge>
                        {account.center?.lead_vendor ? <span>{account.center.lead_vendor}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            icon={<Building2 className="h-3.5 w-3.5" />}
            title="BPO Details"
            description="Review the account and open the BPO portal."
          >
            {loading ? (
              <div className="rounded-2xl border border-dashed border-[var(--dash-border)] bg-white/[0.02] px-6 py-16 text-center">
                <LogoLoader label="Preparing BPO details..." />
              </div>
            ) : selectedBpo ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-[#AE4010]/50 bg-[linear-gradient(135deg,rgba(174,64,16,0.12)_0%,rgba(174,64,16,0.05)_42%,rgba(174,64,16,0)_100%)] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#AE4010]/25 bg-[#AE4010]/10 text-[#AE4010]">
                          <UserRound className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <div className="text-lg font-semibold text-[var(--dash-text)]">{selectedName.fullName}</div>
                            {selectedBpo.center?.contact_phone ? (
                              <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--dash-text-muted)]">
                                <Phone className="h-3.5 w-3.5" />
                                {selectedBpo.center.contact_phone}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">{getBpoName(selectedBpo)}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={getAccountStatusBadgeClass(selectedBpo.account_status, selectedBpo.center)}>
                          {formatAccountStatusLabel(selectedBpo.account_status)}
                        </Badge>
                        <Badge variant="outline" className="border-[var(--dash-border)] bg-background/80">
                          {formatBpoRoleLabel(selectedBpo.role)}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => window.open(`mailto:${selectedBpo.email ?? ""}`, "_blank")}
                        className="border-[var(--dash-border)] bg-background/70 text-[var(--dash-text-muted)] hover:bg-white/[0.03] hover:text-[var(--dash-text)]"
                        disabled={!selectedBpo.email}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Email
                      </Button>
                      <Button
                        onClick={handleOpenPortal}
                        disabled={
                          launchingUserId === selectedBpo.user_id ||
                          isUpdatingSelectedBpoStatus ||
                          !selectedBpoIsActive
                        }
                        className="bg-[#AE4010] text-white hover:bg-[#7c2c0a] disabled:opacity-50"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                        {launchingUserId === selectedBpo.user_id
                          ? "Opening..."
                          : selectedBpoIsActive
                            ? "Open BPO Portal"
                            : "Activate To Open"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#AE4010]/50 bg-[linear-gradient(135deg,rgba(174,64,16,0.08)_0%,rgba(174,64,16,0.03)_46%,rgba(174,64,16,0)_100%)] p-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dash-text)]">
                      Contact
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-start gap-3">
                        <Mail className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Email</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">{formatOptional(selectedBpo.email)}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">First / Last Name</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">
                            {[selectedName.firstName || "Not set", selectedName.lastName || "Not set"].join(" / ")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">BPO Name</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">{getBpoName(selectedBpo)}</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <MapPin className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Location</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">Not set</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex h-full flex-col rounded-xl border border-[#AE4010]/50 bg-[linear-gradient(135deg,rgba(174,64,16,0.08)_0%,rgba(174,64,16,0.03)_46%,rgba(174,64,16,0)_100%)] p-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--dash-text)]">
                      Snapshot
                    </div>
                    <div className="flex flex-1 flex-col space-y-3 text-sm">
                      <div className="flex items-start gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Company Size</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">Not set</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Experience</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">Not set</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Phone className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Center Contact</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">
                            {[selectedBpo.center?.contact_email, selectedBpo.center?.contact_phone].filter(Boolean).join(" / ") || "Not set"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <UserRound className="mt-0.5 h-4 w-4 text-[var(--dash-text-muted)]" />
                        <div>
                          <div className="text-[12px] font-medium text-[var(--dash-text)]">Last Updated</div>
                          <div className="text-[12px] text-[var(--dash-text-muted)]">{formatDate(selectedBpo.updated_at)}</div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "mt-auto rounded-lg px-3 py-3",
                          selectedBpoIsActive
                            ? "border border-rose-500/40 bg-[linear-gradient(135deg,rgba(244,63,94,0.14)_0%,rgba(244,63,94,0.08)_46%,rgba(244,63,94,0.03)_100%)]"
                            : "border border-emerald-500/40 bg-[linear-gradient(135deg,rgba(16,185,129,0.14)_0%,rgba(16,185,129,0.08)_46%,rgba(16,185,129,0.03)_100%)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-[12px] font-medium text-[var(--dash-text)]">
                              {selectedBpoIsActive ? "Deactivate" : "Activate"}
                            </div>
                            <div className="mt-1 text-[11px] text-[var(--dash-text-muted)]">
                              {selectedBpoIsActive
                                ? "Turn off portal access for this BPO."
                                : "Restore portal access for this BPO."}
                            </div>
                          </div>

                          <Switch
                            checked={selectedBpoIsActive}
                            onCheckedChange={(checked) => {
                              void handleAccountStatusToggle(checked);
                            }}
                            disabled={isUpdatingSelectedBpoStatus}
                            aria-label={selectedBpoIsActive ? "Deactivate BPO account" : "Activate BPO account"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--dash-border)] bg-white/[0.02] px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#AE4010]/20 bg-[#AE4010]/10 text-[#AE4010]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="text-[13px] font-medium text-[var(--dash-text)]">Select a BPO account</div>
                <div className="mt-1 text-[12px] text-[var(--dash-text-muted)]">
                  Choose a BPO from the list to review the account and open the portal.
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default BpoManagementPage;
