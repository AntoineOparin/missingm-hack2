"""Clean the Chrome & Oak CSVs, run detections, write JSON for the web app.

Run from the repo root:  .venv/bin/python pipeline/build_data.py [--as-of YYYY-MM-DD]

This run IS the automation. Trigger: a weekly schedule, or new data being pushed
(.github/workflows/chase-bills.yml). Action: every unpaid bill that reached a new step
gets its email written to outbox/ and logged in activity.json, once per step.
"""
import argparse
import json
from email.message import EmailMessage
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ChromeAndOak_SalesFinance_Data"
OUT = ROOT / "web" / "src" / "data"
ACTIVITY = OUT / "activity.json"   # what the automation did on each run; also its memory of what was already sent
OUTBOX = ROOT / "outbox"           # the emails themselves, one .eml file each

PRODUCTS = ['Monitor 24"', 'Monitor 27"', "Mechanical Keyboard", "USB-C Dock", "ErgoLift Standing Desk",
            "Wireless Mouse", "Webcam HD", "Laptop Stand", "Office Chair", "Desk Lamp"]
PRODUCT_ALIASES = {"24in monitor": 'Monitor 24"', "monitor 24": 'Monitor 24"', "27in monitor": 'Monitor 27"',
                   "monitor 27": 'Monitor 27"', "mech keyboard": "Mechanical Keyboard", "usb c dock": "USB-C Dock",
                   "ergolift desk": "ErgoLift Standing Desk", **{p.lower(): p for p in PRODUCTS}}
REGION_ALIASES = {"on": "Ontario", "ontario": "Ontario", "qc": "Quebec", "québec": "Quebec", "quebec": "Quebec",
                  "atl": "Atlantic", "atlantic": "Atlantic", "b.c.": "BC", "british columbia": "BC", "bc": "BC",
                  "prairies": "Prairies"}
DISCOUNT_CAP = 0.15        # scenario: max discount without approval
PEER_MULTIPLE = 1.5        # detection: rep discount > 1.5x peer median
CHRONIC_LATE_DAYS = 10     # detection: avg days past terms
HOTSPOT_SHARE = 0.10       # detection: product x reason share of all refunds


def r0(x):
    return round(float(x))


def clean():
    o = pd.read_csv(DATA / "orders.csv")
    c = pd.read_csv(DATA / "customers.csv")
    r = pd.read_csv(DATA / "returns.csv")
    log = []

    def note(issue, count, fix, why):
        log.append({"issue": issue, "count": int(count), "fix": fix, "why": why})

    n = len(o)
    o = o.drop_duplicates()
    note("Same order listed twice", n - len(o), "Removed the copy",
         "Counting an order twice makes sales look bigger than they are.")

    iso = pd.to_datetime(o.order_date, format="%Y-%m-%d", errors="coerce")
    note("Dates written a different way", iso.isna().sum(), "Put all dates in one format",
         "Mixed dates break every chart over time, and every due date.")
    o["order_date"] = pd.to_datetime(o.order_date, format="mixed")
    o["payment_date"] = pd.to_datetime(o.payment_date, format="mixed")

    pct = o.discount > 1
    note("Discounts typed as whole numbers", pct.sum(), "Divided by 100",
         "Left alone, a small discount looks bigger than the sale itself.")
    o.loc[pct, "discount"] /= 100

    key = o["product"].str.lower().str.strip()
    note("One product, many spellings", (o["product"] != key.map(PRODUCT_ALIASES)).sum(), "Mapped 22 spellings to 10 products",
         "One product's sales and refunds were split across several names.")
    o["product"] = key.map(PRODUCT_ALIASES)
    key = o.region.str.lower().str.strip()
    note("One region, many spellings", (o.region != key.map(REGION_ALIASES)).sum(), "Mapped 15 spellings to 5 regions",
         "'ON', 'ontario' and 'Ontario' are the same place.")
    o["region"] = key.map(REGION_ALIASES)

    note("Cost missing on some orders", o.unit_cost.isna().sum(), "Filled in with that product's usual cost",
         "Each product's cost barely changes, so its usual cost is a safe guess.")
    o["unit_cost"] = o.unit_cost.fillna(o.groupby("product").unit_cost.transform("median"))

    neg = o.quantity <= 0
    note("Orders with a negative amount", neg.sum(), "Left out",
         "Most likely typos. Refunds are counted on their own.")
    o = o[~neg].copy()

    note("No payment date", o.payment_date.isna().sum(), "Kept as they are",
         "Not a mistake: these are the unpaid bills you are chasing.")

    assert o["product"].notna().all() and o.region.notna().all(), "unmapped product or region"
    assert o.discount.between(0, 1).all() and o.order_id.is_unique
    return o, c, r, log


# Each detection returns its flags plus the summary entry the story shows under `detections`.

def detect_discount_outliers(o):
    """Detection 1: a rep's quarterly discount is more than PEER_MULTIPLE x the median rep's that quarter."""
    rq = (o[o.sales_rep.notna()].groupby(["sales_rep", "q"])
          .agg(gross=("gross", "sum"), rev=("rev", "sum"), gm=("gm", "sum")).reset_index())
    rq["discount"] = 1 - rq.rev / rq.gross
    rq["peerMedian"] = rq.groupby("q").discount.transform("median")
    rq["flag"] = rq.discount > PEER_MULTIPLE * rq.peerMedian
    return rq, {"id": "discountOutlier", "title": "Salesperson discounting far above the rest",
                "rule": f"A salesperson's discount is more than {PEER_MULTIPLE}x the typical salesperson's that quarter.",
                "hits": int(rq.flag.sum()), "who": sorted(rq[rq.flag].sales_rep.unique())}


def detect_return_hotspots(rr):
    """Detection 2: one product-and-reason pair causes more than HOTSPOT_SHARE of all refunds."""
    cells = rr.groupby(["product", "reason"]).refund_amount.agg(["sum", "count"]).reset_index()
    total_refunds = cells["sum"].sum()
    returns = [{"product": x.product, "reason": x.reason, "refund": r0(x.sum), "count": int(x.count),
                "share": round(x.sum / total_refunds, 4), "flag": bool(x.sum / total_refunds > HOTSPOT_SHARE)}
               for x in cells.sort_values("sum", ascending=False).itertuples()]
    return returns, {"id": "returnHotspot", "title": "One product and reason behind too many refunds",
                     "rule": f"One product and one reason are behind more than {HOTSPOT_SHARE:.0%} of all refunds.",
                     "hits": sum(x["flag"] for x in returns),
                     "who": [f'{x["product"]}: {x["reason"]}' for x in returns if x["flag"]]}


def customer_payment_stats(ar, open_inv):
    """Per-customer payment history on invoiced (non-prepaid) orders; input to detection 3."""
    cust = ar.groupby("customer_id").agg(avgLate=("late", "mean"), invoices=("order_id", "count"))
    cust["open"] = open_inv.groupby("customer_id").rev.sum().reindex(cust.index).fillna(0)
    cust["avgLate"] = cust.avgLate.fillna(0)
    return cust


def detect_late_payers(cust):
    """Detection 3: customer averages more than CHRONIC_LATE_DAYS past terms over 3+ invoices."""
    chronic = (cust.avgLate > CHRONIC_LATE_DAYS) & (cust.invoices >= 3)
    return chronic, {"id": "chronicLate", "title": "Customers who always pay late",
                     "rule": f"A customer pays more than {CHRONIC_LATE_DAYS} days after the due date on average.",
                     "hits": int(chronic.sum()),
                     "who": cust[chronic].sort_values("avgLate", ascending=False).index[:6].tolist()}


def enrich_orders(o, c, r):
    """Join customer terms onto orders and add the money, timing and period columns everything else uses."""
    o = o.merge(c[["customer_id", "segment", "payment_terms", "credit_limit"]], on="customer_id", how="left")
    o["gross"] = o.quantity * o.unit_price
    o["rev"] = o.gross * (1 - o.discount)
    o["cogs"] = o.quantity * o.unit_cost
    o["gm"] = o.rev - o.cogs
    o["terms"] = o.payment_terms.str.extract(r"(\d+)")[0].astype(float).fillna(0)
    o["due"] = o.order_date + pd.to_timedelta(o.terms, "D")
    o["late"] = (o.payment_date - o.order_date).dt.days - o.terms
    o["refund"] = o.order_id.map(r.groupby("order_id").refund_amount.sum()).fillna(0)
    o["y"] = o.order_date.dt.year
    o["q"] = o.order_date.dt.to_period("Q").astype(str)
    return o


def unpaid_invoices(o, as_of):
    """Invoiced (non-prepaid) orders, and the ones still unpaid with days past due as of `as_of`."""
    ar = o[o.terms > 0]
    open_inv = ar[ar.payment_date.isna()].copy()
    open_inv["daysOverdue"] = (as_of - open_inv.due).dt.days
    return ar, open_inv


def totals(d):
    return {"gross": r0(d.gross.sum()), "discounts": r0(d.gross.sum() - d.rev.sum()), "revenue": r0(d.rev.sum()),
            "cogs": r0(d.cogs.sum()), "grossProfit": r0(d.gm.sum()), "refunds": r0(d.refund.sum()),
            "profitAfterRefunds": r0(d.gm.sum() - d.refund.sum()), "orders": len(d),
            "discountRate": round(1 - d.rev.sum() / d.gross.sum(), 4), "marginPct": round(d.gm.sum() / d.rev.sum(), 4)}


def ytd(o):
    # Same nine months of each year, so the comparison is like for like.
    return o[o.order_date.dt.month <= 9]


def headline_charts(o):
    """Jan-Sep 2025 vs 2026 totals, and per-quarter totals."""
    yoy = {str(y): totals(d) for y, d in ytd(o).groupby("y")}
    yoy["change"] = {k: round(yoy["2026"][k] / yoy["2025"][k] - 1, 4)
                     for k in ["gross", "discounts", "revenue", "grossProfit", "refunds", "profitAfterRefunds"]}
    quarters = [{"q": q, **totals(d)} for q, d in o.groupby("q")]
    return yoy, quarters


def discount_charts(rq):
    """Per-salesperson discount and money kept per sale, by quarter."""
    return [{"rep": rep, "flagged": bool(d.flag.any()), "revenue": r0(d.rev.sum()),
             "quarters": [{"q": x.q, "discount": round(x.discount, 4), "marginPct": round(x.gm / x.rev, 4),
                           "revenue": r0(x.rev), "flag": bool(x.flag)} for x in d.itertuples()]}
            for rep, d in rq.groupby("sales_rep")]


def receivables_charts(ar, open_inv, cust):
    """Unpaid-bill totals, the customers who always pay late, and the how-late histogram."""
    overdue = open_inv[open_inv.daysOverdue > 0]
    watch = cust[cust.chronic | (cust.open > 0)].sort_values("avgLate", ascending=False)
    customers = [{"customer": i, "avgDaysLate": round(x.avgLate, 1), "open": r0(x.open), "chronic": bool(x.chronic)}
                 for i, x in watch.iterrows()]
    hist = ar.dropna(subset=["late"]).assign(bin=lambda d: (d.late.clip(-10, 120) // 10 * 10).astype(int),
                                             chronic=lambda d: d.customer_id.map(cust.chronic))
    late_hist = [{"daysLate": int(b), "invoices": len(d), "chronicInvoices": int(d.chronic.sum())}
                 for b, d in hist.groupby("bin")]
    return {"openTotal": r0(open_inv.rev.sum()), "openInvoices": len(open_inv), "overdueTotal": r0(overdue.rev.sum()),
            "customers": customers, "lateHistogram": late_hist}


# --- Automation: weekly collections queue
def queue_tier(days, chronic):
    if days > 60:
        return "escalate", "Call them, and pause their new orders"
    if days > 30:
        return "firm", "Send a firm notice with the bill attached"
    if days > 0:
        return "reminder", "Send a friendly reminder"
    if chronic:
        return "pre-due", "Send a heads-up before it is due (they usually pay late)"
    return "none", "No action yet"


def build_queue(open_inv, cust):
    """Every unpaid bill that needs action, ranked, with a drafted email."""
    queue = []
    for x in open_inv.itertuples():
        cu = cust.loc[x.customer_id]
        t, action = queue_tier(x.daysOverdue, cu.chronic)
        if t == "none":
            continue
        # Priority: dollars at stake, scaled up by how overdue it is and how late this customer usually pays.
        score = x.rev * (1 + max(x.daysOverdue, 0) / 30) * (1 + max(cu.avgLate, 0) / 30)
        when = f"{x.daysOverdue} days past due" if x.daysOverdue > 0 else f"due on {x.due:%b %d, %Y}"
        opener = {"pre-due": "A quick heads-up that the invoice below is coming due.",
                  "reminder": "This is a friendly reminder that the invoice below is now past due.",
                  "firm": "Our records show the invoice below remains unpaid well past its due date.",
                  "escalate": "The invoice below is seriously overdue. New orders are on hold until it is settled."}[t]
        queue.append({"orderId": x.order_id, "customer": x.customer_id, "segment": x.segment, "terms": x.payment_terms,
                      "amount": r0(x.rev), "orderDate": f"{x.order_date:%Y-%m-%d}", "dueDate": f"{x.due:%Y-%m-%d}",
                      "daysOverdue": int(x.daysOverdue), "customerAvgDaysLate": round(cu.avgLate, 1),
                      "score": r0(score), "tier": t, "action": action,
                      "emailSubject": f"Invoice {x.order_id}: ${x.rev:,.2f} {when}",
                      "emailBody": f"Hello,\n\n{opener}\n\nInvoice: {x.order_id}\nAmount: ${x.rev:,.2f}\n"
                                   f"Terms: {x.payment_terms}\nDue date: {x.due:%B %d, %Y}\n\n"
                                   "If payment is already on its way, please disregard this note. Otherwise, reply "
                                   "with a payment date or any issue holding it up.\n\nThank you,\nChrome & Oak Finance"})
    queue.sort(key=lambda q: -q["score"])
    for i, q in enumerate(queue, 1):
        q["rank"] = i
    return queue


def build_scenarios(o, rr, open_inv):
    """What-if numbers for the "plug the holes" toggles (Jan-Sep 2026)."""
    y26 = ytd(o)[lambda d: d.y == 2026]
    over_cap = y26[y26.discount > DISCOUNT_CAP]
    desk = rr[(rr["product"] == "ErgoLift Standing Desk") & (rr.reason == "Damaged in transit") & rr.q.str.startswith("2026")]
    overdue = open_inv[open_inv.daysOverdue > 0]
    return [
        {"id": "discountCap", "label": f"Cap discounts at {DISCOUNT_CAP:.0%}", "kind": "profit",
         "recovered": r0((over_cap.gross * (over_cap.discount - DISCOUNT_CAP)).sum()),
         "assumption": "If the same orders still sell at the lower discount."},
        {"id": "deskShipping", "label": "Stop desks arriving damaged", "kind": "profit",
         "recovered": r0(desk.refund_amount.sum()),
         "assumption": "If better boxes or a new carrier stop all the damage."},
        {"id": "collectOnTerms", "label": "Collect past-due bills", "kind": "cash",
         "recovered": r0(overdue.rev.sum()),
         "assumption": "Cash you get once. It is not extra profit."},
    ]


def send_new_emails(queue, as_of):
    """The automated action. Email each bill whose current step has not been emailed yet, and log the run.

    A bill is emailed once per step (heads-up, reminder, firm notice, call now), so re-running changes nothing
    until a bill moves to the next step. A bill that gets paid leaves the queue and is never chased again.
    """
    runs = json.loads(ACTIVITY.read_text()) if ACTIVITY.exists() else []
    sent = {(a["orderId"], a["tier"]): run["date"] for run in runs for a in run["actions"]}
    day = f"{as_of:%Y-%m-%d}"
    new = [q for q in queue if (q["orderId"], q["tier"]) not in sent]
    if new:
        folder = OUTBOX / day
        folder.mkdir(parents=True, exist_ok=True)
        for q in new:
            msg = EmailMessage()
            msg["From"] = "Chrome & Oak Finance <finance@chromeandoak.example>"
            msg["To"] = f"accounts-payable@{q['customer'].lower()}.example"  # shortcut: no real addresses in the data
            msg["Subject"] = q["emailSubject"]
            msg.set_content(q["emailBody"], cte="7bit")
            (folder / f"{q['orderId']}-{q['tier']}.eml").write_bytes(bytes(msg))
            sent[(q["orderId"], q["tier"])] = day
        runs.append({"date": day, "actions": [{k: q[k] for k in ("orderId", "customer", "amount", "tier")} for q in new]})
        ACTIVITY.write_text(json.dumps(runs, indent=1))
    for q in queue:
        q["sentOn"] = sent[(q["orderId"], q["tier"])]
    return new


def check(story, queue):
    """Self-check: the headline the whole story rests on."""
    ch = story["yoy"]["change"]
    rec = story["receivables"]
    assert 0.30 < ch["revenue"] < 0.36, ch
    assert ch["profitAfterRefunds"] < ch["revenue"] / 2, ch
    assert 0 < rec["overdueTotal"] <= rec["openTotal"]
    assert len(story["detections"]) == 3 and all(d["hits"] > 0 for d in story["detections"])
    assert queue and queue[0]["score"] >= queue[-1]["score"]


def main():
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--as-of", help="run as if today were this date (YYYY-MM-DD); default: the last payment in the data")
    args = args.parse_args()
    o, c, r, log = clean()
    o = enrich_orders(o, c, r)
    # shortcut: "today" = last payment in the data; on live data pass --as-of with the real date
    as_of = pd.Timestamp(args.as_of) if args.as_of else o.payment_date.max()
    rr = r.merge(o[["order_id", "product", "segment", "q"]], on="order_id")
    ar, open_inv = unpaid_invoices(o, as_of)

    rq, discount_outlier = detect_discount_outliers(o)
    returns, return_hotspot = detect_return_hotspots(rr)
    cust = customer_payment_stats(ar, open_inv)
    cust["chronic"], chronic_late = detect_late_payers(cust)
    flagged_reps = discount_outlier["who"]

    yoy, quarters = headline_charts(o)
    queue = build_queue(open_inv, cust)

    story = {
        "meta": {"asOf": f"{as_of:%Y-%m-%d}", "comparison": "January to September, 2025 vs 2026",
                 "rawOrders": int(pd.read_csv(DATA / "orders.csv").shape[0]), "cleanOrders": len(o), "cleaning": log},
        "yoy": yoy, "quarters": quarters,
        "reps": discount_charts(rq),
        "returns": returns,
        "receivables": receivables_charts(ar, open_inv, cust),
        "scenarios": build_scenarios(o, rr, open_inv),
        "detections": [discount_outlier, return_hotspot, chronic_late],
    }
    check(story, queue)

    OUT.mkdir(parents=True, exist_ok=True)
    new = send_new_emails(queue, as_of)
    assert all(q["sentOn"] for q in queue)
    (OUT / "story.json").write_text(json.dumps(story, indent=1))
    (OUT / "queue.json").write_text(json.dumps(queue, indent=1))
    ch = yoy["change"]
    print(f"story.json + queue.json written to {OUT}")
    print(f"revenue {ch['revenue']:+.0%}, profit after refunds {ch['profitAfterRefunds']:+.0%}, "
          f"flagged reps {flagged_reps}, queue {len(queue)} invoices")
    print(f"automation, as of {as_of:%Y-%m-%d}: {len(new)} new emails written to {OUTBOX.name}/, "
          f"{len(queue) - len(new)} bills already emailed at their current step")


if __name__ == "__main__":
    main()
