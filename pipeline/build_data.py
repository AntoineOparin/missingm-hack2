"""Clean the Chrome & Oak CSVs, run detections, write JSON for the web app.

Run from the repo root:  .venv/bin/python pipeline/build_data.py
Re-running it weekly IS the automation: it rebuilds the collections queue.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "ChromeAndOak_SalesFinance_Data"
OUT = ROOT / "web" / "src" / "data"

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


def main():
    o, c, r, log = clean()
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
    as_of = o.payment_date.max()  # shortcut: "today" = last payment in the data; swap for date.today() on live data

    def totals(d):
        return {"gross": r0(d.gross.sum()), "discounts": r0(d.gross.sum() - d.rev.sum()), "revenue": r0(d.rev.sum()),
                "cogs": r0(d.cogs.sum()), "grossProfit": r0(d.gm.sum()), "refunds": r0(d.refund.sum()),
                "profitAfterRefunds": r0(d.gm.sum() - d.refund.sum()), "orders": len(d),
                "discountRate": round(1 - d.rev.sum() / d.gross.sum(), 4), "marginPct": round(d.gm.sum() / d.rev.sum(), 4)}

    # Same nine months of each year, so the comparison is like for like.
    ytd = o[o.order_date.dt.month <= 9]
    yoy = {str(y): totals(d) for y, d in ytd.groupby("y")}
    yoy["change"] = {k: round(yoy["2026"][k] / yoy["2025"][k] - 1, 4)
                     for k in ["gross", "discounts", "revenue", "grossProfit", "refunds", "profitAfterRefunds"]}
    quarters = [{"q": q, **totals(d)} for q, d in o.groupby("q")]

    billed = o.groupby(o.order_date.dt.to_period("M").astype(str)).rev.sum()
    paid = o.dropna(subset=["payment_date"])
    collected = paid.groupby(paid.payment_date.dt.to_period("M").astype(str)).rev.sum()
    monthly = [{"month": m, "billed": r0(billed.get(m, 0)), "collected": r0(collected.get(m, 0))} for m in billed.index]

    # --- Detection 1: rep discount outlier vs peer median, per quarter
    reps_o = o[o.sales_rep.notna()]
    rq = reps_o.groupby(["sales_rep", "q"]).agg(gross=("gross", "sum"), rev=("rev", "sum"), gm=("gm", "sum")).reset_index()
    rq["discount"] = 1 - rq.rev / rq.gross
    rq["peerMedian"] = rq.groupby("q").discount.transform("median")
    rq["flag"] = rq.discount > PEER_MULTIPLE * rq.peerMedian
    below = reps_o[reps_o.gm < 0].groupby("sales_rep").size()
    reps = [{"rep": rep, "flagged": bool(d.flag.any()), "belowCostOrders": int(below.get(rep, 0)),
             "revenue": r0(d.rev.sum()),
             "quarters": [{"q": x.q, "discount": round(x.discount, 4), "marginPct": round(x.gm / x.rev, 4),
                           "revenue": r0(x.rev), "flag": bool(x.flag)} for x in d.itertuples()]}
            for rep, d in rq.groupby("sales_rep")]
    flagged_reps = [x["rep"] for x in reps if x["flagged"]]

    # Quarter-end pattern: discount by week of quarter (direct sales), with and without the flagged reps
    ds = o[o.sales_channel == "Direct Sales"].copy()
    ds["week"] = ((ds.order_date - ds.order_date.dt.to_period("Q").dt.start_time).dt.days // 7 + 1).clip(upper=13)
    ex = ds[~ds.sales_rep.isin(flagged_reps)]
    quarter_end = [{"week": int(w), "discount": round(1 - d.rev.sum() / d.gross.sum(), 4), "orders": len(d),
                    "discountExFlagged": round(1 - ex[ex.week == w].rev.sum() / ex[ex.week == w].gross.sum(), 4)}
                   for w, d in ds.groupby("week")]

    # --- Detection 2: below-cost orders
    bc = o[o.gm < 0]
    # --- Detection 3: return hot spots (product x reason share of all refunds)
    rr = r.merge(o[["order_id", "product", "segment", "q"]], on="order_id")
    cells = rr.groupby(["product", "reason"]).refund_amount.agg(["sum", "count"]).reset_index()
    total_refunds = cells["sum"].sum()
    returns = [{"product": x.product, "reason": x.reason, "refund": r0(x.sum), "count": int(x.count),
                "share": round(x.sum / total_refunds, 4), "flag": bool(x.sum / total_refunds > 0.10)}
               for x in cells.sort_values("sum", ascending=False).itertuples()]
    returns_q = [{"q": q, "refund": r0(d.refund_amount.sum())} for q, d in rr.groupby("q")]
    # Which customer segment drives each return reason (backs the "resellers send stock back" claim)
    seg = rr.groupby(["reason", "segment"]).refund_amount.sum()
    return_reasons = [{"reason": reason, "refund": r0(d.sum()), "topSegment": d.idxmax()[1],
                       "topSegmentShare": round(d.max() / d.sum(), 4)} for reason, d in seg.groupby(level=0)]
    rate = o.groupby("product").agg(rev=("rev", "sum"), refund=("refund", "sum"))
    return_rates = [{"product": p, "rate": round(x.refund / x.rev, 4)} for p, x in rate.iterrows()]

    # --- Detection 4: chronic late payers; Detection 5: credit-limit breach
    ar = o[o.terms > 0]
    open_inv = ar[ar.payment_date.isna()].copy()
    open_inv["daysOverdue"] = (as_of - open_inv.due).dt.days
    cust = ar.groupby("customer_id").agg(avgLate=("late", "mean"), pctLate=("late", lambda s: (s.dropna() > 0).mean()),
                                         invoices=("order_id", "count"), revenue=("rev", "sum"),
                                         segment=("segment", "first"), terms=("payment_terms", "first"),
                                         creditLimit=("credit_limit", "first"))
    cust["open"] = open_inv.groupby("customer_id").rev.sum().reindex(cust.index).fillna(0)
    cust["avgLate"] = cust.avgLate.fillna(0)
    cust["chronic"] = (cust.avgLate > CHRONIC_LATE_DAYS) & (cust.invoices >= 3)
    cust["overLimit"] = cust.open > cust.creditLimit
    watch = cust[cust.chronic | cust.overLimit | (cust.open > 0)].sort_values("avgLate", ascending=False)
    customers = [{"customer": i, "segment": x.segment, "terms": x.terms, "avgDaysLate": round(x.avgLate, 1),
                  "pctLate": round(x.pctLate, 3), "invoices": int(x.invoices), "revenue": r0(x.revenue),
                  "creditLimit": r0(x.creditLimit), "open": r0(x.open), "chronic": bool(x.chronic),
                  "overLimit": bool(x.overLimit)} for i, x in watch.iterrows()]
    hist = ar.dropna(subset=["late"]).assign(bin=lambda d: (d.late.clip(-10, 120) // 10 * 10).astype(int),
                                             chronic=lambda d: d.customer_id.map(cust.chronic))
    late_hist = [{"daysLate": int(b), "invoices": len(d), "chronicInvoices": int(d.chronic.sum()), "amount": r0(d.rev.sum())}
                 for b, d in hist.groupby("bin")]
    aging = [{"bucket": lab, "invoices": int(m.sum()), "amount": r0(open_inv[m].rev.sum())}
             for lab, m in [("Not yet due", open_inv.daysOverdue <= 0),
                            ("1-30 days", open_inv.daysOverdue.between(1, 30)),
                            ("31-60 days", open_inv.daysOverdue.between(31, 60)),
                            ("61-90 days", open_inv.daysOverdue.between(61, 90)),
                            ("90+ days", open_inv.daysOverdue > 90)]]

    # --- Automation: weekly collections queue
    def tier(days, chronic, over):
        if days > 60 or (over and days > 0):
            return "escalate", "Call them, and pause their new orders"
        if days > 30:
            return "firm", "Send a firm notice with the bill attached"
        if days > 0:
            return "reminder", "Send a friendly reminder"
        if chronic:
            return "pre-due", "Send a heads-up before it is due (they usually pay late)"
        return "none", "No action yet"

    queue = []
    for x in open_inv.itertuples():
        cu = cust.loc[x.customer_id]
        t, action = tier(x.daysOverdue, cu.chronic, cu.overLimit)
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
                      "overLimit": bool(cu.overLimit), "score": r0(score), "tier": t, "action": action,
                      "emailSubject": f"Invoice {x.order_id}: ${x.rev:,.2f} {when}",
                      "emailBody": f"Hello,\n\n{opener}\n\nInvoice: {x.order_id}\nAmount: ${x.rev:,.2f}\n"
                                   f"Terms: {x.payment_terms}\nDue date: {x.due:%B %d, %Y}\n\n"
                                   "If payment is already on its way, please disregard this note. Otherwise, reply "
                                   "with a payment date or any issue holding it up.\n\nThank you,\nChrome & Oak Finance"})
    queue.sort(key=lambda q: -q["score"])
    for i, q in enumerate(queue, 1):
        q["rank"] = i

    # --- Scenarios for the "plug the holes" toggles (Jan-Sep 2026)
    y26 = ytd[ytd.y == 2026]
    over_cap = y26[y26.discount > DISCOUNT_CAP]
    desk = rr[(rr["product"] == "ErgoLift Standing Desk") & (rr.reason == "Damaged in transit") & rr.q.str.startswith("2026")]
    overdue = open_inv[open_inv.daysOverdue > 0]
    scenarios = [
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

    detections = [
        {"id": "discountOutlier", "title": "Rep discounting far above peers",
         "rule": f"Rep's quarterly discount rate is more than {PEER_MULTIPLE}x the median rep's.",
         "hits": int(rq.flag.sum()), "who": flagged_reps},
        {"id": "belowCost", "title": "Orders sold below cost",
         "rule": "Discounted price is lower than unit cost.", "hits": len(bc), "impact": r0(bc.gm.sum()),
         "who": bc.sales_rep.dropna().value_counts().index.tolist()},
        {"id": "returnHotspot", "title": "Return hot spot",
         "rule": "One product-and-reason pair causes more than 10% of all refunds.",
         "hits": sum(x["flag"] for x in returns), "who": [f'{x["product"]}: {x["reason"]}' for x in returns if x["flag"]]},
        {"id": "chronicLate", "title": "Chronic late payers",
         "rule": f"Customer averages more than {CHRONIC_LATE_DAYS} days past terms over 3+ invoices.",
         "hits": int(cust.chronic.sum()), "who": cust[cust.chronic].sort_values("avgLate", ascending=False).index[:6].tolist()},
        {"id": "creditBreach", "title": "Over credit limit",
         "rule": "Open unpaid balance exceeds the customer's credit limit.",
         "hits": int(cust.overLimit.sum()), "who": cust[cust.overLimit].index.tolist()},
    ]

    story = {
        "meta": {"asOf": f"{as_of:%Y-%m-%d}", "comparison": "January to September, 2025 vs 2026",
                 "rawOrders": int(pd.read_csv(DATA / "orders.csv").shape[0]), "cleanOrders": len(o), "cleaning": log},
        "yoy": yoy, "quarters": quarters, "monthly": monthly,
        "reps": reps, "quarterEnd": quarter_end,
        "returns": returns, "returnsByQuarter": returns_q, "returnRates": return_rates, "returnReasons": return_reasons,
        "receivables": {"openTotal": r0(open_inv.rev.sum()), "openInvoices": len(open_inv),
                        "overdueTotal": r0(overdue.rev.sum()), "overdueInvoices": len(overdue),
                        "aging": aging, "customers": customers, "lateHistogram": late_hist},
        "scenarios": scenarios, "detections": detections,
    }

    # Self-check: the headline the whole story rests on.
    ch = yoy["change"]
    assert 0.30 < ch["revenue"] < 0.36, ch
    assert ch["profitAfterRefunds"] < ch["revenue"] / 2, ch
    assert story["receivables"]["openTotal"] == sum(a["amount"] for a in aging) or abs(
        story["receivables"]["openTotal"] - sum(a["amount"] for a in aging)) <= len(aging)
    assert queue and queue[0]["score"] >= queue[-1]["score"]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "story.json").write_text(json.dumps(story, indent=1))
    (OUT / "queue.json").write_text(json.dumps(queue, indent=1))
    print(f"story.json + queue.json written to {OUT}")
    print(f"revenue {ch['revenue']:+.0%}, profit after refunds {ch['profitAfterRefunds']:+.0%}, "
          f"flagged reps {flagged_reps}, queue {len(queue)} invoices")


if __name__ == "__main__":
    main()
