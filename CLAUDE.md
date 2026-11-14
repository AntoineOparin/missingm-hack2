# Chrome & Oak: "Why is cash so tight?"

Hackathon project (Hack 2 the Future 2026, business track, option B: Sales & Finance). A scroll-driven web story that answers the CFO's question: revenue is up a third, so why is cash tight and profit flat? It ends in a working automation: a weekly ranked list of unpaid bills to chase, each with a drafted email.

Judged on reasoning in a 5-minute live demo. The reader is a business owner, not an analyst.

## Run it

```bash
# data: clean the CSVs, run the checks, write the JSON the app reads (also rebuilds the weekly chase list)
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt   # first time only
.venv/bin/python pipeline/build_data.py

# app
cd web && npm install && npm run dev      # http://localhost:5173
npm run build                             # type-check + production build
npx oxlint src                            # lint
```

Force a performance tier with `?quality=low` or `?quality=mid` (useful if the demo machine stutters).

## How it fits together

```
ChromeAndOak_SalesFinance_Data/   raw orders.csv, customers.csv, returns.csv (dirty on purpose)
pipeline/build_data.py            cleaning + 5 detection rules + chase list -> JSON. Asserts on the headline numbers.
web/src/data/story.json           every chart number          web/src/data/queue.json   the chase list
web/src/data/index.ts             exports `story`, `queue`; types are inferred from the JSON
web/src/lib/format.ts             money, moneyShort, pct, signedPct
web/src/lib/quality.tsx           useQuality() -> tier 'low' | 'mid' | 'high'
web/src/components/Scrolly.tsx    pinned graphic + text cards that scroll past
web/src/components/Callout.tsx    curved arrow + short note, used inside any <svg>
web/src/index.css                 design tokens and shared classes
web/src/sections/                 one file per section, in App.tsx order:
  Hook         CFO quote, then revenue vs profit lines splitting apart
  WaterFlow    the illustration: sales pour from a pipe, discounts and refunds drip away
  Discounts    one salesperson (R07) far above the rest; everyone discounts more at quarter end
  Returns      refunds by quarter; one desk damaged in shipping is 45% of refund dollars
  Receivables  billed vs collected; a few customers always pay late; one is over its credit limit
  Fix          three what-if switches with dollar estimates
  Queue        the automation: who to chase this week, with ready-to-send emails
  Cleaning     appendix: each data problem, how many rows, what we did, why
```

Two pages, switched by the URL hash in `App.tsx` (no router): the story at `/`, and the chase-list tool (`Queue`) at `/#/tool`. A button after `Fix` opens the tool; the tool links back to that spot.

Hosting: the app is fully static. On Cloudflare (Pages or Workers static assets) or any static host, set the root directory to `web`, the build command to `npm run build`, and the output directory to `dist`. The JSON is committed, so the host does not need Python. To refresh the weekly list, rerun the pipeline, commit the JSON, and redeploy.

The pipeline is the single source of truth. Words that describe data (cleaning issues, fix labels, chase-list actions) live in `build_data.py`, not in the pages.

## Rules that keep it coherent

- **Numbers come from `story` / `queue` only.** Never type a figure into a component, including card text. Format with `lib/format.ts`. If a number is missing, add it to the pipeline and rerun.
- **Plain words.** A 13-year-old should follow each card. One idea per card, heading of 6 words or fewer, at most 2 short sentences and 2 rounded numbers. "Salesperson" not "rep", "typical" not "median", "unpaid bills" not "receivables", "profit" (defined once, early, as what stays after refunds). Keep IDs like R07 and C1173: they are what the reader acts on.
- **Big picture first, then arrows.** The first step of a chart shows everything with no arrows. Later steps dim the rest (about 35%) and switch on a `Callout` pointing at the one thing to look at. At most 2 callouts at once, 6 words per line. Arrow targets are computed from the chart's scales, never hand-typed.
- **Charts are hand-built SVG** with a `viewBox`; `d3-scale` / `d3-shape` for maths only; Motion (`motion/react`) for animation. No chart library.
- **Colours from tokens** in `index.css`: `--oak` money in, `--chrome` neutral, `--leak` losses and warnings, `--ok` fixed. A warning never relies on colour alone. The one exception is `WaterFlow.css`, which defines ink and paper colours sampled from the illustration.
- **Performance tiers.** `low` = no looping or scroll-linked animation (also used for "reduce motion"); `mid` = full 2D motion; `high` currently adds nothing (the 3D scene was removed with the bucket). Animate only transform and opacity, plus a few SVG attributes. Loops must stop off screen.
- **Each section owns its files** (`sections/<Name>.tsx` and `.css`). Keep the default export and the section `id`.
- Every SVG chart has `role="img"` and an `aria-label` that states the takeaway for the current step.

## The WaterFlow illustration

`web/src/assets/water.jpg` is a signed cartoon by Baysal that the team supplied. It is third-party artwork: get the artist's permission before using this beyond the hackathon demo, and keep the credit line under the chart.

The section draws on top of the picture in the picture's own pixel coordinates (660 x 506):
- The scene is widened by mirroring the left part of the image at x = 44, which adds a second thin figure under a second leak. The mirrored copy of the signature is covered with a strip of real floor texture; the original signature stays.
- The app's copy of the image has the three painted drips under the leak removed (covered with nearby wall texture), so they do not double up with the animated drops. The untouched original is `Guy_Who_Have_Lot_A_Water.jpg` at the repo root.
- Moving water is CSS only: dashed streaks clipped to the traced stream shape, and drops falling from the two leaks. Drop count scales with dollars. On `low` or off screen the streaks are hidden and the drops stand still.
- Profit is labelled on the armchair; sales on the pipe; discounts and refunds beside their leaks.
- The drawing carries the idea; the bar underneath carries the real proportions. Keep both.
- If the image is swapped, re-measure the constants at the top of `WaterFlow.tsx`.

## Checking your work

There are no frontend tests. Verify by looking:
- `npm run build` and `npx oxlint src` must be clean.
- Walk every scroll step at 1280x720 and at phone width, on `?quality=mid` and `?quality=low`.
- Check the browser console for errors.

## Known limits

- Phone width works, but text inside charts is small (about 7px in Returns, Receivables and WaterFlow). Cards carry the key numbers.
- Tier thresholds in `quality.tsx` are untuned guesses; test on the demo machine.
- "Today" is the last payment date in the data (2026-10-31). On live data, swap it for the real date in `build_data.py`.
- The what-if figures rest on stated assumptions (for example, that capped orders still close).
- `Hook.tsx` has one sentence that assumes the weakest 2026 quarter is the one where refunds jumped; recheck if the data changes.

## Not in git

`claudedesignskills/` and `threejs-skills/` are third-party reference repos, ignored on purpose. Read their `SKILL.md` files as documentation only; do not run their scripts or copy them into `web/`.

`PLAN.md` is the original build plan and is kept for history. Where it disagrees with this file (it still describes the bucket and the 3D scene), this file wins.
