import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const VERCEL_BPO_ONBOARDING_PORTAL_URL = 'https://bpo-onboarding-portal.vercel.app'
const PUBLISHER_PORTAL_URL = 'https://publisher.accidentpayments.com'
const LEGACY_BPO_PORTAL_URL = 'https://bpo.accidentpayments.com'
const DEFAULT_BPO_PORTAL_URL = PUBLISHER_PORTAL_URL
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'https://onboarding.accidentpayments.com',
  VERCEL_BPO_ONBOARDING_PORTAL_URL,
  'https://attorney.accidentpayments.com',
  PUBLISHER_PORTAL_URL,
  LEGACY_BPO_PORTAL_URL,
]

type AppUserRole =
  | 'super_admin'
  | 'admin'
  | 'lawyer'
  | 'agent'
  | 'accounts'
  | 'publisher_admin'
  | 'publisher_closer'
  | 'broker'

type AuthedUser = {
  id: string
  email: string | null
}

type AppUserLookup = {
  user_id: string
  email: string | null
  display_name: string | null
  role: AppUserRole | null
  center_id?: string | null
  is_super_admin?: boolean | null
  account_status?: string | null
}

type CenterLookup = {
  id: string
  center_name: string | null
  lead_vendor: string | null
  is_active: boolean | null
}

const LAWYER_ACCOUNT_ROLES = ['lawyer'] as const
const BPO_ACCOUNT_ROLES = ['publisher_admin', 'publisher_closer'] as const

const getEnv = (key: string, fallback?: string) => {
  const value = Deno.env.get(key)?.trim()
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`Missing env var: ${key}`)
}

const getAllowedOrigins = () => {
  const configured = Deno.env.get('ALLOWED_PORTAL_ORIGINS')
  if (!configured?.trim()) return DEFAULT_ALLOWED_ORIGINS

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

const getAllowedRequestOrigin = (req: Request) => {
  const allowedOrigins = getAllowedOrigins()
  const requestOrigin = req.headers.get('origin') ?? ''
  if (!requestOrigin) return null
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null
}

const getCorsHeaders = (req: Request) => {
  const allowOrigin = getAllowedRequestOrigin(req)

  return {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  })

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') ?? ''
  const [type, token] = auth.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const isLoopbackHost = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'

const isLocalRequest = (req: Request) => {
  const requestOrigin = req.headers.get('origin') ?? ''
  if (!requestOrigin) return false

  try {
    return isLoopbackHost(new URL(requestOrigin).hostname)
  } catch {
    return false
  }
}

const normalizePortalUrl = (value: unknown, options?: { allowLocal?: boolean }) => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

    if (
      parsed.origin === DEFAULT_ATTORNEY_PORTAL_URL ||
      parsed.origin === DEFAULT_BPO_PORTAL_URL ||
      parsed.origin === PUBLISHER_PORTAL_URL ||
      parsed.origin === LEGACY_BPO_PORTAL_URL
    ) {
      return parsed.origin
    }

    if (options?.allowLocal && isLoopbackHost(parsed.hostname)) {
      return parsed.origin
    }

    return null
  } catch {
    return null
  }
}

const sanitizeRequestedPath = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'

  try {
    const parsed = new URL(raw, 'https://internal.launch.local')
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (
      normalized === '/auth' ||
      normalized.startsWith('/auth/') ||
      normalized === '/launch-auth' ||
      normalized.startsWith('/launch-auth') ||
      normalized === '/managed-auth' ||
      normalized.startsWith('/managed-auth/')
    ) {
      return '/dashboard'
    }
    return normalized || '/dashboard'
  } catch {
    return '/dashboard'
  }
}

const normalizeStatus = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase()

const isPortalAccountLaunchable = (value: string | null | undefined) => {
  const normalized = normalizeStatus(value)
  if (!normalized) return true
  return !['inactive', 'disabled', 'banned', 'suspended'].includes(normalized)
}

const requireAuthenticatedUser = async (req: Request): Promise<{ user: AuthedUser } | { error: Response }> => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')

  const token = getBearerToken(req)
  if (!token) return { error: json(req, 401, { error: 'Missing Authorization header' }) }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await authClient.auth.getUser()
  if (error || !data.user) {
    return { error: json(req, 401, { error: 'Invalid session' }) }
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  }
}

const hasPortalAdminAccess = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data: appUser, error: appUserError } = await adminClient
    .from('app_users')
    .select('role,is_super_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (appUserError) {
    throw new Error(appUserError.message)
  }

  if (appUser && (appUser.is_super_admin || appUser.role === 'super_admin' || appUser.role === 'admin')) {
    return true
  }

  const { data: roleRow, error: roleError } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'super_admin'])
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (roleError) {
    throw new Error(roleError.message)
  }

  return Boolean(roleRow?.role === 'admin' || roleRow?.role === 'super_admin')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    if (req.headers.get('origin') && !getAllowedRequestOrigin(req)) {
      return new Response('Forbidden', { status: 403 })
    }
    return new Response(null, { status: 204, headers: getCorsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return json(req, 405, { error: 'Method not allowed' })
  }

  try {
    const authResult = await requireAuthenticatedUser(req)
    if ('error' in authResult) return authResult.error

    const supabaseUrl = getEnv('SUPABASE_URL')
    const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const hasAccess = await hasPortalAdminAccess(adminClient, authResult.user.id)
    if (!hasAccess) {
      return json(req, 403, { error: 'Admin access required' })
    }

    const body = await req.json().catch(() => ({}))
    const lawyerUserId = typeof body?.lawyer_user_id === 'string' ? body.lawyer_user_id.trim() : ''
    const bpoUserId = typeof body?.bpo_user_id === 'string' ? body.bpo_user_id.trim() : ''
    const launchMode = bpoUserId ? 'bpo' : 'lawyer'
    const launchUserId = bpoUserId || lawyerUserId
    const requestedPath = sanitizeRequestedPath(body?.requested_path)
    const allowLocalPortalUrl = isLocalRequest(req)
    const defaultPortalUrl = launchMode === 'bpo' ? DEFAULT_BPO_PORTAL_URL : DEFAULT_ATTORNEY_PORTAL_URL
    const configuredPortalUrl = normalizePortalUrl(
      getEnv(launchMode === 'bpo' ? 'BPO_PORTAL_URL' : 'ATTORNEY_PORTAL_URL', defaultPortalUrl),
      { allowLocal: allowLocalPortalUrl }
    )
    const requestedPortalUrl = allowLocalPortalUrl
      ? normalizePortalUrl(launchMode === 'bpo' ? body?.bpo_portal_url : body?.attorney_portal_url, {
          allowLocal: true,
        })
      : null
    const portalUrl = requestedPortalUrl ?? configuredPortalUrl ?? defaultPortalUrl

    if (!launchUserId) {
      return json(req, 400, { error: 'bpo_user_id or lawyer_user_id is required' })
    }

    const { data: accountRow, error: accountError } = await adminClient
      .from('app_users')
      .select('user_id,email,display_name,role,center_id,account_status')
      .eq('user_id', launchUserId)
      .maybeSingle()

    if (accountError) {
      return json(req, 500, { error: accountError.message })
    }

    const account = accountRow as AppUserLookup | null
    const accountLabel = launchMode === 'bpo' ? 'BPO' : 'Lawyer'
    const hasAllowedAccountRole = Boolean(
      account &&
        (launchMode === 'bpo'
          ? BPO_ACCOUNT_ROLES.includes(account.role as (typeof BPO_ACCOUNT_ROLES)[number])
          : LAWYER_ACCOUNT_ROLES.includes(account.role as (typeof LAWYER_ACCOUNT_ROLES)[number])),
    )

    if (!account || !hasAllowedAccountRole) {
      return json(req, 404, { error: `${accountLabel} account not found` })
    }

    if (!isPortalAccountLaunchable(account.account_status)) {
      return json(req, 400, { error: `This ${accountLabel.toLowerCase()} account is not active and cannot be launched` })
    }

    let bpoCenter: CenterLookup | null = null

    if (launchMode === 'bpo') {
      if (!account.center_id) {
        return json(req, 400, { error: 'This BPO account is not linked to a center and cannot be launched' })
      }

      const { data: centerRow, error: centerError } = await adminClient
        .from('centers')
        .select('id,center_name,lead_vendor,is_active')
        .eq('id', account.center_id)
        .maybeSingle()

      if (centerError) {
        return json(req, 500, { error: centerError.message })
      }

      bpoCenter = centerRow as CenterLookup | null

      if (!bpoCenter) {
        return json(req, 404, { error: 'BPO center not found' })
      }

      if (bpoCenter.is_active === false) {
        return json(req, 400, { error: 'This BPO center is inactive and cannot be launched' })
      }
    }

    const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(launchUserId)
    if (authUserError) {
      return json(req, 500, { error: authUserError.message })
    }

    const authUser = authUserData.user
    if (!authUser) {
      return json(req, 404, { error: `${accountLabel} auth account not found` })
    }

    const accountEmail = authUser.email?.trim().toLowerCase() ?? ''
    if (!accountEmail) {
      return json(req, 400, { error: `The selected ${accountLabel.toLowerCase()} auth account does not have a valid email address` })
    }

    const appUserEmail = account.email?.trim().toLowerCase() ?? ''
    if (appUserEmail && appUserEmail !== accountEmail) {
      return json(req, 409, {
        error: `${accountLabel} account email is out of sync with auth. Please sync the account email before launching.`,
      })
    }

    const bannedUntil = typeof authUser.banned_until === 'string' ? Date.parse(authUser.banned_until) : Number.NaN
    if (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) {
      return json(req, 400, { error: `This ${accountLabel.toLowerCase()} auth account is currently banned and cannot be launched` })
    }

    const redirectUrl = new URL('/launch-auth', portalUrl)
    redirectUrl.searchParams.set('next', requestedPath)

    const { data: generateData, error: generateError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: accountEmail,
      options: {
        redirectTo: redirectUrl.toString(),
      },
    })

    if (generateError || !generateData?.properties?.action_link) {
      return json(req, 500, { error: generateError?.message ?? 'Unable to create launch link' })
    }

    return json(req, 200, {
      actionLink: generateData.properties.action_link,
      redirectTo: redirectUrl.toString(),
      account: {
        userId: account.user_id,
        email: accountEmail,
        displayName: account.display_name,
        role: account.role,
        centerId: account.center_id ?? null,
        type: launchMode,
      },
      ...(launchMode === 'lawyer'
        ? {
            lawyer: {
              userId: account.user_id,
              email: accountEmail,
              displayName: account.display_name,
            },
          }
        : {
            bpo: {
              userId: account.user_id,
              email: accountEmail,
              displayName: account.display_name,
              centerId: account.center_id ?? null,
              center: bpoCenter
                ? {
                    id: bpoCenter.id,
                    name: bpoCenter.center_name || bpoCenter.lead_vendor,
                    isActive: bpoCenter.is_active !== false,
                  }
                : null,
            },
          }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return json(req, 500, { error: message })
  }
})
