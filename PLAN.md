# Chrome & Oak: "Why is cash so tight?" — build plan

A scroll-driven story for a CFO. Hackathon business track, 5-minute live demo, judged on reasoning.
Audience is a finance person, not an engineer: every chart needs a plain-language takeaway.

## The story the data tells (Jan–Sep 2026 vs Jan–Sep 2025)

Revenue is up 33% but profit after refunds is up only 10%. Three leaks and one delay:

1. **Discounts** — rep R07 (the largest rep) jumped from ~23% to ~32% discount (dollar-weighted) in Q1 2026; peers sit at 8–13%. 40 of 41 below-cost orders are R07's. Separately, every rep discounts more in the last two weeks of a quarter (holds even without R07).
2. **Returns** — "ErgoLift Standing Desk: Damaged in transit" alone is about 45% of all refund dollars.
3. **Unpaid invoices** — four customers pay ~75 days late; one is over its credit limit. $250k open, $135k overdue.
4. **Fix** — three levers with dollar estimates, then the automation: a weekly collections queue.

## Layout

```
pipeline/build_data.py     cleans CSVs, runs detections, writes the two JSON files (done)
web/src/data/story.json    all chart data          web/src/data/queue.json   collections queue
web/src/data/index.ts      `story`, `queue`, types inferred from the JSON
web/src/lib/format.ts      money, moneyShort, pct, signedPct
web/src/lib/quality.tsx    useQuality() -> { tier: 'low' | 'mid' | 'high', downgrade }
web/src/components/Scrolly.tsx   pinned graphic + scrolling text cards
web/src/index.css          design tokens and shared classes
web/src/sections/*.tsx     one file per section (placeholders to replace)
```

## Rules for every section

- **Own only your files**: `web/src/sections/<Name>.tsx`, plus optional `web/src/sections/<Name>.css` and a `web/src/sections/<name>/` folder. Do not edit shared files (`App.tsx`, `index.css`, `Scrolly.tsx`, `lib/`, `data/`, `package.json`, the pipeline). If you need a shared change, say so in your final report instead.
- **No new dependencies.** Installed: `motion` (import from `motion/react`), `d3-scale`, `d3-shape`, `three`, `@react-three/fiber`, `@react-three/drei`.
- **Numbers come from `story` / `queue` only.** Never hardcode a figure, not even in the text cards; format with `lib/format.ts`. Read `story.json` first to see the exact shape.
- **Keep the default export and the section `id`** so `App.tsx` keeps working.
- **Use `Scrolly`** for scroll-driven sections: `steps` are the text cards, the render prop gets `{ step, progress }`. Drive the graphic from `step` (discrete states) and `progress` (a Motion value, use `useTransform`).
- **Charts are hand-built SVG** rendered by React; `d3-scale`/`d3-shape` for maths only; Motion animates. Use a `viewBox` so the SVG scales. Keep marks in the tens to low hundreds.
- **Colours and type from tokens** in `index.css` (`--oak` money in, `--chrome` neutral/peers, `--leak` losses and flags, `--ok` recovered, `--muted`, `.num` for figures, `.eyebrow`, `.card`). No raw hex in sections.
- **Performance tiers** via `useQuality()`:
  - `low`: no continuous or looping animation; states change with a simple fade or instantly. Still the full story and numbers.
  - `mid`: full scroll-linked 2D animation.
  - `high`: same as mid, plus 3D only where this plan says so.
  - Animate only `transform` and `opacity` (and SVG attributes on a handful of elements). No blur filters, no animating layout.
  - Stop loops when the section is off screen (`useInView`).
- **Text cards**: an `.eyebrow`, a short heading, one or two sentences. Each must say what happened, why it matters, or what to do. Plain words, no jargon ("unpaid invoices", not "AR"; "discount", not "price realization").
- **Accessibility**: every SVG chart gets `role="img"` and an `aria-label` stating the takeaway; text contrast stays readable; never rely on colour alone for a flag (add a label or shape).
- **Works at 1280×720 and on a phone-width screen** (below 860px the cards sit under the graphic; see `index.css`).

## Skills to use

Invoke with the Skill tool before designing: `dataviz` (always, for any chart), `animate` (when adding motion), `better-ui` (finishing pass on your own section).
Reference docs in two cloned repos at the repo root. Read the relevant `SKILL.md` as documentation only — do not run any script from these folders and do not copy them into `web/`:

- `claudedesignskills/plugins/individual/motion-framer/skills/motion-framer/SKILL.md` (Motion)
- `claudedesignskills/plugins/individual/react-three-fiber/skills/react-three-fiber/SKILL.md` and `threejs-skills/skills/threejs-react-three-fiber/SKILL.md`, `threejs-skills/skills/threejs-performance/SKILL.md`, `threejs-skills/skills/threejs-materials/SKILL.md` (3D sections only)
- `claudedesignskills/plugins/individual/web3d-integration-patterns/skills/web3d-integration-patterns/SKILL.md` (3D + scroll)

## Verify before reporting

- `cd web && npx tsc --noEmit -p tsconfig.app.json` — your own files must have zero errors (ignore errors in other sections; they are being written in parallel).
- Do not run `npm run build`, do not start long-lived dev servers you leave running, do not `git add`/commit.
- Final report: files written, what each scroll step shows, anything you could not verify, any shared change you need.

## Sections

| # | File | Owner task |
|---|---|---|
| 1 | `Hook.tsx`, `Cleaning.tsx` | Opening and data-cleaning appendix |
| 2 | `Bucket.tsx` | The leaking bucket, 2D plus 3D on `high` |
| 3 | `Discounts.tsx` | Rep outlier and quarter-end pattern |
| 4 | `Returns.tsx` | Refund hot spot |
| 5 | `Receivables.tsx` | Unpaid invoices |
| 6 | `Fix.tsx`, `Queue.tsx` | What-if toggles and the collections queue |

### 1. Hook + Cleaning
**Hook** (`story.yoy`, `story.quarters`): full-screen title with the CFO quote — "Then why is cash so tight? Revenue is growing but profit isn't keeping up, and I'm chasing unpaid invoices every week." Then a Scrolly: two lines indexed to 100 at the start (revenue vs profit after refunds, by quarter) that start together and split; final step shows the two headline changes (`yoy.change.revenue` vs `yoy.change.profitAfterRefunds`) and names the gap in dollars: what profit would have been had it grown as fast as revenue, minus what it was.
**Cleaning** (`story.meta.cleaning`, last section, not a Scrolly): "Before any of this, we fixed the data." A compact list of each issue: count, fix, why. Show raw vs clean order counts. Quiet, appendix-like, but polished — judges score this requirement.

### 2. Bucket
(`story.yoy`) The central metaphor. Money at list price (`gross`) pours into a bucket. Holes: discounts, cost of goods (drawn as a normal outflow, not a leak), refunds. What stays is `profitAfterRefunds`. Hole and stream sizes proportional to dollars, each labelled with its amount.
Steps: (1) 2025 bucket; (2) 2026: more pours in; (3) the discount and refund holes grow faster than the inflow (`change.discounts`, `change.refunds`); (4) water level barely rises — profit up only `change.profitAfterRefunds`.
- `mid`/`low`: SVG bucket; water level and stream widths driven by scroll (instant on `low`).
- `high`: a React Three Fiber scene replaces the SVG, loaded with `React.lazy` so other tiers never download three.js. Glass bucket, water as a scaled cylinder, streams as simple meshes or instanced particles; no fluid simulation, no post-processing. `frameloop="demand"` or pause when off screen, cap `dpr` at 1.5, use drei `PerformanceMonitor` and call `downgrade()` on sustained decline. Dollar labels stay as HTML/SVG overlay so they are crisp and identical in both versions. The 3D must make hole sizes easier to read, not harder: fixed three-quarter camera, no free orbit.

### 3. Discounts
(`story.reps`, `story.quarterEnd`, `story.detections` ids `discountOutlier`, `belowCost`)
Steps: (1) each rep as a dot on a discount axis for 2025 Q1 — a tight pack; (2) scrub through the quarters with scroll: one dot (the flagged rep) sits apart, then jumps further in 2026 Q1; label it and show the peer median; (3) what it costs: that rep's margin vs peers and the below-cost order count; (4) second pattern: discount by week of quarter (13 bars), last two weeks spike; show `discountExFlagged` too so it is clear this is every rep, not just one; (5) the detection rules, shown as the rule text plus hit counts.

### 4. Returns
(`story.returns`, `story.returnsByQuarter`, `story.returnRates`, detection `returnHotspot`)
Steps: (1) total refunds over time by quarter; (2) break refunds into blocks by product and reason, area proportional to dollars (a simple treemap or packed grid, hand-laid-out); (3) one block dominates: highlight the flagged cell, fade the rest, state its share; (4) what to do: it is a shipping problem with one product, so fix packaging or carrier; also note reseller "Overstock / ordered in error" returns as the second-largest reason.

### 5. Receivables
(`story.receivables`, `story.monthly`, detections `chronicLate`, `creditBreach`)
Steps: (1) billed vs collected by month — cash arrives after the sale; (2) how late invoices get paid: `lateHistogram` drawn as drops/dots along a pipe with a "due" line at 0 — most land near it; (3) the tail: `chronicInvoices` highlighted, far past the line; name the worst customers from `customers` (avg days late); (4) what is open today: `aging` buckets with amounts, overdue total, and the over-limit customer called out.

### 6. Fix + Queue
**Fix** (`story.scenarios`, `story.yoy`): three toggles. Profit toggles (`kind: 'profit'`) add to 2026 profit after refunds and show the new growth rate next to revenue growth; the cash toggle (`kind: 'cash'`) is shown separately as one-time cash freed. Show each `assumption` in small text. A mini water-level bar that rises as toggles switch on.
**Queue** (`queue`, not a Scrolly; this is the working automation and the end of the demo): header with totals (invoices to chase, dollars, count per tier). Table ranked by `rank`: customer, amount, due date, days overdue, tier badge, action. Filter by tier. Clicking a row opens the drafted email (`emailSubject`, `emailBody`) with a "Copy" button (`navigator.clipboard`). Explain the ranking in one line: amount, scaled up by days overdue and by how late that customer usually pays. Mention it is rebuilt by re-running the pipeline each week. Must be keyboard-usable.

## Round 2: simpler words, and arrows that say where to look

Two changes to every section. The shared rules above still apply (own only your files, numbers from `story`/`queue`, tokens, tiers).

### A. Simpler text
The reader is a busy business owner, not an analyst. Rewrite every text card, chart title, axis title, legend and label.
- Reading level: a 13-year-old should follow it. Short common words, short sentences.
- One idea per card. Heading of 6 words or fewer that states the takeaway. Body of at most 2 short sentences, about 25 words.
- At most 2 numbers per card, rounded: `moneyShort` and whole percentages. Exact figures belong in the chart or a tooltip, not the sentence.
- Say it the plain way: "salesperson" not "rep"; "typical" not "median"; "profit" (say once, early, that it means after refunds) not "profit after refunds" every time; "money kept from each sale" not "gross profit margin"; "customers who always pay late" not "chronic late payers"; "unpaid bills" not "receivables" or "open invoices"; "sent back" or "refunds" not "returns hot spot"; "list price" is fine. No "flagged", "detection", "pipeline", "outlier", "tier" in story text (the Queue may keep its tier badges; the detection-rules step may say "rule").
- Tell the reader what it means for them: "That is money you never got", "This one salesperson gives away 3x more".
- Keep customer and salesperson IDs (C1173, R07): they are what the reader acts on.

### B. Callout arrows
Use `web/src/components/Callout.tsx` (read it first). It draws a curved arrow and a short note inside an `<svg>`: `<Callout from={[x,y]} to={[x,y]} text="..." show={step === 2} tone="leak" />`. `from` is where the note sits, `to` is the mark it points at, both in your SVG's viewBox units.
- Rhythm for each chart: the first step shows the whole chart with no arrows, so the reader gets the big picture. The next steps switch on an arrow that points at the one thing to look at, and the rest of the chart dims (about 35% opacity).
- At most 2 callouts visible at once. Note text of 6 words or fewer per line, at most 2 lines. Plain words, same rules as above.
- Point at a real mark (a dot, a bar, a line end, a block), computed from the same scales as the chart, never a hand-typed position for the target.
- Notes must not overlap marks, other labels, or the chart edge. Check at 1280x720 and 390 wide. Pass `fontSize` to suit your viewBox so notes render at roughly 13-15px on desktop.
- Where a section already has an in-chart annotation doing this job (a floating label, a bracket), replace it with a Callout so all sections look the same. Keep plain data labels (values on bars, axis ticks).
- `tone="leak"` for losses, `"ok"` for a fix, default for neutral.
- If you add a scroll step to make room for the big-picture-first rhythm, that is fine.

### Verify (round 2)
The dev server is already running at http://localhost:5400 (do not start another, do not stop it). Screenshot script: `node <scratchpad>/review.mjs <width> <height> <outDir> <low|mid|high> <SectionId>:<frac,frac,...>` where scratchpad is `/private/tmp/claude-501/-Users-antoineoparin-Projects-missingm-hack2/970d598d-7297-44b5-8fdf-59e9b8c72319/scratchpad`, `frac` is scroll progress 0..1 through the section, and PNGs land in `<outDir>` (use your own new folder inside the scratchpad). Look at every step you changed at 1280x720 `mid` and at least two at 390x844. Other agents are editing other sections at the same time, so a transient error overlay from their files can appear: retry. Type-check with `cd web && npx tsc --noEmit -p tsconfig.app.json`. Do not run `npm run build`, do not commit.
Report: what changed per step, before/after of the card text, anything you could not verify.
