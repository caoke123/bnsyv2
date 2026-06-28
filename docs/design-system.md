# BNSY Operator Design System

> 笨鸟速运操作中心 — Automation Operator Console
> Design Direction: Locked
> Phase 2 — System Definition

---

## 1. Product Identity

**BNSY Operator** is a **Task-Driven Automation Console** for logistics operations. It is not an ERP, CRM, or traditional data management dashboard. Every interface decision serves one purpose: help operators execute scan tasks efficiently with minimal cognitive load.

### Core Design Philosophy

1. **Task First, Data Second** — The primary object is the active task, not a data table. Information is shown in context of the current operation.
2. **Low Visual Noise** — Professional, industrial aesthetic. No decoration. Every element earns its pixel.
3. **Desktop First** — Operators work on desktop terminals. Mobile is not a consideration.
4. **Linear Precision** — Clean structure, clear hierarchy, no ambiguity.
5. **Immediate Feedback** — Actions produce instant, visible state changes. The system feels responsive and mechanical.

---

## 2. Design Mix & Weight Distribution

| System | Weight | Role | Contribution |
|--------|--------|------|-------------|
| **Linear** | 40% | Global Layout & Structure | Clean sidebar navigation, precise spacing, minimal color, dark-mode-inspired light skeleton, command-palette thinking for global actions |
| **Warp** | 30% | Task Execution & Logs | Warm professional tone, monospace execution output, pill-shaped action buttons, controlled negative letter-spacing on headings, editorial section pacing |
| **Raycast** | 20% | Action Interactions | Instant feedback loops, pill CTA buttons, opacity-transition hovers, double-ring containment for focused task panels, keyboard-first interaction design |
| **Supabase** | 10% | Settings & Configuration | Border-as-depth hierarchy, no-shadow surfaces, concise forms, green-accent success states, pragmatic information architecture |

---

## 3. Color Palette

### Primary Colors

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#2563EB` | CTA buttons, active states, links, selected indicators |
| Primary Hover | `#1D4ED8` | Button hover, link hover |
| Primary Light | `#EFF6FF` | Selected row background, tag backgrounds |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| Success | `#16A34A` | Scan success, completion indicators, success toasts |
| Success Light | `#F0FDF4` | Success state backgrounds |
| Warning | `#EA580C` | Attention-needed, pending confirmations |
| Warning Light | `#FFF7ED` | Warning state backgrounds |
| Danger | `#DC2626` | Errors, failed scans, destructive actions |
| Danger Light | `#FEF2F2` | Error state backgrounds |

### Neutral Colors

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#F8FAFC` | Page background |
| Card | `#FFFFFF` | Card surfaces, panels, inputs |
| Border | `#E5E7EB` | Card borders, input borders, dividers |
| Border Light | `#F1F5F9` | Subtle dividers, inactive borders |
| Text Primary | `#0F172A` | Headings, primary content |
| Text Secondary | `#475569` | Body text, descriptions |
| Text Tertiary | `#94A3B8` | Placeholders, metadata, timestamps |
| Text Inverted | `#FFFFFF` | Text on primary/dark backgrounds |

---

## 4. Typography

### Font Families

| Role | Font | Fallback |
|------|------|----------|
| Primary UI | Inter | system-ui, -apple-system, sans-serif |
| Monospace | JetBrains Mono | ui-monospace, SF Mono, Consolas, monospace |

### Type Scale

| Token | Size / Line | Weight | Usage |
|-------|------------|--------|-------|
| Display | 32px / 1.2 | 600 | Page titles (Task Log, Arrival Scan, etc.) |
| Heading 1 | 24px / 1.3 | 600 | Section headers within pages |
| Heading 2 | 20px / 1.35 | 600 | Card titles, panel headers |
| Heading 3 | 16px / 1.4 | 600 | Sub-section labels |
| Body | 14px / 1.5 | 400 | Primary body text, form labels |
| Body Medium | 14px / 1.5 | 500 | Navigation items, emphasized text |
| Caption | 13px / 1.4 | 400 | Metadata, timestamps, secondary info |
| Small | 12px / 1.4 | 400 | Fine print, helper text |
| Mono Body | 13px / 1.6 | 400 | Log output, task execution status, scan results |
| Mono Caption | 12px / 1.5 | 400 | Line numbers, monospace labels |

### Letter Spacing

- Headings: `-0.02em` (slight compression, Linear style)
- Body text: `0` (neutral)
- Mono text: `0` (JetBrains Mono is designed for code)
- Never use positive letter-spacing on UI text (Raycast's +0.2px is only for their dark-mode context)

---

## 5. Spacing System

### Base Grid: 4px

| Token | Value | Usage |
|-------|-------|-------|
| space-1 | 4px | Inline icon-text gap, tight grouping |
| space-2 | 8px | Component internal padding, related element gap |
| space-3 | 12px | Card internal padding (standard) |
| space-4 | 16px | Card internal padding (generous), section gap |
| space-5 | 20px | Panel separation |
| space-6 | 24px | Section separation |
| space-8 | 32px | Major section gap |
| space-12 | 48px | Page-level section separation |
| space-16 | 64px | Large section separation |

---

## 6. Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| radius-sm | 6px | Small elements: tags, badges, inline code |
| radius-md | 12px | Buttons, inputs, dropdowns |
| radius-lg | 16px | Cards, panels, modals |
| radius-full | 9999px | Pill buttons, status dots |

---

## 7. Shadow

**Only `shadow-sm` is permitted.**

| Token | Value | Usage |
|-------|-------|-------|
| shadow-sm | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Card elevation, dropdown menus |

**Forbidden:**
- `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`
- Multi-layer shadow stacks
- Inset shadows
- Colored glow effects
- Glass/blur effects

**Depth Alternative:**
- Elevation is communicated through **border contrast** (Supabase approach): `#E5E7EB` for standard, `#F1F5F9` for subtle
- Never rely on shadow alone to indicate interactivity

---

## 8. Layout Structure

### Global Frame

```
┌──────────────────────────────────────────────────────┐
│  Header (64px)                                       │
├────────────┬─────────────────────────────────────────┤
│            │                                         │
│  Sidebar   │  Content                                │
│  240px     │  Max Width 1600px                       │
│            │                                         │
│            │                                         │
└────────────┴─────────────────────────────────────────┘
```

### Header (64px)
- Background: `#FFFFFF`
- Border bottom: `1px solid #E5E7EB`
- Left: Product logo + name
- Center: Global search / command palette trigger
- Right: User profile, notifications
- Sticky on scroll

### Sidebar (240px)
- Background: `#FFFFFF`
- Border right: `1px solid #E5E7EB`
- Navigation sections with clear groupings:
  - **Operation** — Arrival Scan, Dispatch Scan, Sign Receive
  - **Monitor** — Task Log
- Active item: `#EFF6FF` background, `#2563EB` text, `#2563EB` left border accent (3px)
- Inactive item: transparent, `#475569` text
- Icons: 20px, outline style, `#94A3B8`

### Content Area
- Background: `#F8FAFC`
- Max width: 1600px
- Padding: 24px (space-6) on all sides

---

## 9. Component Foundations

### Buttons

| Variant | Background | Text | Border | Radius | Padding |
|---------|-----------|------|--------|--------|---------|
| Primary | `#2563EB` | `#FFFFFF` | none | 12px | 8px 20px |
| Primary Hover | `#1D4ED8` | `#FFFFFF` | none | 12px | 8px 20px |
| Secondary | `#FFFFFF` | `#0F172A` | `1px solid #E5E7EB` | 12px | 8px 20px |
| Secondary Hover | `#F8FAFC` | `#0F172A` | `1px solid #E5E7EB` | 12px | 8px 20px |
| Ghost | transparent | `#475569` | none | 12px | 6px 12px |
| Ghost Hover | `#F1F5F9` | `#0F172A` | none | 12px | 6px 12px |
| Danger | `#DC2626` | `#FFFFFF` | none | 12px | 8px 20px |
| Pill Action | `#2563EB` | `#FFFFFF` | none | 9999px | 10px 28px |

- All hover states use **opacity transitions** (150ms ease), not color transitions (Raycast pattern)
- Focus ring: `0 0 0 2px #FFFFFF, 0 0 0 4px #2563EB` (Vercel accessibility pattern)
- Disabled: opacity 0.4, cursor not-allowed
- Button text: `14px` / `500` weight

### Inputs

| State | Background | Text | Border | Placeholder |
|-------|-----------|------|--------|-------------|
| Default | `#FFFFFF` | `#0F172A` | `1px solid #E5E7EB` | `#94A3B8` |
| Focus | `#FFFFFF` | `#0F172A` | `1px solid #2563EB` | `#94A3B8` |
| Error | `#FEF2F2` | `#0F172A` | `1px solid #DC2626` | `#94A3B8` |
| Disabled | `#F1F5F9` | `#94A3B8` | `1px solid #E5E7EB` | — |

- Height: 40px (standard), 32px (compact)
- Padding: 0 12px
- Radius: 12px
- Font: 14px / 400

### Cards & Panels

- Background: `#FFFFFF`
- Border: `1px solid #E5E7EB`
- Radius: 16px
- Padding: 20px (standard), 24px (content-heavy)
- Shadow: `shadow-sm` only
- Header area: top padding, optional bottom border `#F1F5F9` for header/content separation

### Tags & Badges

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| Default | `#F1F5F9` | `#475569` | none |
| Success | `#F0FDF4` | `#16A34A` | none |
| Warning | `#FFF7ED` | `#EA580C` | none |
| Danger | `#FEF2F2` | `#DC2626` | none |
| Info | `#EFF6FF` | `#2563EB` | none |

- Padding: 2px 10px
- Radius: 6px
- Font: 12px / 500

### Log Output

- Font: JetBrains Mono 13px / 1.6
- Background: `#F8FAFC`
- Border: `1px solid #E5E7EB`
- Radius: 12px
- Padding: 12px 16px
- Line numbers: `#94A3B8`, right-aligned, 40px column
- Monochrome syntax: no colored log levels (professional, industrial)
- Timestamps: `#94A3B8`, JetBrains Mono 12px

---

## 10. Interaction Patterns

### Loading
- Skeleton screens for initial loads (card shapes only, no animation)
- Inline spinners for button loading states
- No full-page loading overlays

### Empty States
- Minimal: icon (48px, `#94A3B8`) + heading (16px, 600) + description (14px, `#475569`)
- No illustrations, no bright colors

### Error States
- Inline error messages below inputs: 12px, `#DC2626`
- Toast notifications for scan failures: top-right, 4px green/red left border, auto-dismiss 5s
- No modal errors for recoverable failures

### Success Feedback
- Brief green flash on scan success rows (Linear style: minimal, functional)
- Toast for batch completion
- No celebratory animations

### Keyboard (Raycast influence)
- `Enter` to confirm / execute scan
- `Escape` to dismiss panels
- `Cmd/Ctrl + K` for command palette (global actions)
- Numeric keypad support for scan quantity input

---

## 11. Forbidden Patterns

- Ant Design / Element UI / Bootstrap / Material component libraries
- Traditional CRUD table-first layouts (data tables embedded in task context only)
- Heavy gradient backgrounds
- Colorful or animated icons
- Deep shadows (shadow-md and above)
- Glassmorphism / blur effects
- Dark mode (operator environment is well-lit)
- Rounded avatars / circular user photos
- Emoji in UI
- Loading spinners with brand colors
- Card hover effects with dramatic shadow lift
- Positive letter-spacing on body text
- Bold (700+) weight outside of headings
