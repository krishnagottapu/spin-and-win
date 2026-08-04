---
id: task-7
task: Low priority backlog fixes - sort stability, slug retry, winner join query, name length validation
agent: backend
status: pending
depends_on: [task-5]
skills:
  - languages/javascript
  - global/security
context:
  project: spin-and-win
  files:
    - src/app/api/spin/route.ts
    - src/app/api/sessions/route.ts
    - src/app/api/sessions/[id]/route.ts
    - src/app/api/queue/join/route.ts
acceptance_criteria:
  - Prize ordering uses ORDER BY created_at ASC, id ASC for stable sort
  - Session slug collision retries with incrementing numeric suffix up to 5 attempts
  - Winners query in include=winners uses a single join instead of a separate prize lookup
  - Participant name in queue/join is validated to max 100 characters
  - Name validation returns 422 with clear error message if exceeded
---

## Implementation Instructions

### L-2: Prize sort stability — `src/app/api/spin/route.ts`

In both the initial prizes fetch and the retry fetch, change:
```typescript
.order('created_at', { ascending: true })
```
to:
```typescript
.order('created_at', { ascending: true })
.order('id', { ascending: true })
```
Apply to all prize fetch queries in this file (there are 2).

### M-6: Slug collision retry — `src/app/api/sessions/route.ts`

Read the file to find the slug generation logic. Replace the single retry with a loop:

```typescript
async function generateUniqueSlug(supabase, baseSlug: string): Promise<string> {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    const { data } = await supabase
      .from('sessions')
      .select('id')
      .eq('slug', candidate)
      .single();
    if (!data) return candidate;
  }
  // Fallback: append random 4-char hex
  return `${baseSlug}-${Math.random().toString(16).slice(2, 6)}`;
}
```

### L-6: Winners join query — `src/app/api/sessions/[id]/route.ts`

Replace the two-step winners fetch (participants + separate prizes fetch) with a single join:

```typescript
const { data: completedParticipants } = await supabase
  .from('participants')
  .select('name, spin_completed_at, prizes:prize_id(name, is_no_prize)')
  .eq('session_id', params.id)
  .eq('status', 'completed')
  .not('prize_id', 'is', null)
  .order('spin_completed_at', { ascending: false });

responsePayload.winners = (completedParticipants ?? [])
  .map((p) => {
    const prizeRaw = p.prizes as { name: string; is_no_prize: boolean } | { name: string; is_no_prize: boolean }[] | null;
    const prize = Array.isArray(prizeRaw) ? prizeRaw[0] ?? null : prizeRaw;
    if (!prize || prize.is_no_prize) return null;
    return { name: p.name, prize_name: prize.name, spin_completed_at: p.spin_completed_at ?? '' };
  })
  .filter((w): w is { name: string; prize_name: string; spin_completed_at: string } => w !== null);
```

Remove the separate `prizeIds` + `prizeRows` fetch block that this replaces.

### SEC-5: Name length validation — `src/app/api/queue/join/route.ts`

After the name presence check, add a max-length guard:

```typescript
if (body.name.trim().length > 100) {
  return NextResponse.json<ApiError>(
    { error: 'Name must be 100 characters or fewer' },
    { status: 422 }
  );
}
```

Also add a corresponding CHECK constraint in a new migration:
`supabase/migrations/20260804000002_name_length_constraint.sql`:
```sql
ALTER TABLE participants ADD CONSTRAINT participants_name_length CHECK (char_length(name) <= 100);
```
