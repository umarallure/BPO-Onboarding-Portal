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
  lead_id: z.string().uuid(),
});

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization') ?? '';

    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'Missing bearer token' }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: 'Invalid bearer token' }, 401);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: 'Validation failed', fieldErrors: parsed.error.flatten().fieldErrors }, 400);
    }

    const { lead_id } = parsed.data;

    const { data: requester, error: requesterError } = await admin
      .from('app_users')
      .select('user_id, role, center_id, is_super_admin')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (requesterError) {
      return json({ error: requesterError.message }, 500);
    }
    if (!requester) {
      return json({ error: 'Portal user not found' }, 404);
    }

    const requesterRole = requester.role ?? '';
    const isAdmin = requester.is_super_admin === true || ['super_admin', 'admin'].includes(requesterRole);
    const isPublisher = ['publisher_admin', 'publisher_closer'].includes(requesterRole);
    if (!isAdmin && !isPublisher) {
      return json({ error: 'Invalid portal role' }, 403);
    }

    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id, status, lead_vendor, user_id')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadError) {
      return json({ error: leadError.message }, 500);
    }
    if (!lead) {
      return json({ error: 'Lead not found' }, 404);
    }
    if (lead.status !== 'qualified_payable') {
      return json({ error: 'Lead is not qualified payable' }, 409);
    }

    if (!isAdmin) {
      let allowed = lead.user_id === userData.user.id;

      if (!allowed && requester.center_id) {
        const { data: center, error: centerError } = await admin
          .from('centers')
          .select('lead_vendor')
          .eq('id', requester.center_id)
          .maybeSingle();

        if (centerError) {
          return json({ error: centerError.message }, 500);
        }

        allowed = normalize(center?.lead_vendor) !== '' &&
          normalize(center?.lead_vendor) === normalize(lead.lead_vendor);
      }

      if (!allowed) {
        return json({ error: 'Lead is outside requester center' }, 403);
      }
    }

    const { data: matches, error: matchError } = await admin.rpc('record_incentives_for_qualified_lead', {
      p_lead_id: lead_id,
    });

    if (matchError) {
      return json({ error: matchError.message }, 500);
    }

    return json({
      success: true,
      lead_id,
      incentives_matched: matches ?? [],
      matched_count: Array.isArray(matches) ? matches.length : 0,
    });
  } catch (err) {
    return json({ error: (err as Error).message || 'Internal server error' }, 500);
  }
});
