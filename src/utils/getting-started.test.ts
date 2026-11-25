import { test } from "node:test"
import assert from "node:assert/strict"
import { gettingStartedSteps } from "./getting-started"

const none = { documents: 0, approvedDocuments: 0, members: 1, openingComplete: false, moneyIn: 0, reconciliations: 0 }

test("a free organisation gets the two steps it can do", () => {
    const s = gettingStartedSteps(none, false)
    assert.deepEqual(s.map((x) => x.key), ["upload", "approve"])
    assert.ok(s.every((x) => !x.done))
})

test("a paid organisation gets the full list, ticked off from its records", () => {
    const s = gettingStartedSteps({ ...none, documents: 3, approvedDocuments: 1, openingComplete: true, members: 2 }, true)
    assert.deepEqual(s.map((x) => x.key), ["upload", "approve", "money_in", "opening", "reconcile", "team"])
    assert.deepEqual(s.filter((x) => x.done).map((x) => x.key), ["upload", "approve", "opening", "team"])
})

test("uploading alone does not count as approving", () => {
    const s = gettingStartedSteps({ ...none, documents: 1 }, false)
    assert.deepEqual(s.map((x) => x.done), [true, false])
})
