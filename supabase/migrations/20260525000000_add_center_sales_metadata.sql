-- Persist additional BPO center onboarding metadata captured in the Onboarding Portal.

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS campaigns text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS buyer_count integer NULL,
  ADD COLUMN IF NOT EXISTS sales_model text NULL,
  ADD COLUMN IF NOT EXISTS sales_model_other text NULL,
  ADD COLUMN IF NOT EXISTS selling_markets text[] NOT NULL DEFAULT '{}'::text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'centers_buyer_count_nonnegative'
      AND conrelid = 'public.centers'::regclass
  ) THEN
    ALTER TABLE public.centers
      ADD CONSTRAINT centers_buyer_count_nonnegative
      CHECK (buyer_count IS NULL OR buyer_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'centers_sales_model_check'
      AND conrelid = 'public.centers'::regclass
  ) THEN
    ALTER TABLE public.centers
      ADD CONSTRAINT centers_sales_model_check
      CHECK (
        sales_model IS NULL OR
        sales_model IN ('cpi', 'cpl', 'cpq', 'signed_retainer', 'seat', 'hourly', 'other')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_centers_sales_model
  ON public.centers USING btree (sales_model);

CREATE INDEX IF NOT EXISTS idx_centers_buyer_count
  ON public.centers USING btree (buyer_count);

CREATE INDEX IF NOT EXISTS idx_centers_campaigns
  ON public.centers USING gin (campaigns);

CREATE INDEX IF NOT EXISTS idx_centers_selling_markets
  ON public.centers USING gin (selling_markets);
