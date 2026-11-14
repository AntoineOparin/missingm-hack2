# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hackathon judges (Hack 2 the Future 2026, business track, option B: Sales & Finance) watching a 5-minute live demo, presented by the team on a laptop/projector. They score the reasoning, so every chart must make its point fast and be easy to follow while someone talks over it.

In-story role: the reader the story addresses is the CFO / business owner of Chrome & Oak, who asked "Revenue is growing, so why is cash so tight?". Judges read the site as that person would. Copy speaks to a busy business owner, not an analyst.

## Product Purpose

A scroll-driven web story that answers the CFO's question from the company's own sales, returns and customer data: revenue is up about a third, but profit after refunds barely moved. Exactly three insights, each with one chart, one detection rule and one action:

1. One salesperson (R07) gives about 3x the typical discount. Rule: discount more than 1.5x the typical salesperson's that quarter. Action: discounts above the cap need a manager's OK.
2. One desk damaged in shipping is 45% of refund dollars. Rule: one product and reason behind more than 10% of refunds. Action: fix the packing or the carrier.
3. A few customers always pay late. Rule: pays more than 10 days after the due date on average. Action: the automation chases them.

It ends in a working automation (30 of 100 judging points): a scheduled job that emails every unpaid bill reaching a new chase step and logs what it sent, shown on a tool page.

Success: the judges follow the story in one pass, believe the numbers, and see that the automation really runs, not a mockup.

## Positioning

Every figure is computed from the supplied dataset by a cleaning-and-detection pipeline (`pipeline/build_data.py`) and shown with the rule that found it; the data cleaning itself is shown as an appendix. The story ends in something that already acts on Monday (the chase automation), not only charts. Scope is deliberately the brief's minimum, each part finished: never more than 3 insights, charts or rules.

## Operating Context

- Presented live, scrolled by a presenter, at about 1280x720; must also work at phone width.
- Two pages, switched by URL hash: the story at `/`, the tool page at `/#/tool` (who to chase this week, what the automation sent and when, ready-to-send emails).
- Fully static site (Vite + React + TypeScript); JSON data is committed, rebuilt by rerunning the Python pipeline.
- Automation trigger: `.github/workflows/chase-bills.yml` runs the pipeline every Monday, on new data pushed to `ChromeAndOak_SalesFinance_Data/`, and on demand with an optional date. Chase steps: heads-up, friendly reminder, firm notice, call now; each bill is emailed once per step, written as `.eml` files to `outbox/<date>/`, and logged in `web/src/data/activity.json`.
- Live demo of "one week later": `.venv/bin/python pipeline/build_data.py --as-of 2026-11-07` sends only bills that moved to a new step.
- Performance tiers (`?quality=low|mid|high`) because the demo machine is unknown.

## Capabilities and Constraints

- Numbers come only from `web/src/data/story.json` and `queue.json`; never typed into components.
- Charts are hand-built SVG (d3-scale/d3-shape for maths only, Motion for animation); no chart library.
- Plain words: a 13-year-old should follow each card. One idea per card, heading of 6 words or fewer, at most 2 short sentences and 2 rounded numbers. IDs like R07 and C1173 stay, because they are what the reader acts on.
- Each insight section has exactly four scroll steps: the whole picture, an arrow on the thing to look at, why it matters or what to do, and the rule that catches it. Hook and WaterFlow frame the problem; Fix prices the three actions in dollars.
- Big picture first: a chart's first step shows everything; later steps dim the rest and point with a `Callout` arrow.
- Emails are files, not delivered: the data has no customer addresses. Do not imply they reach real inboxes.
- Accessibility: every SVG chart has `role="img"` and an `aria-label` stating the takeaway; warnings never rely on colour alone; `low` tier doubles as reduced motion.
- Lifespan: built for the demo day only; no plans beyond it.

## Brand Commitments

Chrome & Oak is a fictional company from the hackathon dataset. No logo, palette or voice guidelines exist to preserve.

## Evidence on Hand

- Dataset: `ChromeAndOak_SalesFinance_Data/` (orders, customers, returns CSVs; dirty on purpose).
- Derived data: `web/src/data/story.json`, `web/src/data/queue.json`, `web/src/data/activity.json` (automation run log).
- Illustration: `web/src/assets/water.jpg`, a signed third-party cartoon by Baysal supplied by the team; keep the credit line, and get permission before any use beyond the demo.
- No real customers, testimonials or outcomes exist; do not invent any.

## Product Principles

1. The judge follows it live: each step makes one point that reads in seconds while someone talks.
2. Every number is traceable to the data and the rule that produced it.
3. Plain language over finance jargon.
4. End in action: the story leads to an automation that really runs and shows what it did.
5. The minimum, done well: three of everything, each finished; never add a fourth.
6. Honest about assumptions and limits (what-if figures state their assumptions).

## Accessibility & Inclusion

SVG charts carry takeaway `aria-label`s; colour is never the only signal; reduced-motion users get the `low` tier with the full story.
