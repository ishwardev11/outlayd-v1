// The plan comparison shown on the landing page, the pricing section and the nonprofit page (spec 9:
// "every claim matches what each plan actually includes"). Each row names the plan rules (PlanFeature)
// it depends on; a unit test checks it against FREE_PLAN_ACCESS, so the page cannot promise the Free plan
// something the app refuses. Growth and Nonprofit include the same features; Nonprofit is a lower price
// for registered nonprofits.
import type { PlanFeature } from "./plan"

export type FreeLevel = "full" | "partial" | "none"

export interface ComparisonRow {
    feature: string
    detail?: string
    free: string
    paid: string
    freeLevel: FreeLevel
    gates: PlanFeature[]
}

export const PLAN_COMPARISON: ComparisonRow[] = [
    { feature: "AI receipt and bill reading", detail: "Photos and PDFs read for payee, date, amount and lines; you check and approve each one", free: "5 a month", paid: "Unlimited", freeLevel: "partial", gates: [] },
    { feature: "Users", free: "1", paid: "Up to 5 (Admin, Editor, Viewer)", freeLevel: "partial", gates: [] },
    { feature: "Expenses and receipts", detail: "Receipts, contacts, categories, remarks, duplicate check", free: "Yes", paid: "Yes", freeLevel: "full", gates: [] },
    { feature: "Category suggestions", detail: "Uncategorised entries listed with a category suggested from each contact's history; accept one or all", free: "Yes", paid: "Yes", freeLevel: "full", gates: [] },
    { feature: "Cash book CSV export", detail: "Every payment in and out, with your own filters", free: "Yes", paid: "Yes", freeLevel: "full", gates: [] },
    { feature: "Change history (audit log)", free: "Yes", paid: "Yes", freeLevel: "full", gates: ["audit_log"] },
    { feature: "Money in and donor receipts", detail: "Donations, grants and fees, split across funds; numbered receipts, tax-exempt when approved", free: "Preview", paid: "Yes", freeLevel: "partial", gates: ["income"] },
    { feature: "Funds and restricted funds", detail: "A fund per grant or appeal, with its balance", free: "Starter funds only", paid: "Yes", freeLevel: "partial", gates: ["funds"] },
    { feature: "Bank and cash accounts", detail: "Where your money sits, e.g. current account, cash box, e-wallet; each with its balance", free: "One (your Main Account)", paid: "As many as you need", freeLevel: "partial", gates: ["accounts"] },
    { feature: "Fund transfers and opening position", detail: "Move money between funds; set your starting balances", free: "No", paid: "Yes", freeLevel: "none", gates: ["accounts"] },
    { feature: "Bills and invoices", detail: "Invoices with your letterhead; deposits and part-payments, each with its receipt; money still to come in; overdue list", free: "Approved bills listed", paid: "Yes", freeLevel: "partial", gates: ["invoices"] },
    { feature: "AI help with invoices and categories", detail: "Fill in an invoice from one you already issued, match a payment slip to the invoice it pays, suggest categories for new contacts. Nothing is saved until you check it.", free: "No", paid: "Up to 300 a month", freeLevel: "none", gates: ["invoices"] },
    { feature: "Bank statement import and matching", free: "No", paid: "Yes", freeLevel: "none", gates: ["bank_statements"] },
    { feature: "Assets, loans and depreciation", free: "No", paid: "Yes", freeLevel: "none", gates: ["assets"] },
    { feature: "Financial statements", detail: "Income and Expenditure (or Profit and Loss), Receipts and Payments, Financial Position, Changes in Funds, schedules; checks explained in plain words, and signed PDFs", free: "Sample preview", paid: "Yes", freeLevel: "partial", gates: ["financial_statements"] },
    { feature: "Donor and Audit Memo", free: "No", paid: "Yes", freeLevel: "none", gates: ["donor_memo"] },
    { feature: "Accounting export for your accountant", free: "No", paid: "Yes", freeLevel: "none", gates: ["accounting_export"] },
    { feature: "Month-end reconciliation and period locks", free: "No", paid: "Yes", freeLevel: "none", gates: ["reconciliation", "period_lock"] },
]

export const DOWNGRADE_NOTE = "If you stop paying, nothing is deleted: paid features become read-only and you can still export what you recorded."

export const PRICES = { free: 0, growth: 89, nonprofit: 49 } as const
