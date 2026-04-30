import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { z } from 'https://esm.sh/zod@3.24.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

const PUBLISHER_ROLES = ['publisher_admin', 'publisher_closer'] as const;

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  },
  z.string().optional(),
);

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return undefined;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined;
  },
  z.string().optional(),
);

const optionalStringArray = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  },
  z.array(z.string()).default([]),
);

/* ── Mode: BPO Center ── */

const centerRequestSchema = z.object({
  mode: z.literal('center'),
  center: z.object({
    center_name: z.string().trim().min(1, 'Center name is required'),
    location: optionalText,
    website_or_linkedin: optionalText,
    contact_email: optionalEmail,
    contact_phone: optionalText,
    number_of_agents: optionalText,
    languages: optionalStringArray,
    operating_hours: optionalText,
  }),
});

/* ── Mode: Publisher Account ── */

const publisherProfileSchema = z
  .object({
    location: optionalText,
    website_or_linkedin: optionalText,
    contact_email: optionalEmail,
    contact_phone: optionalText,
    number_of_agents: optionalText,
    languages: optionalStringArray,
    operating_hours: optionalText,
  })
  .default({});

const POSITION_VALUES = ['accounting', 'marketing', 'invoicing', 'intake_team', 'other'] as const;
const SHIFT_VALUES = ['morning', 'afternoon', 'evening', 'full_day'] as const;

const closerSchema = z.object({
  contact_email: optionalEmail,
  contact_phone: optionalText,
  position: z
    .preprocess(
      (v: unknown) =>
        typeof v === 'string' && (POSITION_VALUES as readonly string[]).includes(v.trim())
          ? v.trim()
          : 'intake_team',
      z.enum(POSITION_VALUES),
    )
    .default('intake_team'),
  position_other: optionalText,
  shift_availability: z
    .preprocess(
      (v: unknown) =>
        typeof v === 'string' && (SHIFT_VALUES as readonly string[]).includes(v.trim())
          ? v.trim()
          : 'full_day',
      z.enum(SHIFT_VALUES),
    )
    .default('full_day'),
});

const publisherRequestSchema = z.object({
  mode: z.literal('publisher'),
  account: z.object({
    center_id: z.string().uuid('A center must be selected'),
    full_name: z.string().trim().min(1, 'Full name is required'),
    email: z.string().email('Valid email required').transform((v: string) => v.toLowerCase().trim()),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(PUBLISHER_ROLES, { errorMap: () => ({ message: 'Role is required' }) }),
  }),
  profile: publisherProfileSchema.optional(),
  closer: closerSchema.optional(),
});

const requestSchema = z
  .discriminatedUnion('mode', [centerRequestSchema, publisherRequestSchema])
  .superRefine((value, ctx: z.RefinementCtx) => {
    if (value.mode !== 'publisher') return;

    if (value.account.role === 'publisher_closer' && value.closer?.position === 'other' && !value.closer?.position_other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['closer', 'position_other'],
        message: 'Please specify the position when "Other" is selected',
      });
    }
  });

const rollbackCreatedUser = async (
  admin: ReturnType<typeof createClient>,
  userId: string,
) => {
  try {
    await admin.from('bpo_team_members').delete().eq('user_id', userId);
  } catch (cleanupError) {
    console.error('[onboard-bpo] bpo_team_members cleanup error:', cleanupError);
  }

  try {
    await admin.from('app_users').delete().eq('user_id', userId);
  } catch (cleanupError) {
    console.error('[onboard-bpo] app_users cleanup error:', cleanupError);
  }

  try {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) {
      console.error('[onboard-bpo] auth user cleanup error:', deleteUserError);
    }
  } catch (cleanupError) {
    console.error('[onboard-bpo] unexpected auth cleanup error:', cleanupError);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const parsed = requestSchema.safeParse(await req.json());

    if (!parsed.success) {
      const fieldErrors = Object.fromEntries(
        parsed.error.issues.map((issue: z.ZodIssue) => [issue.path.join('.'), issue.message]),
      );
      return json({ error: 'Validation failed', fieldErrors }, 400);
    }

    /* ─────────────── Mode: Create BPO Center ─────────────── */

    if (parsed.data.mode === 'center') {
      const {
        center_name,
        location,
        website_or_linkedin,
        contact_email,
        contact_phone,
        number_of_agents,
        languages,
        operating_hours,
      } = parsed.data.center;

      const { data: existing, error: existingError } = await admin
        .from('centers')
        .select('id')
        .eq('lead_vendor', center_name)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') {
        console.error('[onboard-bpo] center lookup error:', existingError);
        return json({ error: existingError.message || 'Failed to check existing center' }, 500);
      }

      if (existing?.id) {
        return json(
          {
            code: 'center_exists',
            error: 'A center with this name already exists.',
            fieldErrors: { 'center.center_name': 'Center name already in use' },
          },
          409,
        );
      }

      const { data: insertData, error: insertError } = await admin
        .from('centers')
        .insert({
          center_name,
          lead_vendor: center_name,
          location: location ?? null,
          website_or_linkedin: website_or_linkedin ?? null,
          contact_email: contact_email ?? null,
          contact_phone: contact_phone ?? null,
          number_of_agents: number_of_agents ?? null,
          languages: languages ?? [],
          operating_hours: operating_hours ?? null,
          is_active: true,
        })
        .select('id, center_name, lead_vendor')
        .single();

      if (insertError) {
        console.error('[onboard-bpo] center insert error:', insertError);

        if (insertError.code === '23505') {
          return json(
            {
              code: 'center_exists',
              error: 'A center with this name already exists.',
              fieldErrors: { 'center.center_name': 'Center name already in use' },
            },
            409,
          );
        }

        return json({ error: `Failed to create center: ${insertError.message}` }, 500);
      }

      return json({
        success: true,
        mode: 'center',
        centerId: insertData.id,
        center: insertData,
      });
    }

    /* ─────────────── Mode: Create Publisher Account ─────────────── */

    const { account, closer } = parsed.data;

    const { data: centerRow, error: centerError } = await admin
      .from('centers')
      .select('id, center_name')
      .eq('id', account.center_id)
      .maybeSingle();

    if (centerError || !centerRow) {
      return json(
        {
          error: 'Selected center could not be found.',
          fieldErrors: { 'account.center_id': 'Invalid center' },
        },
        400,
      );
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });

    if (authError) {
      return json(
        { error: authError.message, fieldErrors: { 'account.email': authError.message } },
        400,
      );
    }

    const userId = authData.user.id;

    const { error: appUserError } = await admin.from('app_users').upsert(
      {
        user_id: userId,
        email: account.email,
        display_name: account.full_name,
        role: account.role,
        center_id: account.center_id,
        account_status: 'active',
      },
      { onConflict: 'user_id' },
    );

    if (appUserError) {
      console.error('[onboard-bpo] app_users upsert error:', appUserError);
      await rollbackCreatedUser(admin, userId);
      return json({ error: `Failed to create app_users record: ${appUserError.message}` }, 500);
    }

    const warnings: string[] = [];

    // Both publisher_admin and publisher_closer get a row in `bpo_team_members`
    // so the admin's team-profile view (in mvabpoportal) shows the entire BPO
    // team for the center in one query: `bpo_team_members WHERE center_id = X`.
    // We never write to the legacy `team_members` table from BPO flows — that
    // table is reserved for the lawyer onboarding system.
    const closerData = {
      contact_email: closer?.contact_email,
      contact_phone: closer?.contact_phone,
      position: closer?.position ?? ('intake_team' as const),
      position_other: closer?.position_other,
      shift_availability: closer?.shift_availability ?? ('full_day' as const),
    };

    const teamMemberPayload: Record<string, unknown> = {
      user_id: userId,
      center_id: account.center_id,
      full_name: account.full_name,
      email: account.email,
      phone: null,
      position: 'intake_team',
      position_other: null,
      shift_availability: 'full_day',
    };

    if (account.role === 'publisher_closer') {
      teamMemberPayload.email = closerData.contact_email ?? account.email;
      teamMemberPayload.phone = closerData.contact_phone ?? null;
      teamMemberPayload.position = closerData.position;
      teamMemberPayload.position_other =
        closerData.position === 'other' ? closerData.position_other ?? null : null;
      teamMemberPayload.shift_availability = closerData.shift_availability;
    }

    const { error: teamMemberError } = await admin
      .from('bpo_team_members')
      .insert(teamMemberPayload);

    if (teamMemberError) {
      console.error('[onboard-bpo] bpo_team_members insert error:', teamMemberError);
      await rollbackCreatedUser(admin, userId);
      return json(
        {
          error: `Failed to create BPO team member entry: ${teamMemberError.message}`,
          fieldErrors:
            account.role === 'publisher_closer'
              ? { closer: 'Team member entry could not be saved' }
              : undefined,
        },
        500,
      );
    }

    return json({
      success: true,
      mode: 'publisher',
      userId,
      email: account.email,
      centerId: account.center_id,
      role: account.role,
      warnings,
    });
  } catch (err) {
    console.error('[onboard-bpo] unexpected error:', err);
    return json({ error: (err as Error).message || 'Internal server error' }, 500);
  }
});
