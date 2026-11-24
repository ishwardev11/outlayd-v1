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
