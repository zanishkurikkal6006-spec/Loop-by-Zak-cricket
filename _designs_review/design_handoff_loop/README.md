# Handoff: Loop — Cricket Academy Management Platform

## Overview
**Loop** (by Zak Cricket) is a cricket-academy management platform for the UAE. It serves three roles from one login:
- **Admin** — operations & finance (players, packages, payments, attendance confirmation, finance, programs, badges).
- **Head Coach** — development oversight across all coaches (reports, matches, rankings, badges). No finance access.
- **Coach** — own assigned groups: attendance, 1-on-1 session blocks, AI session reports, match logging, match-fee collection, rankings.

The product is built for serious coaches — professional, premium, **not** a kids' app. WhatsApp is the parent communication channel throughout.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing the intended look, layout and behavior. They are **not production code to copy directly.**

They are authored as "Design Components" (`.dc.html`) — a lightweight runtime (`support.js`) renders a small template + a `class Component extends DCLogic` logic block (React-like `state` / `renderVals()`). **Do not port the `.dc.html` runtime.** Instead, **recreate these screens in the target codebase** using its established framework and patterns (React, Vue, SwiftUI, native, etc.). If no codebase exists yet, **React + Tailwind** (or styled-components) is a good fit — the prototypes are plain inline-styled markup that maps cleanly to components.

To view a prototype: open any `.dc.html` in a browser (they load `support.js` from the same folder). `Loop - Product.dc.html` is the hub — login → role picker → opens each screen inline with a phone/desktop toggle.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, components and interactions are all specified. Recreate the UI to match, using the codebase's component library where one exists. Exact tokens are in **Design Tokens** below.

---

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| Brand Red | `#9C1116` | Primary actions, active nav, key accents |
| Deep Red | `#6E0C10` | Gradients, depth, avatars |
| Gold | `#C9A84C` | Premium accent — 1-on-1 / achievements / head-coach |
| Gold (light foil) | `#EFDC97` | Top of gold gradients |
| Gold (dark) | `#937328` | Gold text on light, gradient bottoms |
| Ink | `#141414` | Text, sidebars, dark cards |
| Paper | `#FAF7F4` | App background / surfaces |
| App canvas | `#E7E4DF` | Behind device frames / page gray |
| Card border | `#ECE7E1` | Default 1px borders |
| Hairline | `#F3EEE8` / `#F1ECE6` | Row dividers, inset fills |
| Success green | `#1F8A4C` | Present, paid, healthy |
| Amber | `#C9A84C` / text `#A9791B` | Late, low, pending-confirm |
| Danger red | `#B3261E` | Exhausted, overdue (NOTE: no "absent" state exists) |
| Info blue | `#2563EB` (bg `#EAF1FB`, border `#C3D7F2`) | Policy notes, info callouts |
| WhatsApp green | `#25D366` (bubble `#075E54`) | Send-to-parent actions & previews |

State chip backgrounds: green `#E7F4EC`, amber `#FBF1DD`, red `#FBE9E8`, blue `#EAF1FB`, gold `#F5ECD3`, comp/purple `#F1EAFE` (ink `#7C3AED`).

### Typography
- **Display / numbers:** `Bebas Neue` (condensed, all-caps feel) — wordmark, big stat numbers, screen titles. Letter-spacing ~`0.02–0.05em`.
- **UI / body:** `Jost` (geometric sans) — all labels, buttons, body. Weights 400/500/600/700.
- Eyebrow labels: 10–11px, weight 600, `letter-spacing: 0.2–0.3em`, `text-transform: uppercase`, muted ink.
- Body: 12.5–14px Jost. Tagline style: uppercase, letter-spaced `0.3em+`.
- Google Fonts import: `family=Bebas+Neue&family=Jost:wght@400;500;600;700`.

### Spacing / Radius / Shadow
- Card radius **14–18px**; pills/buttons **9–14px**; chips/tags **7–8px**; circular avatars `50%`.
- Card padding 15–22px; gaps 8–18px.
- Card shadow: `0 10px 24px -20px rgba(20,20,20,0.5)` (subtle) up to `0 20px 44px -30px rgba(20,20,20,0.5)`.
- Device frames: phone **390×844** (radius 38–50px bezel), desktop **1280×900** (sidebar 240px).
- Min tap target **44px**.

### Signature motifs (must carry through)
- **The loop/ring:** a gold ring is the brand's core mark. It frames the logo, **every badge**, the **1-on-1 session tracker** (filling progress ring), and attendance gauges. Reuse one ring component everywhere.
- **Gold = premium thread:** reserve gold for 1-on-1 ("Gold programme"), achievements/badges, and head-coach. Brand red stays the primary action color.
- **Seam texture:** a 48° repeating-linear-gradient of thin gold lines (cricket-ball seam) on dark hero/login surfaces.

---

## Roles, Screens & Views

### Login (all roles)
Split screen: left = deep-red seam-textured brand panel with the glossy loop badge + "LOOP / By Zak Cricket"; right = email + password + **Sign In**. Then a **role picker** (Admin / Head Coach / Coach) → routes to that role's destination. Parent/player note: "use the link your academy sent you."

### COACH — `Loop App - Coach Mobile.dc.html` (390×844) & `Loop App - Coach Desktop.dc.html` (1280)
Bottom nav (mobile) / 240px sidebar (desktop): **Home · 1-on-1 · Attend · Matches · Ranking** (+ Reports/Achievements on desktop). Nav icons: rounded line style, ~2px stroke, Ink inactive / Brand Red active, with active dot.
- **Home:** time-aware greeting ("Good morning, Zanish") + a rotating recognition/motivation line (seeded by day; ~60% real-stat recognition, ~40% motivational, zero-stat lines skipped). Dark **Coaching Portfolio** card (sessions / players / 1-on-1s, "Download Career Record"). **"My Groups · Attendance (this week)"** card showing the coach's *assigned* groups with attended counts (e.g. Elite · Under 16 → 16/18). Today's schedule, quick actions incl. a prominent dark **"Write a Report"** tile.
- **Attendance (the USP — fastest screen):** **date stepper** (prev/today/next, can't go future) + **batch/group chips** (the coach's own groups only). **Two states only — Present (green) / Late (amber); there is NO Absent.** You simply don't mark kids who aren't there; sessions deduct only for present/late. Live count chips, search, "Mark all present" / "All in", per-player P/L buttons with colored left edge, avatar loop-ring, then a **re-confirmation list** before final **Submit to Admin**. "Late counts as attended."
- **1-on-1 Sessions:** gold hero (total private sessions delivered all-time). **Assigned blocks** sorted most-remaining-first; each card = loop-ring avatar + focus note + **signature ring + bar tracker** ("3 of 8 used · 5 remaining") colored green(3+)/amber(1–2)/red(0 "renewal needed"), recent sessions with ✅ if report sent, **"+ Log Session for [name]"**. **"+ Add Block"** (self-coordinated — when a client arranges directly with the coach): pick player/focus/total, **payment = Paid / "Not paid yet — still attending"**; unpaid still counts & runs, carries a "payment pending" flag for later chase. **Log Session** → inline AI report card showing **date + time slot** of the session.
- **Reports (two-tier, both coach-triggered — nothing auto-fires):**
  - **Report A — per-session quick feedback:** pick player chips → type 2–3 rough words → AI expands into a warm message **addressed to the child by first name** (reads personal, not generic) → editable field + live WhatsApp preview → Rewrite / Send to Parent → sent confirmation. 4 separate frames.
  - **Report B — end-of-block development report:** list of players who finished a block → **Create Development Report** → premium branded template (Loop crest header, session/improvement/badge stats, **Focus areas · Progress & strengths · What to work on next · Coach's note**) → Edit / Send to Parent.
- **Matches:** **Match Log / Match Payments** toggle.
  - *Log:* season list with result tag, team score, player-of-match. Import from CricHeros (gold primary) + Log Manually; CricHeros import is a multi-frame flow (upload → "AI reading scorecard" loop-ring loader → "Imported — verify" → prefilled stats). Per-match detail = full scorecard (batting position, runs, balls, how-out, wickets) + a coach **"why" note per player** ("moved to 4 to face spin") = the accountability/evidence record. A player **Match History** "evidence record" is reachable from the player profile.
  - *Payments (coach coordinates the match, so collects/confirms fees):* per-match cards (fee/player, progress bar, collected/total), per-player rows with states **✓ Bank transfer confirmed / ✓ Cash collected / 📸 Screenshot received—confirm / Awaiting payment**. Parent bank-transfers + sends screenshot → coach taps **Confirm Bank**; cash → **Collect Cash**. Bank-details card to share to parent. Admin sees the same data live.
- **Rankings:** top-3 podium (gold/silver/bronze loop-ring avatars) + ranked list. Filters: **Group · Age category · Stat** (Runs / Batting Avg / Wickets / Strike Rate) — separate filterable leaderboards, re-sort live.

### HEAD COACH — `Loop App - Head Coach Desktop.dc.html` (1280)
Development oversight only — **no finance/payments anywhere** (green header pill: "Development view · no finance"). Sidebar: **Coaches · All Reports · Flags**.
- **Coaches dashboard:** stat row + a card per coach (sessions delivered, reports sent, reports pending, players, status tag "Reporting well"/"Quiet · N days").
- **Coach detail:** that coach's report stream (sent + draft). Note: "you review & monitor — the coach still owns sending."
- **All Reports:** academy-wide table (player · coach · type · when · status), filter All/Sent/Drafts. **Every report row is clickable → a reader modal showing the full report text exactly as the parent received it.**
- **Flags:** quiet coaches / stalled players, framed supportively.
- Also has full **Matches** (per-match scorecards) and **Rankings** (group/age/stat filters) + **Badges overview**, all read-only.

### ADMIN — `Loop App - Admin Desktop v2.dc.html` (1280) & `Loop App - Admin Mobile.dc.html` (390×844)
Sidebar/bottom-nav: **Home · Players · Finance · Attendance · Payments** (badge count on Attendance).
- **Dashboard:** 4 stat cards (Players / Reports Sent / Programs / Pending Payments — amber if >0). Permanent **blue policy callout**: "Sessions still count for every player — even with payment pending." Contextual alerts (red no-package / ground-fee outstanding; amber screenshot-to-review / attendance pending). **Financial Overview** card (deep-red→ink gradient, Collected/Outstanding/Net + bar chart). Season runs/wickets, Programs & Badges tiles, Training Centers summary. **Coach Activity** — per coach 4-metric grid (1-on-1 gold / Sessions / Players / Msgs), **🎯 Assign 1-on-1** + **⬇ Portfolio**, and that coach's active private packages with filling-ring progress.
- **Players:** search + group filter pills + **+ Add**. Cards: loop-ring avatar, group/age/center, package-status strip, badge emojis. **Add Player modal** — Single/Bulk toggle; **Package status: New player OR "Already has a running package"** (day-one migration: size + sessions used → **remaining auto-calculates** with the ring); Bulk has **New players / Mid-package import** (table where remaining auto-calcs per row). **Player detail:** badges, **Package & Sessions** card (color-coded border, ring, Assign/Update Package), season stats, parent + **Open WhatsApp**, recent reports, enrolled programs, and a **complete payment history** (group/1-on-1/match fees with dates + mode of payment).
- **Attendance:** 3 tabs — **Pending** (submission cards with present/late breakdown, batch shown, **Review N players** to verify each by name + correct before **Confirm & Send WhatsApp**; cross-coach **double-marking detection** → amber "also marked by Coach B today" with **1-session (default) / 2-session** deduction choice so a parent is never double-charged), **History** (confirmed), **Take Attendance** (admin covers for a coach — date + batch/group + credit-to-coach + auto-confirm). Plus a **"Not seen recently" (14+ days)** amber follow-up list.
- **Payments:** 4 tabs — **Packages & Sessions** (package-type list 4/200 · 8/380 · 12/550 · 20/850 · Unlimited/1200 · Complimentary; per-player status with **5 counter states** healthy/low/exhausted/unlimited/comp, each a ring; tags **"Admin-assigned" vs "Coach-added · payment pending"**; renewal chase list ≤2), **Match Fees**, **Ground Fees** (+ add-booking modal), **Settings** (Training Centers, **Batches & Time Slots** — name+time+groups+center, e.g. Elite Evening 4:45–7:15, Launch Pad/Level Up 4:30–6:00, Elite Batch 2 6:30–9:00; Academy bank details).
- **Finance:** 3 tabs — **Overview** (4 stat cards + filter bar: date range/center/status + **Export to Excel**, monthly revenue stacked bars packages-green + match-fees-gold + breakdown table), **Match Fees** (cash/bank/pending stat cards + flat log **and per-match cards showing who paid & how**, mirroring the coach view), **By Center**. Also a group-by-group **Month-End Report** (sessions remaining/used, package & payment status, "not seen" flag; sorted action-first; export).
- **Programs:** program cards + Create Program modal (emoji, accent, description, enrol).

### BADGES — `Loop App - Badges.dc.html` + reusable `Badge.dc.html`
26 badges across **Performance (8) · Attendance (4/5) · Progress (4) · Moment (10)**. Each = **loop-ring medallion** (gold ring frame), own accent color + emblem, Jost-caps name + one-line criteria. States: **earned = full color; locked = greyed with lock chip**. **Hat-Trick Hero** is the most-coveted (gold burst). Match/Moment badges **auto-send** to parent on match log; Season badges (Performance/Progress/Attendance) go to a **manager-approval queue** first. Attendance/consistency badges are gap-based (fair to flexible attendance) — e.g. *Session Keeper: no 10-day gap for 2 months*; *All-Season Pro: no gap >14 days across the 6-month season*; *Relentless: 20+ sessions in a calendar month*.

---

## Interactions & Behavior
- **Navigation:** tab/sidebar switches the active view (single-page). Modals are centred dialogs on desktop, **bottom sheets on mobile** (slide up; tap-scrim to dismiss; stop propagation on the sheet body).
- **Attendance marking:** tap P/L toggles per player; "Mark all present"; live counts update; required **re-confirmation list** before submit; submit fires a WhatsApp-to-parents toast.
- **Payment confirm:** screenshot→Confirm Bank flips to confirmed; cash→Collect Cash; collection total + progress bar update live.
- **AI report generation:** notes → "generating" frame (spinning loop ring ~1.2–1.5s) → editable expanded draft (always addresses child by first name) → Rewrite re-generates → Send shows confirmation.
- **Toasts:** dark pill, gold check, auto-dismiss ~2.4–2.6s.
- **Hover:** cards lighten border toward gold; buttons `filter: brightness(1.07)`.
- **Responsive:** distinct phone (390) and desktop (1280, 240px sidebar) layouts — implement as breakpoints or separate route layouts.

## State Management
Per app (mirror these): `view`/active tab; modal/sheet open flags; selected IDs (player, coach, match, package); attendance `marks` map (`present`/`late`/`null`) + `confirmed` map + `dayOffset` + `batch` + per-day `dedupChoice`; payment `payState` map (bank/cash/screenshot/pending); report flow (`tab` A/B, `step` 1–4, selected player, `notes`, `draft`); filter selections (group/age/stat, finance range/center/status); toast string. Data fetching: players, coaches, groups/batches, sessions/blocks, attendance records, matches + scorecards, packages, payments (group/1-on-1/match/ground), badges, programs.

## Assets
- **Fonts:** Bebas Neue + Jost (Google Fonts).
- **Logo / loop badge:** vector path included inline in every file (extracted from the brand mark) — the red disc + gold ring + white angular "Z". Brand book in `Loop by Zak Cricket - Brand Book.dc.html`.
- **Icons:** inline SVG line icons (no icon-font dependency).
- **No raster images** — everything is CSS/SVG. Replace WhatsApp/CricHeros glyphs with your icon set.

## Files (in this bundle)
- `Loop App - Coach Mobile.dc.html` — coach, phone
- `Loop App - Coach Desktop.dc.html` — coach, desktop
- `Loop App - Admin Desktop v2.dc.html` — admin, desktop (latest)
- `Loop App - Admin Mobile.dc.html` — admin, phone
- `Loop App - Head Coach Desktop.dc.html` — head coach, desktop
- `Loop App - Badges.dc.html` + `Badge.dc.html` — badge system + reusable badge component
- `Loop - Product.dc.html` — the hub (login → role picker → opens each screen; phone/desktop toggle)
- `Loop by Zak Cricket - Brand Book.dc.html` — full identity manual (colors, type, logo, motifs)
- `support.js` — the prototype runtime (reference only; **do not port**)

Open any file in a browser to view; they reference `support.js` from the same folder.
