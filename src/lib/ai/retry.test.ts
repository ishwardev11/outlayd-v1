import { test } from "node:test"
import assert from "node:assert/strict"
import { isBusyError, safeErrorText } from "./retry"
import { AI_ASSIST_FEATURES, AI_GATE_MESSAGES } from "./messages"

test("busy answers (429, 503) are retried; other errors are not", () => {
    assert.equal(isBusyError({ status: 429 }), true)
    assert.equal(isBusyError({ response: { status: 503 } }), true)
    assert.equal(isBusyError(new Error("[503 Service Unavailable] The model is overloaded")), true)
    assert.equal(isBusyError(new Error("Request aborted")), false)
    assert.equal(isBusyError({ status: 400 }), false)
    assert.equal(isBusyError(null), false)
})

test("failures are logged as the error's name and message only, cut short", () => {
    const e = new TypeError("bad\n  input")
    assert.equal(safeErrorText(e), "TypeError: bad input")
    assert.equal(safeErrorText(new Error("x".repeat(1000))).length, "Error: ".length + 300)
    assert.equal(safeErrorText("just text"), "Error: ")
})

test("AI limits and plan gates give a friendly message, never an error", () => {
    assert.match(AI_GATE_MESSAGES.limit, /^AI limit reached for this month/)
    assert.match(AI_GATE_MESSAGES.plan, /Growth and Nonprofit/)
    for (const m of Object.values(AI_GATE_MESSAGES)) assert.match(m, /by hand/)
    assert.deepEqual([...AI_ASSIST_FEATURES], ["issued_invoice", "payment_slip", "categorise"])
})
