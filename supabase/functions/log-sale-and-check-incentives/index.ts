import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';
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

const requestSchema = z.object({
  bpo_id: z.string().uuid(),
  state: z.string().max(2).optional().default(''),
  sol_months: z.number().int().min(0).optional().nullable(),
  attorney_id: z.string().uuid().optional().nullable(),
});

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
      return json({ error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors }, 400);
    }

    const { bpo_id, state, sol_months, attorney_id } = parsed.data;

    // Verify the BPO user exists and has a valid publisher role
    const { data: bpoUser, error: bpoError } = await admin
      .from('app_users')
      .select('user_id, role, account_status')
      .eq('user_id', bpo_id)
      .maybeSingle();

    if (bpoError) {
      return json({ error: bpoError.message }, 500);
    }
    if (!bpoUser) {
      return json({ error: 'BPO user not found' }, 404);
    }
    if (!['publisher_admin', 'publisher_closer'].includes(bpoUser.role ?? '')) {
      return json({ error: 'Invalid BPO user role' }, 403);
    }

    // Expire any overdue incentives first
    await admin.rpc('expire_incentives');

    // Call the rule matching engine
    const { data: matches, error: matchError } = await admin.rpc('check_incentive_for_sale', {
      p_bpo_id: bpo_id,
      p_state: state || null,
      p_sol_months: sol_months ?? null,
      p_attorney_id: attorney_id ?? null,
    });

    if (matchError) {
      return json({ error: matchError.message }, 500);
    }

    return json({
      success: true,
      incentives_matched: matches ?? [],
      matched_count: Array.isArray(matches) ? matches.length : 0,
    });
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal server error' }, 500);
  }
});
