import { test } from "node:test"
import assert from "node:assert/strict"
import { FREE_PLAN_ACCESS, type PlanFeature } from "./plan"
import { PLAN_COMPARISON } from "./plan-comparison"

test("the comparison never promises the Free plan more than the app allows", () => {
    for (const row of PLAN_COMPARISON) {
        for (const g of row.gates) {
            if (FREE_PLAN_ACCESS[g] !== "full") assert.notEqual(row.freeLevel, "full", `${row.feature}: ${g} is not fully free`)
            if (FREE_PLAN_ACCESS[g] === "none") assert.match(row.free, /^(No|Sample preview)$/, `${row.feature}: ${g} is not available on Free`)
        }
        if (row.freeLevel === "full") assert.equal(row.free, "Yes", row.feature)
        if (row.freeLevel === "none") assert.equal(row.free, "No", row.feature)
        assert.ok(row.paid.length > 0 && row.paid !== "No", `${row.feature}: everything is on the paid plans`)
    }
})

test("every plan rule appears in the comparison", () => {
    const covered = new Set(PLAN_COMPARISON.flatMap((r) => r.gates))
    for (const f of Object.keys(FREE_PLAN_ACCESS) as PlanFeature[]) assert.ok(covered.has(f), `${f} missing from the comparison`)
})
