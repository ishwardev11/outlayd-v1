// Test documents for the accounting export. The "...before-remarks.csv" files next to this one are
// what the export produced for these documents before the Remarks column was added.
export const lookups = {
    funds: new Map([["f1", { name: "Building Fund" }], ["f2", { name: "Grant Y" }]]),
    categories: new Map([["c1", { name: "Rent", account_code: "6100" }], ["c2", { name: "Printing", account_code: null }]]),
}
const base = { due_date: null, paid_date: "2026-11-02", document_type: "invoice", status: "paid", fund_id: "f1", category_id: "c1", splits: null, invoice_number: "INV-1", reference_number: null, original_currency: null, original_amount: null, exchange_rate: null, notes: "AI Extraction Error: secret" }
const remarks = ["Paid by cheque 4471, approved at the March committee", 'He said "ok"', "line one\nline two", "=SUM(A1:A9)", "+60123456789", "-refund", "@admin", "Bayaran 款项 பணம் café", "", null, "  padded  ", "\ttab"]
export const docs = remarks.map((r, i) => ({ ...base, id: `0000000${i}-aaaa-bbbb-cccc-dddddddddddd`, vendor_name: i === 2 ? 'Kedai "Maju", Sdn Bhd' : `Vendor ${i}`, amount: i === 5 ? -50 : 100 + i, document_date: `2026-11-${String(i + 1).padStart(2, "0")}`, remarks: r }))
docs.push({ ...base, id: "split000-aaaa-bbbb-cccc-dddddddddddd", vendor_name: "Split Co", amount: 300, document_date: "2026-11-20", remarks: "split remark", splits: [{ amount: 200, fund_id: "f1", category_id: "c1" }, { amount: 100, fund_id: "f2", category_id: "c2" }] as never, original_currency: "USD", original_amount: 64, exchange_rate: 4.6875 } as never)
