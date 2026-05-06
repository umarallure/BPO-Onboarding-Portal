-- Revert Submission Portal to original stages (keeping it as-is for other portals)
-- BPO Onboarding Portal stages live in public.bpo_onboarding_portal_stages.
-- Per-publisher board placement lives in public.bpo_onboarding_portal_user_stages.

-- First, ensure Submission Portal has its original stages
-- Parent stages are shown as columns, sub-stages (with " - " in label) are grouped under them
DELETE FROM portal_stages WHERE pipeline = 'submission_portal';

INSERT INTO portal_stages (pipeline, key, label, display_order)
VALUES
  -- Docs Pending (parent stage - shows as column)
  ('submission_portal', 'docs_pending', 'Docs Pending', 1),
  -- Sub-reasons under Docs Pending (grouped under parent)
  ('submission_portal', 'docs_pending_police_report', 'Docs Pending - Police Report Pending', 2),
  ('submission_portal', 'docs_pending_medical_report', 'Docs Pending - Medical Report Pending', 3),
  ('submission_portal', 'docs_pending_insurance_docs', 'Docs Pending - Insurance Docs Pending', 4),
  
  -- Retainer Sent (parent stage - shows as column)
  ('submission_portal', 'retainer_sent', 'Retainer Sent', 5),
  -- Sub-reasons under Retainer Sent (grouped under parent)
  ('submission_portal', 'retainer_sent_email', 'Retainer Sent - Email', 6),
  ('submission_portal', 'retainer_sent_mail', 'Retainer Sent - Mail', 7),
  
  -- Standalone stages (each shows as its own column)
  ('submission_portal', 'awaiting_retainer_signature', 'Awaiting Retainer Signature', 8),
  ('submission_portal', 'retainer_signed', 'Retainer Signed', 9),
  ('submission_portal', 'attorney_review', 'Attorney Review', 10),
  ('submission_portal', 'approved_payable', 'Approved - Payable', 11),
  ('submission_portal', 'paid_to_bpo', 'Paid to BPO', 12);

CREATE TABLE IF NOT EXISTS public.bpo_onboarding_portal_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL,
  column_class text NULL,
  header_class text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bpo_onboarding_portal_stages_pkey PRIMARY KEY (id),
  CONSTRAINT bpo_onboarding_portal_stages_key_key UNIQUE (key),
  CONSTRAINT bpo_onboarding_portal_stages_display_order_positive CHECK ((display_order > 0)),
  CONSTRAINT bpo_onboarding_portal_stages_key_not_blank CHECK ((NULLIF(btrim(key), ''::text) IS NOT NULL)),
  CONSTRAINT bpo_onboarding_portal_stages_label_not_blank CHECK ((NULLIF(btrim(label), ''::text) IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_bpo_onboarding_portal_stages_display_order
  ON public.bpo_onboarding_portal_stages USING btree (display_order);

DROP TRIGGER IF EXISTS trg_bpo_onboarding_portal_stages_updated_at
  ON public.bpo_onboarding_portal_stages;
CREATE TRIGGER trg_bpo_onboarding_portal_stages_updated_at
  BEFORE UPDATE ON public.bpo_onboarding_portal_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS public.bpo_onboarding_portal_user_stages (
  user_id uuid NOT NULL,
  stage_key text NOT NULL,
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT bpo_onboarding_portal_user_stages_pkey PRIMARY KEY (user_id),
  CONSTRAINT bpo_onboarding_portal_user_stages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.app_users(user_id) ON DELETE CASCADE,
  CONSTRAINT bpo_onboarding_portal_user_stages_stage_key_fkey
    FOREIGN KEY (stage_key) REFERENCES public.bpo_onboarding_portal_stages(key) ON UPDATE CASCADE,
  CONSTRAINT bpo_onboarding_portal_user_stages_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT bpo_onboarding_portal_user_stages_stage_key_not_blank CHECK ((NULLIF(btrim(stage_key), ''::text) IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_bpo_onboarding_portal_user_stages_stage_key
  ON public.bpo_onboarding_portal_user_stages USING btree (stage_key, updated_at DESC);

DROP TRIGGER IF EXISTS trg_bpo_onboarding_portal_user_stages_updated_at
  ON public.bpo_onboarding_portal_user_stages;
CREATE TRIGGER trg_bpo_onboarding_portal_user_stages_updated_at
  BEFORE UPDATE ON public.bpo_onboarding_portal_user_stages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$
DECLARE
  stage record;
BEGIN
  FOR stage IN
    SELECT *
    FROM (
      VALUES
        ('ready_to_move_forward', 'ready_to_move_forward', 'Ready to Move Forward', 1),
        ('retainer_sent_pending_signature', 'group_chat_created', 'Group Chat Created', 2),
        ('retainer_signed', 'logins_sent', 'Logins Sent', 3),
        ('scheduled_onboarding', 'scheduled_training', 'Scheduled Training', 4),
        ('onboarded_inactive_no_orders_yet', 'training_ran', 'Training Ran', 5),
        ('training_completed', 'training_completed', 'Training Completed', 6),
        ('active_actively_paying_placing_orders', 'active_bpo', 'Active BPO', 7),
        ('non_active_bpo', 'non_active_bpo', 'Non-Active BPO', 8)
    ) AS stage_map(old_key, new_key, label, display_order)
  LOOP
    IF stage.old_key <> stage.new_key
      AND EXISTS (SELECT 1 FROM public.bpo_onboarding_portal_stages WHERE key = stage.old_key)
      AND EXISTS (SELECT 1 FROM public.bpo_onboarding_portal_stages WHERE key = stage.new_key) THEN
      UPDATE public.bpo_onboarding_portal_user_stages
      SET stage_key = stage.new_key
      WHERE stage_key = stage.old_key;

      DELETE FROM public.bpo_onboarding_portal_stages
      WHERE key = stage.old_key;
    ELSIF stage.old_key <> stage.new_key
      AND EXISTS (SELECT 1 FROM public.bpo_onboarding_portal_stages WHERE key = stage.old_key) THEN
      UPDATE public.bpo_onboarding_portal_stages
      SET
        key = stage.new_key,
        label = stage.label,
        display_order = stage.display_order,
        is_active = true,
        updated_at = now()
      WHERE key = stage.old_key;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO public.bpo_onboarding_portal_stages (key, label, display_order, column_class, header_class, is_active)
VALUES
  ('ready_to_move_forward', 'Ready to Move Forward', 1, NULL, NULL, true),
  ('group_chat_created', 'Group Chat Created', 2, NULL, NULL, true),
  ('logins_sent', 'Logins Sent', 3, NULL, NULL, true),
  ('scheduled_training', 'Scheduled Training', 4, NULL, NULL, true),
  ('training_ran', 'Training Ran', 5, NULL, NULL, true),
  ('training_completed', 'Training Completed', 6, NULL, NULL, true),
  ('active_bpo', 'Active BPO', 7, NULL, NULL, true),
  ('non_active_bpo', 'Non-Active BPO', 8, NULL, NULL, true)
ON CONFLICT (key) DO UPDATE
SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  column_class = COALESCE(public.bpo_onboarding_portal_stages.column_class, EXCLUDED.column_class),
  header_class = COALESCE(public.bpo_onboarding_portal_stages.header_class, EXCLUDED.header_class),
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.ensure_bpo_onboarding_portal_user_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = NEW.user_id
      AND au.role IN ('publisher_admin', 'publisher_closer')
  ) THEN
    RAISE EXCEPTION 'BPO onboarding stages can only be assigned to publisher users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bpo_onboarding_portal_user_role
  ON public.bpo_onboarding_portal_user_stages;
CREATE TRIGGER trg_bpo_onboarding_portal_user_role
  BEFORE INSERT OR UPDATE OF user_id ON public.bpo_onboarding_portal_user_stages
  FOR EACH ROW EXECUTE FUNCTION public.ensure_bpo_onboarding_portal_user_role();

CREATE OR REPLACE FUNCTION public.default_bpo_onboarding_portal_stage_key(account_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(account_status, '')) IN ('inactive', 'disabled', 'banned', 'suspended')
      THEN 'non_active_bpo'
    WHEN lower(coalesce(account_status, '')) IN ('active', 'enabled', 'approved')
      THEN 'active_bpo'
    ELSE 'ready_to_move_forward'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_bpo_onboarding_stage_for_publisher()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('publisher_admin', 'publisher_closer') THEN
    INSERT INTO public.bpo_onboarding_portal_user_stages (user_id, stage_key)
    VALUES (
      NEW.user_id,
      public.default_bpo_onboarding_portal_stage_key(NEW.account_status)
    )
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.bpo_onboarding_portal_user_stages
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_ensure_bpo_onboarding_stage
  ON public.app_users;
CREATE TRIGGER app_users_ensure_bpo_onboarding_stage
  AFTER INSERT OR UPDATE OF role, account_status ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.ensure_bpo_onboarding_stage_for_publisher();

CREATE OR REPLACE FUNCTION public.can_manage_bpo_onboarding_portal()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = auth.uid()
      AND (
        au.is_super_admin = true
        OR au.role IN ('super_admin', 'admin', 'accounts')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_bpo_onboarding_portal() TO authenticated;

ALTER TABLE public.bpo_onboarding_portal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bpo_onboarding_portal_user_stages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bpo_onboarding_portal_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bpo_onboarding_portal_user_stages TO authenticated;

DROP POLICY IF EXISTS bpo_onboarding_portal_stages_select
  ON public.bpo_onboarding_portal_stages;
CREATE POLICY bpo_onboarding_portal_stages_select
  ON public.bpo_onboarding_portal_stages
  FOR SELECT
  TO authenticated
  USING (public.can_manage_bpo_onboarding_portal());

DROP POLICY IF EXISTS bpo_onboarding_portal_stages_manage
  ON public.bpo_onboarding_portal_stages;
CREATE POLICY bpo_onboarding_portal_stages_manage
  ON public.bpo_onboarding_portal_stages
  FOR ALL
  TO authenticated
  USING (public.can_manage_bpo_onboarding_portal())
  WITH CHECK (public.can_manage_bpo_onboarding_portal());

DROP POLICY IF EXISTS bpo_onboarding_portal_user_stages_select
  ON public.bpo_onboarding_portal_user_stages;
CREATE POLICY bpo_onboarding_portal_user_stages_select
  ON public.bpo_onboarding_portal_user_stages
  FOR SELECT
  TO authenticated
  USING (public.can_manage_bpo_onboarding_portal());

DROP POLICY IF EXISTS bpo_onboarding_portal_user_stages_manage
  ON public.bpo_onboarding_portal_user_stages;
CREATE POLICY bpo_onboarding_portal_user_stages_manage
  ON public.bpo_onboarding_portal_user_stages
  FOR ALL
  TO authenticated
  USING (public.can_manage_bpo_onboarding_portal())
  WITH CHECK (public.can_manage_bpo_onboarding_portal());

INSERT INTO public.bpo_onboarding_portal_user_stages (user_id, stage_key)
SELECT
  au.user_id,
  public.default_bpo_onboarding_portal_stage_key(au.account_status) AS stage_key
FROM public.app_users au
WHERE au.role IN ('publisher_admin', 'publisher_closer')
ON CONFLICT (user_id) DO NOTHING;

-- Verify both pipelines
SELECT 
  pipeline,
  key,
  label,
  display_order,
  id
FROM portal_stages 
WHERE pipeline = 'submission_portal'
ORDER BY pipeline, display_order;

SELECT
  key,
  label,
  display_order,
  id
FROM public.bpo_onboarding_portal_stages
ORDER BY display_order;
