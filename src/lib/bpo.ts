export const BPO_USER_ROLES = ["publisher_admin", "publisher_closer"] as const;

export type BpoUserRole = (typeof BPO_USER_ROLES)[number];

const INACTIVE_ACCOUNT_STATUSES = new Set(["inactive", "disabled", "banned", "suspended"]);

const normalize = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export const isBpoUserRole = (role: string | null | undefined): role is BpoUserRole =>
  BPO_USER_ROLES.includes(role as BpoUserRole);

export const isBpoAccountActive = (status: string | null | undefined) => {
  const normalized = normalize(status);
  if (!normalized) return true;
  return !INACTIVE_ACCOUNT_STATUSES.has(normalized);
};

export const formatBpoRoleLabel = (role: string | null | undefined) => {
  const normalized = normalize(role);
  if (normalized === "publisher_admin") return "Publisher Admin";
  if (normalized === "publisher_closer") return "Publisher Closer";
  return normalized
    ? normalized
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : "Not set";
};

export const splitBpoContactName = (displayName: string | null | undefined, email: string | null | undefined) => {
  const fallback = email?.split("@")[0] ?? "";
  const fullName = String(displayName ?? fallback).trim();
  const parts = fullName.split(/\s+/).filter(Boolean);

  return {
    fullName: fullName || "Unnamed BPO",
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
};

export const isHiddenMarketingStage = (stage: { key: string; label: string }) => {
  const key = normalize(stage.key).replace(/[\s-]+/g, "_");
  const label = normalize(stage.label);
  const hiddenTokens = ["connected", "non_connected", "not_connected"];

  return hiddenTokens.some((token) => key.includes(token) || label.includes(token.replace(/_/g, " ")));
};

export const getMarketingStageDisplayLabel = (label: string) => {
  const trimmed = String(label || "").trim();
  if (/scheduled\s+for\s+on\s*boarding/i.test(trimmed)) return "Scheduled for Onboarding";
  return trimmed;
};

export const getBpoPortalStageDisplayLabel = (label: string) => {
  const trimmed = String(label || "").trim();
  const withoutPrefix = trimmed.replace(/^Stage\s+\d+\s*:\s*/i, "");
  const lower = withoutPrefix.toLowerCase();

  if (lower === "ready to move forward") return "Ready to Move Forward";
  if (lower.startsWith("retainer sent")) return "Group Chat Created";
  if (lower.startsWith("retainer signed")) return "Logins Sent";
  if (lower === "scheduled onboarding") return "Scheduled Training";
  if (lower === "scheduled training") return "Scheduled Training";
  if (lower === "training") return "Training Ran";
  if (lower === "training ran") return "Training Ran";
  if (lower.startsWith("onboarded")) return "Training Ran";
  if (lower === "training completed") return "Training Completed";
  if (lower === "non-active bpo" || lower === "non active bpo") return "Non-Active BPO";
  if (lower.startsWith("active")) return "Active BPO";

  return withoutPrefix;
};

export const isFlowChatTagged = (row: {
  source?: string | null;
  campaign_software?: string | null;
  pipeline_name?: string | null;
}) => {
  const source = normalize(row.source);
  const campaign = normalize(row.campaign_software);
  const combined = `${source} ${campaign}`;

  return (
    combined.includes("flowchat") ||
    combined.includes("facebook") ||
    combined.includes("linkedin") ||
    combined.includes("linked in")
  );
};
