import { test } from "node:test"
import assert from "node:assert/strict"
import nextConfig from "../../next.config"

// Every page moved by the simplification plan keeps a permanent redirect (Next.js passes the query
// string on, so /reconciliations?month=2026-10-31 lands on /bank?tab=reconciliation&month=2026-10-31)
test("moved pages redirect permanently to their new place", async () => {
    const redirects = await nextConfig.redirects!()
    const map = Object.fromEntries(redirects.map((r) => [r.source, { destination: r.destination, permanent: "permanent" in r ? r.permanent : false }]))
    assert.deepEqual(map["/bank-statements"], { destination: "/bank", permanent: true })
    assert.deepEqual(map["/bank-statements/:id"], { destination: "/bank/:id", permanent: true })
    assert.deepEqual(map["/reconciliations"], { destination: "/bank?tab=reconciliation", permanent: true })
})

// The Ledger was split (step 4). Rules on the same address are tried in order, so the query-specific
// ones must come before the plain /ledger.
test("old Ledger addresses go to the Inbox, Transactions or Bills & Invoices", async () => {
    const redirects = (await nextConfig.redirects!()).filter((r) => r.source === "/ledger")
    const rules = redirects.map((r) => ({
        when: (r.has ?? []).map((h) => `${h.key}=${"value" in h ? h.value : ""}`).join("&") || "(any)",
        to: r.destination,
        permanent: "permanent" in r ? r.permanent : false,
    }))
    assert.deepEqual(rules, [
        { when: "view=cash", to: "/transactions", permanent: true },
        { when: "status=needs_review", to: "/inbox", permanent: true },
        { when: "status=awaiting_payment", to: "/invoices?status=unpaid", permanent: true },
        { when: "status=paid", to: "/transactions?type=money_out", permanent: true },
        { when: "(any)", to: "/inbox", permanent: true },
    ])
})

test("the old Settings > Year end tab goes to the Year end hub", async () => {
    const r = (await nextConfig.redirects!()).find((x) => x.source === "/settings")!
    assert.deepEqual([r.has, r.destination, "permanent" in r ? r.permanent : false],
        [[{ type: "query", key: "tab", value: "year-end" }], "/reports/year-end", true])
})

test("Assets & Loans moved into Settings; the General tab opens the profile's Account window", async () => {
    const redirects = await nextConfig.redirects!()
    const assets = redirects.find((r) => r.source === "/assets")!
    assert.deepEqual([assets.destination, "permanent" in assets ? assets.permanent : false], ["/settings?tab=assets", true])
    const general = redirects.find((r) => r.source === "/settings" && r.has?.some((h) => h.key === "tab" && "value" in h && h.value === "general"))!
    assert.deepEqual([general.destination, "permanent" in general ? general.permanent : false], ["/settings?tab=organization&account=1", true])
})

// The old query is passed on, and the destination's own keys win. So a rule that sends a path back to
// itself must overwrite the key it matched on, or the browser loops forever (it did for ?tab=general).
test("no redirect sends a page back to itself", async () => {
    for (const r of await nextConfig.redirects!()) {
        const [path, query = ""] = r.destination.split("?")
        if (path !== r.source) continue
        const dest = new URLSearchParams(query)
        const matched = (r.has ?? []).flatMap((h) => (h.type === "query" ? [{ key: h.key, value: h.value }] : []))
        assert.ok(matched.length > 0, `${r.source} redirects to itself unconditionally`)
        assert.ok(
            matched.some((h) => dest.has(h.key) && dest.get(h.key) !== h.value),
            `${r.source} ?${matched.map((h) => h.key).join("&")} would redirect to itself again`
        )
    }
})
