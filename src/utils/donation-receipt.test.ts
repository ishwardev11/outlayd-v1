import { test } from "node:test"
import assert from "node:assert/strict"
import { amountInWords, buildReceiptContent, letterheadImageType, numberToWords, parseReceiptSettings, type ReceiptRecord } from "./donation-receipt"

test("letterhead image type comes from the file's bytes, not its name", () => {
    assert.equal(letterheadImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png")
    assert.equal(letterheadImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpeg")
    assert.equal(letterheadImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null)
    assert.equal(letterheadImageType(new TextEncoder().encode("%PDF-1.7")), null)
    assert.equal(letterheadImageType(new Uint8Array([0x89, 0x50])), null)
})

test("numbers in words", () => {
    assert.equal(numberToWords(0), "Zero")
    assert.equal(numberToWords(7), "Seven")
    assert.equal(numberToWords(15), "Fifteen")
    assert.equal(numberToWords(42), "Forty-Two")
    assert.equal(numberToWords(100), "One Hundred")
    assert.equal(numberToWords(120), "One Hundred Twenty")
    assert.equal(numberToWords(1005), "One Thousand Five")
    assert.equal(numberToWords(25000), "Twenty-Five Thousand")
    assert.equal(numberToWords(1234567), "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven")
    assert.throws(() => numberToWords(-1))
    assert.throws(() => numberToWords(1.5))
})

test("amounts in words, with the currency's own words", () => {
    assert.equal(amountInWords(120, "MYR"), "Ringgit Malaysia One Hundred Twenty Only")
    assert.equal(amountInWords(120.5, "MYR"), "Ringgit Malaysia One Hundred Twenty and Fifty Sen Only")
    assert.equal(amountInWords(0.05, "MYR"), "Ringgit Malaysia Zero and Five Sen Only")
    assert.equal(amountInWords(1000.01, "USD"), "US Dollars One Thousand and One Cents Only")
    assert.equal(amountInWords(75, "GBP"), "Pounds Sterling Seventy-Five Only")
    assert.equal(amountInWords(0.1 + 0.2, "SGD"), "Singapore Dollars Zero and Thirty Cents Only") // no floating-point drift
})

test("settings: a full, valid form", () => {
    const r = parseReceiptSettings({
        legal_name: " Persatuan Kebajikan Harapan ", address: "12 Jalan Damai\nKuala Lumpur", receipt_prefix: "PKH-", receipt_next_number: "101",
        signatories: [{ name: "Aminah Yusof", title: "Treasurer" }, { name: "", title: "" }], tax_exempt_receipts: true, tax_exempt_reference: "LHDN.01/35/42/51/179-6.5678",
    })
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.value.legal_name, "Persatuan Kebajikan Harapan")
    assert.equal(r.value.receipt_next_number, 101)
    assert.deepEqual(r.value.signatories, [{ name: "Aminah Yusof", title: "Treasurer" }]) // blank rows dropped
})

test("settings: problems get clear messages", () => {
    const base = { receipt_prefix: "RCP-", receipt_next_number: 1 }
    const err = (over: object) => { const r = parseReceiptSettings({ ...base, ...over }); return r.ok ? "" : r.error }
    assert.match(err({ receipt_next_number: 0 }), /whole number/)
    assert.match(err({ receipt_next_number: "1.5" }), /whole number/)
    assert.match(err({ receipt_prefix: "=CMD(" }), /prefix/)
    assert.match(err({ signatories: [{ title: "Treasurer" }] }), /needs a name/)
    assert.match(err({ signatories: [1, 2, 3, 4].map((i) => ({ name: `P${i}` })) }), /at most three/)
    assert.match(err({ tax_exempt_receipts: true, tax_exempt_reference: "" }), /approval reference/)
})

const receipt = (over: Partial<ReceiptRecord> = {}): ReceiptRecord => ({
    receipt_no: "RCP-7", issued_at: "2026-11-21T03:00:00Z", donation_date: "2026-11-20", donor_name: "Puan Aminah", amount: 120.5,
    details: { lines: [{ category: "General donations", fund: "General Fund", amount: 100 }, { category: "General donations", fund: "Building Fund", amount: 20.5 }], reference: "BANK-001" },
    tax_exempt: false, tax_exempt_reference: null, voided_at: null, void_reason: null, ...over,
})
const org = { name: "Harapan", legal_name: "Persatuan Kebajikan Harapan", address: "12 Jalan Damai\nKuala Lumpur", registration_id: "PPM-001", signatories: [{ name: "Aminah Yusof", title: "Treasurer" }], currency: "MYR" }

test("receipt content: letterhead, fields, words, purpose, signatory", () => {
    const c = buildReceiptContent(receipt(), org)
    assert.deepEqual(c.letterhead, ["Persatuan Kebajikan Harapan", "Harapan", "12 Jalan Damai", "Kuala Lumpur", "Registration no. PPM-001"])
    assert.deepEqual(c.fields[0], ["Receipt no.", "RCP-7"])
    assert.ok(c.fields.some(([k, v]) => k === "Reference" && v === "BANK-001"))
    assert.equal(c.amountWords, "Ringgit Malaysia One Hundred Twenty and Fifty Sen Only")
    assert.equal(c.amountFigure, "MYR 120.50")
    const anon = buildReceiptContent(receipt({ donor_name: "" }), org)
    assert.ok(anon.fields.some(([k, v]) => k === "Received from" && v === "Anonymous donor"))
    assert.equal(c.letterheadImage, null)
    assert.equal(buildReceiptContent(receipt(), { ...org, letterheadImage: "data:image/png;base64,AAAA" }).letterheadImage, "data:image/png;base64,AAAA")
    assert.equal(c.purpose, "Being a donation to: General Fund, Building Fund")
    assert.deepEqual(c.signatory, { name: "Aminah Yusof", title: "Treasurer" })
    assert.equal(c.taxStatement, null)
    assert.equal(c.void, null)
})

test("receipt content: tax statement only when it was on at issue; void shows the reason", () => {
    assert.match(buildReceiptContent(receipt({ tax_exempt: true, tax_exempt_reference: "LHDN-123" }), org).taxStatement ?? "", /Approval reference: LHDN-123/)
    assert.deepEqual(buildReceiptContent(receipt({ voided_at: "2026-11-22T01:00:00Z", void_reason: "Wrong donor name" }), org).void, { on: "2026-11-22", reason: "Wrong donor name" })
})
