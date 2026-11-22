"use server"

// Accounts, assets & liabilities, fund transfers and the opening position (Phase 4, stage 5b).
// Item entries, disposals, fund transfers and the start date go through the database functions from
// migration 20261126100000_balance_sheet.sql, which check the role, organisation and plan themselves.
// Accounts and fund opening balances are written on their rows through the user's own session, so
// row-level security (Admin for accounts, Admin or Editor for funds, paid plan) decides.
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { todayInTimezone } from "@/utils/dates"
import {
    isMonthStart, parseAccountInput, parseDisposalInput, parseFundTransferInput, parseItemInput, parseItemTxInput, parseMoney,
    type AccountType, type ItemKind,
} from "@/utils/balance-input"

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dbMessage(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
    const m = (error?.message ?? "").trim()
    if (error?.code === "23505") return "That name is already used"
    if (!m || /row-level security|permission denied|violates|syntax|function .* does not exist/i.test(m)) return fallback
    return m
}

function revalidateBalance() {
    for (const p of ["/assets", "/settings", "/settings/opening-position", "/ledger", "/dashboard", "/reports"]) revalidatePath(p)
}

// ------------------------------------------------------------------ accounts

export interface AccountRow { id: string; name: string; account_type: AccountType; opening_balance: number; is_default: boolean; archived: boolean; balance: number }

export async function getAccounts(): Promise<AccountRow[]> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return []
    const today = todayInTimezone(await getOrganizationTimezone())
    const [{ data: accounts }, { data: balances }] = await Promise.all([
        supabase.from("accounts").select("id, name, account_type, opening_balance, is_default, archived_at").eq("organization_id", organizationId).order("is_default", { ascending: false }).order("name"),
        supabase.rpc("account_balances", { p_org: organizationId, p_date: today }),
    ])
    const bal = new Map(((balances ?? []) as { account_id: string; balance: number | string }[]).map((b) => [b.account_id, Number(b.balance)]))
    return ((accounts ?? []) as Record<string, unknown>[]).map((a) => ({
        id: String(a.id), name: String(a.name), account_type: a.account_type as AccountType, opening_balance: Number(a.opening_balance),
        is_default: a.is_default === true, archived: !!a.archived_at, balance: bal.get(String(a.id)) ?? Number(a.opening_balance),
    }))
}

export async function saveAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = parseAccountInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const a = parsed.value
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const row = { name: a.name, account_type: a.account_type, opening_balance: a.opening_balance, archived_at: a.archived ? new Date().toISOString() : null }
    const res = a.id
        ? await supabase.from("accounts").update(row).eq("id", a.id).eq("organization_id", organizationId).select("id").maybeSingle()
        : await supabase.from("accounts").insert({ ...row, organization_id: organizationId }).select("id").maybeSingle()
    if (res.error || !res.data) {
        if (!res.error) return { success: false, error: "Only Admins on the Growth or Nonprofit plan can change accounts." }
        return { success: false, error: dbMessage(res.error, "Could not save the account. Only Admins on a paid plan can change accounts.") }
    }
    revalidateBalance()
    return { success: true, data: { id: String(res.data.id) } }
}

// ------------------------------------------------------------------ fund transfers

export interface FundTransferRow { id: string; tx_date: string; amount: number; from_fund_id: string; to_fund_id: string; from_name: string; to_name: string; remarks: string | null }

export async function getFundTransfers(): Promise<FundTransferRow[]> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return []
    const [{ data: tx }, { data: funds }] = await Promise.all([
        supabase.from("transactions").select("id, tx_date, total, from_fund_id, to_fund_id, remarks").eq("organization_id", organizationId)
            .eq("tx_type", "fund_transfer").order("tx_date", { ascending: false }).limit(200),
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
    ])
    const names = new Map(((funds ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]))
    return ((tx ?? []) as Record<string, unknown>[]).map((t) => ({
        id: String(t.id), tx_date: String(t.tx_date), amount: Number(t.total), from_fund_id: String(t.from_fund_id), to_fund_id: String(t.to_fund_id),
        from_name: names.get(String(t.from_fund_id)) ?? "", to_name: names.get(String(t.to_fund_id)) ?? "", remarks: (t.remarks as string | null) ?? null,
    }))
}

export async function saveFundTransfer(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = parseFundTransferInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("save_fund_transfer", { payload: parsed.value })
    if (error || typeof data !== "string") return { success: false, error: dbMessage(error, "Could not save the transfer. Please try again.") }
    revalidateBalance()
    return { success: true, data: { id: data } }
}

export async function deleteFundTransfer(id: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That transfer was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("delete_fund_transfer", { p_id: id })
    if (error) return { success: false, error: dbMessage(error, "Could not delete the transfer. Please try again.") }
    revalidateBalance()
    return { success: true }
}

// ------------------------------------------------------------------ assets and liabilities

export interface ItemEntry { transaction_id: string; tx_date: string; direction: "in" | "out"; amount: number; reference: string | null; remarks: string | null }
export interface ItemRow {
    id: string; name: string; kind: ItemKind; classification: "current" | "non_current"; fund_id: string; fund_name: string
    notes: string | null; archived: boolean
    opening_balance: number; acquired_date: string | null; opening_cost: number; opening_accumulated_depreciation: number
    residual_value: number; useful_life_months: number | null; disposed_date: string | null
    // today's figures: balance for other assets and liabilities; cost / depreciation / book value for fixed assets
    balance: number; cost: number; accumulated: number
    entries: ItemEntry[]
}
export interface AssetsPage { items: ItemRow[]; startDate: string | null; today: string; disposals: { item_id: string; proceeds: number; loss: number }[] }

export async function getAssetsPage(): Promise<AssetsPage> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    const today = todayInTimezone(await getOrganizationTimezone())
    if (!organizationId) return { items: [], startDate: null, today, disposals: [] }
    const [{ data: items }, { data: org }, { data: fixed }, { data: balances }, { data: funds }, { data: lines }, { data: disposals }] = await Promise.all([
        supabase.from("items").select("*").eq("organization_id", organizationId).order("kind").order("name"),
        supabase.from("organizations").select("tracking_start_date").eq("id", organizationId).maybeSingle(),
        supabase.rpc("fixed_asset_position", { p_org: organizationId, p_date: today }),
        supabase.rpc("item_balances", { p_org: organizationId, p_date: today }),
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
        supabase.from("transaction_lines").select("item_id, amount, transaction_id, transactions(tx_type, tx_date, reference, remarks)")
            .eq("organization_id", organizationId).not("item_id", "is", null),
        supabase.rpc("disposal_results", { p_org: organizationId }),
    ])
    const fundNames = new Map(((funds ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]))
    const fixedOf = new Map(((fixed ?? []) as { item_id: string; cost: number; accumulated: number; nbv: number }[]).map((f) => [f.item_id, f]))
    const balOf = new Map(((balances ?? []) as { item_id: string; balance: number }[]).map((b) => [b.item_id, Number(b.balance)]))
    type L = { item_id: string; amount: number | string; transaction_id: string; transactions: { tx_type: string; tx_date: string; reference: string | null; remarks: string | null } | null }
    const entriesOf = new Map<string, ItemEntry[]>()
    for (const l of (lines ?? []) as unknown as L[]) {
        const list = entriesOf.get(l.item_id) ?? []
        list.push({ transaction_id: l.transaction_id, tx_date: l.transactions?.tx_date ?? "", direction: l.transactions?.tx_type === "money_in" ? "in" : "out",
                    amount: Number(l.amount), reference: l.transactions?.reference ?? null, remarks: l.transactions?.remarks ?? null })
        entriesOf.set(l.item_id, list)
    }
    return {
        startDate: (org?.tracking_start_date as string | null) ?? null,
        today,
        disposals: ((disposals ?? []) as { item_id: string; proceeds: number; loss: number }[]).map((d) => ({ item_id: d.item_id, proceeds: Number(d.proceeds), loss: Number(d.loss) })),
        items: ((items ?? []) as Record<string, unknown>[]).map((i) => {
            const f = fixedOf.get(String(i.id))
            return {
                id: String(i.id), name: String(i.name), kind: i.kind as ItemKind, classification: i.classification as ItemRow["classification"],
                fund_id: String(i.fund_id), fund_name: fundNames.get(String(i.fund_id)) ?? "", notes: (i.notes as string | null) ?? null, archived: !!i.archived_at,
                opening_balance: Number(i.opening_balance), acquired_date: (i.acquired_date as string | null) ?? null, opening_cost: Number(i.opening_cost),
                opening_accumulated_depreciation: Number(i.opening_accumulated_depreciation), residual_value: Number(i.residual_value),
                useful_life_months: (i.useful_life_months as number | null) ?? null, disposed_date: (i.disposed_date as string | null) ?? null,
                balance: i.kind === "fixed_asset" ? Number(f?.nbv ?? 0) : balOf.get(String(i.id)) ?? Number(i.opening_balance),
                cost: Number(f?.cost ?? 0), accumulated: Number(f?.accumulated ?? 0),
                entries: (entriesOf.get(String(i.id)) ?? []).sort((a, b) => a.tx_date.localeCompare(b.tx_date)),
            }
        }),
    }
}

export async function saveItem(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = parseItemInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("save_item", { payload: parsed.value })
    if (error || typeof data !== "string") return { success: false, error: dbMessage(error, "Could not save. Please try again.") }
    revalidateBalance()
    return { success: true, data: { id: data } }
}

export async function deleteItem(id: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That item was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("delete_item", { p_id: id })
    if (error) return { success: false, error: dbMessage(error, "Could not delete. Please try again.") }
    revalidateBalance()
    return { success: true }
}

export async function recordItemTransaction(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = parseItemTxInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("record_item_transaction", { payload: parsed.value })
    if (error || typeof data !== "string") return { success: false, error: dbMessage(error, "Could not record this. Please try again.") }
    revalidateBalance()
    return { success: true, data: { id: data } }
}

export async function deleteItemTransaction(txId: string): Promise<ActionResult> {
    if (!UUID_RE.test(txId ?? "")) return { success: false, error: "That entry was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("delete_item_transaction", { p_tx: txId })
    if (error) return { success: false, error: dbMessage(error, "Could not delete the entry. Please try again.") }
    revalidateBalance()
    return { success: true }
}

export async function disposeItem(raw: unknown): Promise<ActionResult> {
    const parsed = parseDisposalInput(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const { error } = await supabase.rpc("dispose_item", { payload: parsed.value })
    if (error) return { success: false, error: dbMessage(error, "Could not record the disposal. Please try again.") }
    revalidateBalance()
    return { success: true }
}

export async function undoDisposal(itemId: string): Promise<ActionResult> {
    if (!UUID_RE.test(itemId ?? "")) return { success: false, error: "That asset was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("undo_disposal", { p_item: itemId })
    if (error) return { success: false, error: dbMessage(error, "Could not undo the disposal. Please try again.") }
    revalidateBalance()
    return { success: true }
}

// ------------------------------------------------------------------ opening position

export interface OpeningPosition {
    startDate: string | null
    completedAt: string | null
    accounts: AccountRow[]
    funds: { id: string; name: string; fund_type: string; is_default: boolean; opening: number; archived: boolean }[]
    owed: { direction: "receivable" | "payable"; id: string; invoice_no: string | null; payee_name: string; issue_date: string; balance: number }[]
    owedTotals: { receivable: number; payable: number }
    items: { id: string; name: string; kind: ItemKind; value: number }[]
    netAssets: number
}

export async function getOpeningPosition(): Promise<OpeningPosition | null> {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const { data: org } = await supabase.from("organizations").select("tracking_start_date, opening_position_completed_at").eq("id", organizationId).maybeSingle()
    if (!org) return null
    const start = (org.tracking_start_date as string | null) ?? null
    const dayBefore = start ? new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : null
    const [accounts, { data: funds }, { data: openings }, { data: net }, { data: items }, owedRows, owedTotals] = await Promise.all([
        getAccounts(),
        supabase.from("funds").select("id, name, fund_type, is_default, archived_at, is_archived").eq("organization_id", organizationId).order("is_default", { ascending: false }).order("name"),
        supabase.rpc("fund_openings", { p_org: organizationId }),
        supabase.rpc("opening_net_assets", { p_org: organizationId }),
        supabase.from("items").select("id, name, kind, opening_balance, opening_cost, opening_accumulated_depreciation, acquired_date").eq("organization_id", organizationId),
        dayBefore
            ? supabase.from("invoice_summary").select("id, direction, invoice_no, payee_name, issue_date, balance, is_opening_balance")
                .eq("organization_id", organizationId).eq("status", "open").or(`issue_date.lt.${start},is_opening_balance.eq.true`).limit(500)
            : Promise.resolve({ data: [] as unknown[] }),
        dayBefore ? supabase.rpc("invoice_balances_at", { p_org: organizationId, p_date: dayBefore }) : Promise.resolve({ data: [] as unknown[] }),
    ])
    const openingOf = new Map(((openings ?? []) as { fund_id: string; opening: number }[]).map((o) => [o.fund_id, Number(o.opening)]))
    const totals = { receivable: 0, payable: 0 }
    for (const t of (owedTotals.data ?? []) as { direction: "receivable" | "payable"; amount: number }[]) totals[t.direction] = Number(t.amount)
    return {
        startDate: start,
        completedAt: (org.opening_position_completed_at as string | null) ?? null,
        accounts,
        funds: ((funds ?? []) as Record<string, unknown>[]).map((f) => ({
            id: String(f.id), name: String(f.name), fund_type: String(f.fund_type), is_default: f.is_default === true,
            opening: openingOf.get(String(f.id)) ?? 0, archived: !!f.archived_at || f.is_archived === true,
        })),
        owed: ((owedRows.data ?? []) as Record<string, unknown>[]).filter((r) => Number(r.balance) > 0).map((r) => ({
            direction: r.direction as "receivable" | "payable", id: String(r.id), invoice_no: (r.invoice_no as string | null) ?? null,
            payee_name: String(r.payee_name), issue_date: String(r.issue_date), balance: Number(r.balance),
        })),
        owedTotals: totals,
        items: ((items ?? []) as Record<string, unknown>[])
            .filter((i) => i.kind !== "fixed_asset" || (start && String(i.acquired_date) < start))
            .map((i) => ({
                id: String(i.id), name: String(i.name), kind: i.kind as ItemKind,
                value: i.kind === "fixed_asset" ? Number(i.opening_cost) - Number(i.opening_accumulated_depreciation) : Number(i.opening_balance),
            })),
        netAssets: Number(net ?? 0),
    }
}

export async function saveStartDate(startDate: string): Promise<ActionResult> {
    if (!isMonthStart(startDate)) return { success: false, error: "The start date must be the first day of a month" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("save_opening_position", { payload: { start_date: startDate } })
    if (error) return { success: false, error: dbMessage(error, "Could not save the start date. Only Admins on a paid plan can do this.") }
    revalidateBalance()
    return { success: true }
}

// Opening balances of funds other than the General Fund (whose opening is the balancing figure)
export async function saveFundOpenings(raw: { id: string; opening_balance: string | number }[]): Promise<ActionResult> {
    if (!Array.isArray(raw) || raw.length > 200) return { success: false, error: "The form could not be read" }
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    for (const f of raw) {
        if (!UUID_RE.test(f?.id ?? "")) return { success: false, error: "A fund could not be found" }
        const amount = parseMoney(f.opening_balance ?? "", { allowZero: true, allowNegative: true })
        if (amount === null) return { success: false, error: "Enter each opening balance as an amount with at most two decimals" }
        const { data, error } = await supabase.from("funds").update({ opening_balance: amount })
            .eq("id", f.id).eq("organization_id", organizationId).eq("is_default", false).select("id")
        if (error || !data?.length) return { success: false, error: dbMessage(error, "Could not save the fund balances. Only Admins and Editors on a paid plan can do this.") }
    }
    revalidateBalance()
    return { success: true }
}

export async function completeOpeningPosition(startDate: string): Promise<ActionResult> {
    if (!isMonthStart(startDate)) return { success: false, error: "Choose the start date first" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("save_opening_position", { payload: { start_date: startDate, complete: true } })
    if (error) return { success: false, error: dbMessage(error, "Could not complete the opening position. Only Admins on a paid plan can do this.") }
    revalidateBalance()
    return { success: true }
}
