---
id: task-9
task: Build the admin live dashboard with real-time analytics and CSV export for current and past events
agent: backend
status: approved
depends_on: [task-2]
skills:
  - global/security
  - testing/philosophy
context:
  project: spin-and-win
  branch: feature/task-9-admin-dashboard-export
  files:
    - src/app/admin/reports/page.tsx
    - src/app/admin/reports/[sessionId]/page.tsx
    - src/app/api/export/[sessionId]/route.ts
    - src/components/admin/LiveDashboard.tsx
    - src/components/admin/ExportButton.tsx
    - src/lib/utils/csvExport.ts
acceptance_criteria:
  - GET /admin/reports requires admin JWT (middleware redirects to /admin/login without it)
  - GET /admin/reports lists all sessions with their status, participant count, and fulfilled count
  - GET /admin/reports/[sessionId] renders the live dashboard for active/ending sessions and a static report for ended/draft sessions
  - GET /api/export/[sessionId] requires admin JWT — returns 401 without it
  - GET /api/export/[sessionId] returns Content-Type: text/csv and Content-Disposition: attachment; filename="session-{slug}-report.csv"
  - CSV contains exactly these columns in order: name, phone, prize_won, fulfilled, queue_position, joined_at, spin_completed_at, fulfilled_at, fulfilled_by_staff_name
  - CSV fulfilled column values are "Yes" or "No" (not true/false booleans)
  - CSV includes all participants for the session regardless of status (queued, active, spinning, completed)
  - CSV rows are ordered by queue_position ASC
  - GET /api/export/[sessionId] for a non-existent session returns 404
  - LiveDashboard shows: current queue (ordered by position), active player name, prize inventory table (name, remaining, total), fulfillment rate (fulfilled / total completed with prizes)
  - LiveDashboard subscribes to session:{session_id} Realtime channel and updates without page reload on: queue:updated, player:active, spin:result, winner:announced
  - Fulfillment rate updates in real time when prizes are fulfilled (requires re-fetching from server — not via Realtime)
  - ExportButton calls GET /api/export/[sessionId] and triggers a browser file download (not a page navigation)
  - Past sessions report page shows the same data as the export but rendered as an HTML table
  - Unit test: csvExport formats a participant array into correct CSV string with header row
  - Unit test: csvExport escapes commas and quotes in prize names (e.g., prize name "Win, Big!" becomes "Win, Big!" with quotes in CSV)
---

## Instructions

This task builds the admin visibility layer: a live dashboard showing real-time event status and a CSV export of all participant data.

### 1. CSV export utility (`src/lib/utils/csvExport.ts`)

```typescript
interface CsvParticipantRow {
  name: string;
  phone: string;
  prize_won: string;    // prize name or empty string
  fulfilled: 'Yes' | 'No';
  queue_position: number;
  joined_at: string;
  spin_completed_at: string | null;
  fulfilled_at: string | null;
  fulfilled_by_staff_name: string | null;
}

export function toCsvString(rows: CsvParticipantRow[]): string {
  const header = [
    'name', 'phone', 'prize_won', 'fulfilled', 'queue_position',
    'joined_at', 'spin_completed_at', 'fulfilled_at', 'fulfilled_by_staff_name'
  ];
  const escape = (val: string | number | null): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = rows.map(row =>
    header.map(col => escape(row[col as keyof CsvParticipantRow])).join(',')
  );
  return [header.join(','), ...lines].join('\n');
}
```

### 2. Export route (`src/app/api/export/[sessionId]/route.ts`)

```
GET /api/export/[sessionId]
```

1. Call `requireAdmin`.
2. Fetch session by ID — if not found, 404.
3. Query all participants with LEFT JOINs:
   ```sql
   SELECT
     p.name, p.phone, p.queue_position, p.joined_at,
     p.spin_completed_at, p.is_fulfilled, p.fulfilled_at,
     pr.name AS prize_name, pr.is_no_prize,
     s.name AS staff_name
   FROM participants p
   LEFT JOIN prizes pr ON p.prize_id = pr.id
   LEFT JOIN staff s ON p.fulfilled_by = s.id
   WHERE p.session_id = $1
   ORDER BY p.queue_position ASC
   ```
4. Map to `CsvParticipantRow[]` — `prize_won` is `pr.name` or `''`, `fulfilled` is `'Yes'` or `'No'`.
5. Call `toCsvString()`.
6. Return with headers:
   ```typescript
   return new NextResponse(csvString, {
     headers: {
       'Content-Type': 'text/csv',
       'Content-Disposition': `attachment; filename="session-${session.slug}-report.csv"`,
     },
   });
   ```

Do not buffer the entire result set if the session is large. For v1 (max 250 participants) this is acceptable, but structure the query to return rows in a stream-friendly order.

### 3. Reports list page (`src/app/admin/reports/page.tsx`)

Server Component. Queries all sessions ordered by `created_at DESC`. For each session, count participants and fulfilled participants (subquery or separate count queries). Renders a table with columns: Event Name, Status (badge), Start Time, Participants, Fulfilled, Actions.

Actions: "View Report" link → `/admin/reports/[id]`.

### 4. Per-session report page (`src/app/admin/reports/[sessionId]/page.tsx`)

Split into Server Component (initial data load) and Client Component (`LiveDashboard` for active sessions).

Server Component:
1. Require admin (server-side cookie check).
2. Fetch session + all participants + prizes.
3. If session is `active` or `ending`: render `LiveDashboard` with initial data.
4. If session is `draft` or `ended`: render static HTML table of participants + `ExportButton`.

### 5. LiveDashboard component (`src/components/admin/LiveDashboard.tsx`)

```tsx
'use client';
interface LiveDashboardProps {
  session: Session;
  initialParticipants: Participant[];
  prizes: Prize[];
}
```

Sections:
1. **Current Queue**: List of queued participants in order; highlight the active player.
2. **Prize Inventory**: Table — prize name, remaining inventory, starting inventory (need a `starting_inventory` concept — store original count, or derive from starting state). For v1, display current `inventory_count` and note that it decrements with each spin.
3. **Fulfillment Rate**: `${fulfilledCount} / ${completedWithPrizeCount} fulfilled (${pct}%)`. Refresh this by polling GET /api/sessions/[id] every 30 seconds (simpler than Realtime for fulfillment events).
4. **ExportButton**: renders regardless of session state.

Realtime subscriptions:
- `queue:updated`: update participant list state
- `player:active`: highlight the new active player
- `spin:result`: add winner to a "Recent Winners" mini-feed and decrement local prize inventory count
- `winner:announced`: (already handled by spin:result for dashboard purposes)

### 6. ExportButton component (`src/components/admin/ExportButton.tsx`)

```tsx
'use client';
// On click: fetch GET /api/export/[sessionId] with credentials
// Create a Blob from the response, create an object URL, trigger download via <a> click
// Show loading state while downloading
```

```typescript
const handleExport = async () => {
  setLoading(true);
  const res = await fetch(`/api/export/${sessionId}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-${slug}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
  setLoading(false);
};
```

### Security requirements

- All admin report routes must validate the admin JWT — both page routes and API routes
- Phone numbers in CSV export are considered PII — no additional transformation needed for v1 but note this in a comment
- Admin must own/have access to the session — for v1, all admins see all sessions (single admin user)

### TypeScript + Next.js Patterns

Follow idiomatic TypeScript + Next.js App Router patterns. Reference technical-requirements.md for all architectural decisions. Use the shared types from `src/lib/types.ts`.
