# BNSY Operator — Page Architecture

> Phase 2 — System Definition
> 4 Pages / 4 Design Mixes

---

## Page Overview

| Page | Type | Primary Reference | Secondary Reference |
|------|------|------------------|--------------------|
| Arrival Scan | Action Page | Raycast | Linear |
| Dispatch Scan | Task Workspace | Linear | Warp |
| Sign Receive | Query Workspace | Supabase | Linear |
| Task Log | Execution Timeline | Warp | — |

---

## 1. Arrival Scan — Action Page

**Reference: Raycast + Linear**

An action-focused page where the operator scans incoming shipments. The page is dominated by a single active scan operation. Think Raycast's command palette focus, applied to a physical logistics scan workflow.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Arrival Scan                    [Status: Active] [▼]    │
├──────────────────────────┬───────────────────────────────┤
│                          │                               │
│  Scan Input Zone         │  Recent Scans                 │
│  (Linear precision)      │  (Linear feed)                │
│                          │                               │
│  ┌────────────────────┐  │  ┌─────────────────────────┐  │
│  │ Barcode Input      │  │  │ WB1234567890  ✓ 12:03  │  │
│  │ ████████░░░░░░░░░░ │  │  │ WB1234567891  ✓ 12:03  │  │
│  └────────────────────┘  │  │ WB1234567892  ✓ 12:02  │  │
│                          │  │ WB1234567893  ✗ 12:01  │  │
│  ┌──────────┐┌─────────┐ │  │ WB1234567894  ✓ 12:01  │  │
│  │ Quantity ││ Confirm │ │  └─────────────────────────┘  │
│  │    1  ▲  ││  Scan   │ │                               │
│  │       ▼  ││         │ │  Scan Stats                   │
│  └──────────┘└─────────┘ │  ┌─────────────────────────┐  │
│                          │  │ Total:   142             │  │
│  ┌────────────────────┐  │  │ Success: 140  (98.6%)   │  │
│  │ Recent: WB123... ▲ │  │  │ Failed:    2  (1.4%)    │  │
│  └────────────────────┘  │  └─────────────────────────┘  │
│                          │                               │
└──────────────────────────┴───────────────────────────────┘
```

### Component Inventory

| Component | Notes |
|-----------|-------|
| Scan Input (auto-focus) | Raycast command-palette feel: single input, large, prominent. Border: `1px solid #E5E7EB` → focus: `1px solid #2563EB`. Height: 48px. Font: 16px. Radius: 12px. Auto-focus on page load. |
| Quantity Stepper | Linear precision: compact input + up/down arrows. Compact (32px height). Number centered. |
| Confirm Button | Raycast pill: `#2563EB` bg, `#FFFFFF` text, 9999px radius. Jumbo: height 48px. Text: "Confirm Scan". Keyboard: Enter. Hover: opacity 0.9 (Raycast pattern). |
| Recent Barcode Dropdown | Linear ghost: transparent bg, last 5 barcodes for quick re-select. Width matches input. 12px radius. |
| Recent Scans Feed | Linear feed: compact list. Each row: icon(✓ green16px / ✗ red16px) + barcode(13px mono) + timestamp(12px `#94A3B8`). Grouped by minute. Sticky header "Recent Scans". Max 50 items. Auto-scroll to latest. |
| Scan Stats Panel | Supabase minimal card: border-only depth. Large numbers (24px, 600). Labels (12px, 400, `#94A3B8`). |
| Status Indicator | Top-right: Active/Idle/Error state. Pill badge (6px radius). |

### Interaction Flow

1. Page loads → scan input auto-focused (Raycast pattern)
2. Operator scans/enters barcode → input validates format
3. Press Enter or click "Confirm Scan" → green flash on row (Linear feedback)
4. Row appears in Recent Scans feed (Linear timeline)
5. Stats update in real-time
6. Quantity stepper: `+/-` keys or mouse. Default 1.

### Raycast References Applied
- Single-point focus input (command palette thinking)
- Pill confirm button
- Opacity transitions on hover (not color change)
- Keyboard-first: Enter to execute, Escape to clear
- Minimal chrome around the active task

### Linear References Applied
- Precision layout: input + quantity + button locked together
- Recent scans feed as a compact timeline
- Semi-transparent hover states
- Clean, unambiguous hierarchy

---

## 2. Dispatch Scan — Task Workspace

**Reference: Linear + Warp**

A task-centric workspace where the operator manages dispatch scanning. The page presents a list of dispatch tasks alongside the active scan operation. Linear's project management DNA meets Warp's task execution clarity.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Dispatch Scan                    Task: Line-4 (3/12)     │
├──────────────────────────┬───────────────────────────────┤
│                          │                               │
│  Active Task Panel       │  Task Queue                   │
│  (Linear task detail)    │  (Linear list)                │
│                          │                               │
│  ┌────────────────────┐  │  ┌─────────────────────────┐  │
│  │ Task:              │  │  │ #12  Route A  ⬤ Active │  │
│  │ Line-4 / Route A   │  │  │ #11  Route B  ⬤ Queued│  │
│  │ Vehicle: 京A·88888 │  │  │ #10  Route C  ✓ Done   │  │
│  │ Items: 3 / 12      │  │  │ #09  Route A  ✓ Done   │  │
│  │                    │  │  └─────────────────────────┘  │
│  │ Progress ████░░░░░░│  │                               │
│  │                    │  │                               │
│  └────────────────────┘  │                               │
│                          │                               │
│  Scan Zone               │                               │
│  ┌────────────────────┐  │                               │
│  │ Barcode: ░░░░░░░░░ │  │                               │
│  │                    │  │                               │
│  │ [Confirm Scan]     │  │                               │
│  └────────────────────┘  │                               │
│                          │                               │
│  Execution Log           │                               │
│  (Warp monospace output) │                               │
│  ┌────────────────────┐  │                               │
│  │ 12:03:45 ✓ WB123..│  │                               │
│  │ 12:03:12 ✓ WB122..│  │                               │
│  │ 12:02:58 ✗ WB121..│  │                               │
│  │ 12:02:30 ✓ WB120..│  │                               │
│  └────────────────────┘  │                               │
│                          │                               │
└──────────────────────────┴───────────────────────────────┘
```

### Component Inventory

| Component | Notes |
|-----------|-------|
| Task Header | Linear-style: task name (20px, 600), subtitle (13px, `#94A3B8`). Progress bar: 6px height, `#E5E7EB` bg, `#2563EB` fill. Radius: 3px. |
| Active Task Panel | Linear card: border-only depth. Vehicle info, route, item count. Compact layout with labeled values. |
| Task Queue | Linear issue list: each row has status icon (left), task number (mono), description (body), status pill (right). Active row: `#EFF6FF` bg. Hover: `#F8FAFC` bg. |
| Scan Zone | Focused input + confirm button, similar to Arrival Scan but contextualized to the active task. |
| Execution Log | Warp monospace: JetBrains Mono 13px. Timestamp + icon + barcode. One line per event. Auto-scroll to bottom. Background: `#F8FAFC`. Border: `1px solid #E5E7EB`. Radius: 12px. |
| Progress Bar | Linear precision: thin (6px), inside task panel. |
| Status Pills | Raycast: active=info, queued=default, done=success. 6px radius. 12px font. |

### Interaction Flow

1. Operator views task queue → selects active task (or system auto-assigns)
2. Task detail panel shows progress and context
3. Scan zone active → operator scans items
4. Each scan updates progress bar and adds to execution log (Warp)
5. When task complete → green confirmation, next task auto-loaded

### Linear References Applied
- Task queue list with status icons and pill badges
- Progress bar for task completion
- `#EFF6FF` selected state background
- Compact, precise task detail card

### Warp References Applied
- Monospace execution log as primary feedback channel
- Pill buttons for task actions
- Headings with tight letter-spacing
- Task as the central object, not the data table

---

## 3. Sign Receive — Query Workspace

**Reference: Supabase + Linear**

A lookup and verification page. Operators query shipment records by barcode, waybill, or date range to confirm receipt signatures. Supabase's border-as-depth and Linear's precision layout combine for a clean query-result pattern.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Sign Receive                                              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Query Bar                                               │
│  ┌────────────┬────────────┬────────────┬─────────────┐  │
│  │ Barcode ▾  │ Date From  │ Date To    │ [Search]    │  │
│  │ ░░░░░░░░░░ │ 2026-06-01 │ 2026-06-18 │             │  │
│  └────────────┴────────────┴────────────┴─────────────┘  │
│                                                          │
│  Results Card                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Waybill: WB1234567890           Status: ✓ Signed  │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  Sender:   某某电子公司                             │  │
│  │  Receiver: 张三               Phone: 138****1234    │  │
│  │  Items:    3                  Weight: 12.5kg        │  │
│  │  ─────────────────────────────────────────────────  │  │
│  │  Signature: 张三               Time: 06-17 14:32   │  │
│  │                                                    │  │
│  │  History                                           │  │
│  │  06-17 14:32  Signed       张三                    │  │
│  │  06-17 08:15  Out for Delivery                      │  │
│  │  06-16 22:30  Arrived at Station                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Component Inventory

| Component | Notes |
|-----------|-------|
| Query Bar | Supabase minimalism: horizontal filter row. Inputs at 32px height (compact). Pill search button. Background: `#FFFFFF`. Border bottom: `1px solid #E5E7EB`. |
| Barcode Input | Primary query field. Auto-focus. Supports Enter to search. |
| Date Pickers | Compact (32px). Placeholder from/to. Range validation. |
| Search Button | Pill (9999px), 32px height. `#2563EB` bg. |
| Results Card | Supabase border-depth card: `#FFFFFF` bg, `1px solid #E5E7EB` border, 16px radius. No shadow lift on hover. Dividers: `#F1F5F9`. Sections separated by thin lines. |
| Status Pill | Success=green, Pending=warning, Missing=danger. 6px radius. |
| History Timeline | Linear feed: compact vertical list with icons and timestamps. Each entry: 13px caption text. |
| Empty State | Supabase minimal: search icon (48px, `#94A3B8`) + "Enter a waybill number to view receipt details" (16px, 600) + "Scan or type a barcode to get started" (14px, `#475569`). |

### Interaction Flow

1. Operator enters barcode or selects date range
2. System queries and returns matching results
3. Single result → auto-expanded card with full details
4. Multiple results → compact list, click to expand
5. Signature section highlighted with green border accent (Supabase: `rgba(62,207,142,0.3)` → adapted as `#16A34A` border)

### Supabase References Applied
- Border hierarchy for depth (no shadows)
- Minimal query bar with compact inputs
- Green accent for confirmed/signed status
- Clean form layout with clear information architecture
- Pragmatic result display: card, not table

### Linear References Applied
- Empty state as first-class design element
- History timeline in compact feed format
- Status pills for state communication

---

## 4. Task Log — Execution Timeline

**Reference: Warp**

A read-only monitoring page showing the chronological execution history of all scan operations. Warp's editorial pacing and monospace-first identity dominate. This is not a data table — it is a terminal log.

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  Task Log                         [Today] [Filter ▼]     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ─── 2026-06-18 ──────────────────────────────────  │  │
│  │                                                    │  │
│  │  14:32:05  ✓  Arrival    WB1234567890  Line-4      │  │
│  │  14:31:42  ✓  Arrival    WB1234567889  Line-4      │  │
│  │  14:30:18  ✓  Dispatch   WB1234567890  Route-A     │  │
│  │  14:29:55  ✗  Dispatch   WB1234567888  Route-B     │  │
│  │  14:29:55     Error: Barcode not in manifest       │  │
│  │  14:28:03  ✓  Arrival    WB1234567887  Line-4      │  │
│  │                                                    │  │
│  │  ─── 2026-06-17 ──────────────────────────────────  │  │
│  │                                                    │  │
│  │  18:45:12  ✓  Sign       WB1234567800  Received    │  │
│  │  18:44:30  ✓  Dispatch   WB1234567800  Route-C     │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Stats Footer                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Total: 1,247  │  Success: 1,241  │  Failed: 6    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Component Inventory

| Component | Notes |
|-----------|-------|
| Page Header | Warp-style: 32px Display heading. Tight letter-spacing (-0.02em). Right: date selector (pill, 12px radius) + filter dropdown (ghost button). |
| Date Section Divider | Warp editorial cue: centered date label with thin horizontal lines on both sides. Font: 13px, 500, `#94A3B8`. Lines: `1px solid #F1F5F9`. |
| Log Entry | Warp monospace: JetBrains Mono 13px, line-height 1.6. Format: `HH:MM:SS  [icon]  [type]    [barcode]  [context]`. Aligned columns. |
| Success Entry | Green checkmark icon + barcode in `#16A34A`. |
| Error Entry | Red X icon + error message indented below on next line. Message in `#DC2626`, 12px. |
| Log Container | Warp terminal feel: `#F8FAFC` bg, `1px solid #E5E7EB` border, 12px radius, 12px 16px padding. Mono font throughout. Scrollable with auto-scroll-to-bottom toggle. |
| Filter Bar | Pill buttons (12px radius): Today, Yesterday, This Week, Custom. Active pill: `#2563EB` bg. Inactive: `#F1F5F9` bg. |
| Type Filter | Ghost dropdown: Arrival, Dispatch, Sign Receive, All. Multi-select with checkmarks. |
| Stats Footer | Minimal strip: three stat blocks with labels. Numbers: 16px, 600. Labels: 12px, 400, `#94A3B8`. |

### Interaction Flow

1. Page loads → shows today's log, auto-scrolled to bottom
2. Filter by date using pill selector
3. Filter by type using dropdown
4. Real-time updates: new entries auto-appended
5. Search within log: `Cmd/Ctrl + F` opens inline search bar

### Warp References Applied
- Monospace-first: the entire log area uses JetBrains Mono
- Editorial date dividers create pacing and readability
- Pill-shaped filter controls
- Tight heading letter-spacing
- Task execution as the primary visual language
- No heavy borders — the log feels like terminal output, not a table

---

## 5. Cross-Page Patterns

### Scan Input (shared: Arrival, Dispatch)

```
┌──────────────────────────────────────┐
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← 48px height, auto-focus
└──────────────────────────────────────┘
```
- Raycast focus: large, single input, no distractions
- Linear precision: compact quantity + confirm button adjacent
- Radius: 12px
- Font: 16px Inter (barcode), 14px Inter (supplementary fields)
- Always auto-focused on page load

### Status Pills (shared: all pages)

```
⬤ Active    ⬤ Queued    ⬤ Done    ⬤ Error
```
- 6px radius, 2px 10px padding, 12px/500 font
- Color-matched backgrounds with 10% opacity
- No icons inside pills — icon + text outside the pill

### Toast Notifications (shared: all pages)

```
┌─────────────────────────────────────┐
│ ┃ ✓  Scan successful                │  ← 4px green left border
│ ┃    WB1234567890 recorded at 14:32 │     auto-dismiss 3s
└─────────────────────────────────────┘
```
- Position: top-right, stacked
- Border-left: 4px solid (success=green, error=red)
- Background: `#FFFFFF`
- Shadow: shadow-sm only
- Radius: 12px
- Font: 13px caption text

### Empty States (shared: all pages)

```
            ┌────┐
            │ 🔍 │  ← 48px icon, #94A3B8
            └────┘
     No records found
  Try adjusting your filters
```
- Icon: 48px, `#94A3B8`, outline style
- Heading: 16px, 600, `#0F172A`
- Description: 14px, 400, `#475569`
- Centered in content area
- No illustrations, gradients, or animations
