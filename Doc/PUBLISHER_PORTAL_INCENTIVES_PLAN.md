# Publisher Portal — Incentives & Flash Bonuses Feature Plan

## Overview

The Publisher Portal (`https://publisher.accidentpayments.com`) is a separate application used by BPOs (`publisher_admin` / `publisher_closer` roles). This plan details how to build the BPO-facing incentive display, progress tracking, and notification system within that portal.

Both portals share the same **Supabase project**. The admin portal (this repo) handles creation/approval; the publisher portal surfaces active challenges to BPOs.

---

## 1. Architecture & Data Flow

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│   Admin Portal (this repo)  │       │   Publisher Portal          │
│   https://bpoonboarding...   │       │   https://publisher....     │
│                              │       │                              │
│   /incentives                │       │   /dashboard                │
│   ├─ Create (pending)       │       │   ├─ ChallengeBoard widget  │
│   ├─ Approve → status=active│       │   ├─ Real-time progress     │
│   └─ Reject                 │       │   └─ Sale logging trigger   │
│                              │       │                              │
└──────────┬───────────────────┘       └──────────┬───────────────────┘
           │                                      │
           │         ┌──────────────────┐          │
           └────────►│   Supabase DB    │◄─────────┘
                     │                  │
                     │  incentives      │
                     │  incentive_rules │
                     │  bpo_incentive_  │
                     │    progress      │
                     │  incentive_      │
                     │    payouts       │
                     └──────────────────┘
```

**Key principle:** BPO users authenticate via Supabase Auth (magic link from admin portal). Their Supabase client uses `createClient` with the anon key (no dataless proxy). RLS policies enforce row-level security.

---

## 2. What's Already Done (Admin Side)

### Database (`supabase/migrations/20260626000000_create_incentives_feature.sql`)
- `incentives` table with full schema, RLS, and policies
- `incentive_rules` table with flexible criteria
- `bpo_incentive_progress` table with unique constraint on `(incentive_id, bpo_id)`
- `incentive_payouts` table for immutable ledger
- `can_manage_incentives()` — admin-only check function
- `is_bpo_user()` — BPO role check function
- `expire_incentives()` — batch-expires past-due incentives
- `check_incentive_for_sale(bpo_id, state, sol_months, attorney_id)` — rule matching engine

### RLS Policies for BPO Users
| Table | BPO Can | Policy |
|-------|---------|--------|
| `incentives` | SELECT only `status='active'` rows | `incentives_select` |
| `incentive_rules` | SELECT rules for active incentives | `incentive_rules_select` |
| `bpo_incentive_progress` | SELECT own rows, INSERT own rows (if active incentive), UPDATE own rows | `bpo_incentive_progress_select/insert/update` |
| `incentive_payouts` | SELECT own payouts | `incentive_payouts_select` |

### Frontend
- `src/hooks/useIncentives.ts` — Admin CRUD hook
- `src/hooks/useBpoIncentives.ts` — BPO data hook (queries via `supabase.from(...)` with the proxy, works because tables are in `LOGIN_ALLOWED_TABLES`)
- `src/pages/IncentivesPage.tsx` — Admin create/approve/list page at `/incentives`

---

## 3. What Needs to Be Built (Publisher Portal)

### 3.1 Supabase Client Setup

The publisher portal should initialize Supabase **without** the dataless proxy:

```typescript
// publisher-portal/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
```

### 3.2 Hooks

#### `useBpoIncentives.ts` — Fetch active challenges + user's progress

```typescript
// Key query logic:
const bpoId = user.id

// Fetch active incentives (ordered by soonest expiry first)
const { data: incentives } = await supabase
  .from('incentives')
  .select('*')
  .eq('status', 'active')
  .order('end_time', { ascending: true })

// For each incentive, fetch rules and the BPO's progress
for (const incentive of incentives) {
  const { data: rules } = await supabase
    .from('incentive_rules')
    .select('*')
    .eq('incentive_id', incentive.id)

  const { data: progress } = await supabase
    .from('bpo_incentive_progress')
    .select('*')
    .eq('incentive_id', incentive.id)
    .eq('bpo_id', bpoId)
    .maybeSingle()
}
```

A working reference implementation exists at `src/hooks/useBpoIncentives.ts` in the admin repo.

#### `useIncentiveProgressTracker.ts` — Real-time progress updates

```typescript
// Subscribe to progress changes for real-time UI updates
const channel = supabase
  .channel('bpo-progress-changes')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'bpo_incentive_progress',
      filter: `bpo_id=eq.${bpoId}`,
    },
    (payload) => {
      // Update UI reactively
    }
  )
  .subscribe()
```

### 3.3 Components (UI)

#### `ChallengeBoard.tsx` — Main widget (max 6 active cards)

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔥 Challenges & Flash Promotions              [3 active] │
├──────────────┬──────────────┬────────────────────────────┤
│ 🔥 FLASH     │ 🔥 FLASH     │ 🔥 FLASH                   │
│ BONUS:       │ BONUS:       │ BONUS:                    │
│ Florida      │ Texas        │ California                │
│ Sprint       │ Sprint       │ Surge                     │
│              │              │                           │
│ Criteria:    │ Criteria:    │ Criteria:                 │
│ FL | SOL<6mo │ TX | SOL<3mo │ CA | Any Atty             │
│              │              │                           │
│ ████████░░   │ ████░░░░░░   │ ██████████                 │
│ 3/5          │ 2/5          │ 5/5 ✅                    │
│              │              │                           │
│ +$1,000      │ +$500        │ +$750                     │
│ ⏰ 14h 22m   │ ⏰ 2d 8h     │ ⏰ Completed               │
└──────────────┴──────────────┴────────────────────────────┘
```

**States to handle:**
- **Loading:** Skeleton cards with pulse animation (show 3)
- **Empty:** "No active challenges right now. Check back soon!"
- **Error:** "Failed to load challenges. Pull to retry."
- **Success:** Grid of incentive cards (capped at 6)
- **Completed card:** Green accent, trophy icon, "Completed" badge

**Card sub-components:**
- `CountdownTimer` — Live-updating countdown (`useEffect` with `setInterval` 1s)
- `ProgressBar` — Visual progress with percentage
- `CriteriaBadges` — Rule chips (state, SOL, attorney)
- `PayoutBadge` — Dollar amount with currency formatting

**Reference implementation:** `src/components/ChallengeBoard.tsx` in the admin repo — this is a complete, working component that can be copied directly.

#### `IncentiveNotificationBanner.tsx` — Top-of-page alert for new flash sales

```typescript
// Use Supabase real-time subscription to detect new active incentives
// Show a dismissible banner: "🔥 New Flash Sale: Florida Sprint Bonus — +$1,000!"
```

### 3.4 Sale Logging Integration

When a BPO logs a sale in the publisher portal, call the matching engine:

```typescript
// Inside the sale submission handler:
const { data: matches } = await supabase.rpc('check_incentive_for_sale', {
  p_bpo_id: currentUser.id,
  p_state: saleRecord.state,         // e.g., 'FL'
  p_sol_months: saleRecord.sol_months, // e.g., 4
  p_attorney_id: saleRecord.attorney_id,
})

// matches = JSON array of incentives that were incremented
// Show toast if any incentive was completed
if (matches?.some(m => m.is_completed)) {
  toast.success('🎉 Challenge completed! Check your bonuses.')
}
```

**Integration points in the publisher portal:**
| Event | Hook Location |
|-------|--------------|
| New BPO sale submitted | After `lawyer_leads` INSERT or equivalent |
| Case status updated to "closed" | When `orders.status` changes to `'FULFILLED'` |
| Manual BPO action | A "Check My Progress" refresh button |

### 3.5 Notification Types

| Trigger | Method | Destination |
|---------|--------|-------------|
| New incentive goes live | Supabase real-time subscription → Sonner toast | BPO dashboard |
| BPO completes a challenge | Returned from `check_incentive_for_sale` RPC | Inline success + toast |
| Incentive about to expire (24h) | Query in `useEffect` + countdown banner | Challenge card |
| New pending incentive for approval | Admin dashboard tab badge | Already done in admin portal |

### 3.6 Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | Dashboard (with embedded ChallengeBoard) | Main BPO landing page |
| `/incentives` | ChallengeBoard (full page) | Full incentive listing page (optional) |

---

## 4. Edge Functions (Pubilsher Portal Support)

### 4.1 `log-sale-and-check-incentives` (New)

Create this in `supabase/functions/log-sale-and-check-incentives/index.ts`:

```typescript
// Purpose: Atomic sale logging + incentive matching
// Called by: Publisher portal when BPO submits a sale
// 
// Request body:
// {
//   bpo_id: string (UUID),
//   state?: string,
//   sol_months?: number,
//   attorney_id?: string,
//   // ... sale data fields
// }
//
// Response:
// {
//   sale_id: string,
//   incentives_matched: IncentiveMatch[]
// }
//
// This function:
// 1. Validates the BPO user's session
// 2. Logs the sale (if applicable)
// 3. Calls check_incentive_for_sale()
// 4. Returns match results so the portal can show notifications
```

**Implementation pattern:** Follow `supabase/functions/onboard-bpo/index.ts` (Deno + Zod + CORS).

---

## 5. Implementation Order (Publisher Portal)

### Sprint 1: Foundation
1. Set up Supabase client in publisher portal (no dataless proxy)
2. Create `lib/incentives.ts` — Types for Incentive, IncentiveRule, BpoProgress
3. Create `hooks/useBpoIncentives.ts` — Fetch active incentives + progress
4. Test RLS policies from publisher portal context

### Sprint 2: Challenge Board UI
1. Build `CountdownTimer` component
2. Build `IncentiveCard` component (criteria badges, progress bar, payout, countdown)
3. Build `ChallengeBoard` grid widget (loading/empty/error/success states)
4. Embed in publisher portal dashboard
5. Add real-time progress subscription

### Sprint 3: Sale Integration
1. Create edge function `log-sale-and-check-incentives`
2. Hook into the sale submission flow in publisher portal
3. Add `check_incentive_for_sale` RPC call after each sale
4. Show completion toast/modal when BPO finishes a challenge

### Sprint 4: Notifications & Polish
1. Add real-time subscription for new active incentives → banner toast
2. Add "expiring soon" visual state (card turns red when < 1 hour left)
3. Sound effect on challenge completion (optional)
4. Add empty state illustration
5. Performance: batch incentive queries instead of N+1

---

## 6. Testing Checklist

- [ ] BPO can see only `status='active'` incentives (not pending/rejected/expired)
- [ ] BPO cannot see other BPOs' progress
- [ ] Countdown timer updates every second
- [ ] Progress bar reflects `current_count / target_quantity`
- [ ] `check_incentive_for_sale` increments progress correctly
- [ ] `first_to_finish` type marks incentive as `completed` for first BPO only
- [ ] Expired incentives disappear from the board
- [ ] Real-time subscription updates the board when admin approves new incentive
- [ ] RLS blocks BPO from INSERTING progress on non-active incentives

---

## 7. Key Reference Files (in Admin Repo)

| File | What It Provides |
|------|-----------------|
| `src/hooks/useBpoIncentives.ts` | Ready-to-copy hook for BPO incentive data |
| `src/components/ChallengeBoard.tsx` | Complete working widget component |
| `supabase/migrations/20260626000000_create_incentives_feature.sql` | Full schema, RLS, and functions |
| `src/pages/IncentivesPage.tsx` | Admin side reference (create/approve UI) |
| `supabase/functions/create-bpo-portal-launch/index.ts` | Auth flow pattern for publisher portal |
| `src/components/TaskNotificationPanel.tsx` | Real-time subscription pattern |

---

## 8. Dependencies & Environment Variables

The publisher portal `.env` needs:
```
VITE_SUPABASE_URL=<same as admin portal>
VITE_SUPABASE_ANON_KEY=<same as admin portal>
```

No additional Supabase secrets needed — RLS policies handle access control.
