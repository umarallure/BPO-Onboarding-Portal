import type { PipelineStage } from "@/hooks/usePipelineStages";

export const BPO_ONBOARDING_PORTAL_PIPELINE = "bpo_onboarding_portal";

// Bundled fallback used if public.bpo_onboarding_portal_stages is unavailable.
export const BPO_ONBOARDING_STAGE_KEYS = {
  readyToMoveForward: "ready_to_move_forward",
  groupChatCreated: "group_chat_created",
  loginsSent: "logins_sent",
  scheduledTraining: "scheduled_training",
  trainingRan: "training_ran",
  trainingCompleted: "training_completed",
  activeBpo: "active_bpo",
  nonActiveBpo: "non_active_bpo",
} as const;

export const BPO_ONBOARDING_STAGES: PipelineStage[] = [
  {
    id: BPO_ONBOARDING_STAGE_KEYS.readyToMoveForward,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.readyToMoveForward,
    label: "Ready to Move Forward",
    display_order: 1,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.groupChatCreated,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.groupChatCreated,
    label: "Group Chat Created",
    display_order: 2,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.loginsSent,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.loginsSent,
    label: "Logins Sent",
    display_order: 3,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.scheduledTraining,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.scheduledTraining,
    label: "Scheduled Training",
    display_order: 4,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.trainingRan,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.trainingRan,
    label: "Training Ran",
    display_order: 5,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.trainingCompleted,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.trainingCompleted,
    label: "Training Completed",
    display_order: 6,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.activeBpo,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.activeBpo,
    label: "Active BPO",
    display_order: 7,
    column_class: null,
    header_class: null,
    is_active: true,
  },
  {
    id: BPO_ONBOARDING_STAGE_KEYS.nonActiveBpo,
    pipeline: BPO_ONBOARDING_PORTAL_PIPELINE,
    key: BPO_ONBOARDING_STAGE_KEYS.nonActiveBpo,
    label: "Non-Active BPO",
    display_order: 8,
    column_class: null,
    header_class: null,
    is_active: true,
  },
];

const INACTIVE_ACCOUNT_STATUSES = new Set(["inactive", "disabled", "banned", "suspended"]);
const ACTIVE_ACCOUNT_STATUSES = new Set(["active", "enabled", "approved"]);

export const getPublisherFrontendStageKey = (accountStatus: string | null | undefined) => {
  const normalized = String(accountStatus ?? "").trim().toLowerCase();
  if (INACTIVE_ACCOUNT_STATUSES.has(normalized)) return BPO_ONBOARDING_STAGE_KEYS.nonActiveBpo;
  if (ACTIVE_ACCOUNT_STATUSES.has(normalized)) return BPO_ONBOARDING_STAGE_KEYS.activeBpo;
  return BPO_ONBOARDING_STAGE_KEYS.readyToMoveForward;
};
