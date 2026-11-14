---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: ["web/src/sections"]
---

# Surface brief: the story and the chase-list tool

Scope: the whole web app (story at `/`, tool page at `/#/tool`). Visitor mode: Read (the story) with an Operate tool page; one world for both.
Audience and job: hackathon judges watching a 5-minute live demo on a projector, reading as the CFO who asked "why is cash so tight?". Success: they follow every step in one pass, believe the numbers, and see the automation run.
Constraints: numbers only from the JSON; plain words; hand-built SVG charts; the Baysal cartoon keeps its own kraft colours and credit; works at 1280x720 and 390 wide; `?quality=low` stays motion-free.
Chosen direction: The Columnar Ledger (decision round, IMPECCABLE'S PICK, user-chosen). Memorable moment: the cartoon pasted into the books as a clipping, the leaks entered in red ink beside it.

## Direction contract

THESIS: The story is entered line by line in the company's own books: ruled ledger paper, figures in columns, losses in red ink, pencil notes in the margin. It refuses the dark fintech dashboard (slate, mono eyebrows, rounded stat tiles, pills) this category ships.

OWN-WORLD: Pale ledger-green paper with faint green rules and a red double margin rule; green-black ink for text; red ink only for losses and flags; deep ledger-green ink for fixes; pencil grey for notes. Libre Franklin for headings and prose with tabular figures; Courier Prime only for figures in ruled tables and the chase list. Square corners, 1px ruled borders, no shadows, no eyebrows, no pills: totals are ledger rows with a double underline, chase steps are stamp marks that print their name.

STORY: The reader opens the books, sees sales and profit split, watches the cartoon's leaks, follows three entries (discounts, refunds, late payers) to their fixes, and ends at the chase list that writes itself each Monday.

FIRST VIEWPORT: Ruled sheet edge to edge with the red double margin rule at the left; running head "Chrome & Oak · the books" and the period at the top; the CFO's question set large in Libre Franklin 800 across about two thirds of the width; one short lede; the scroll cue in pencil at the bottom. No card, no chip, no image above the fold.

FORM: The Columnar Ledger, position 1 on the ordered grounded list (shown as the pick; the roll assigned position 4). seed:dd88a5c6abf1dc07

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
