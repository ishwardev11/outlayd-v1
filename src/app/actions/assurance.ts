"use server"

// Assurance screens (Phase 5, stage 6b): the period lock, the statement line, reconciliations and the
// change history. The database decides every rule (set_lock_date, save_reconciliation and the lock
// triggers check the role, organisation and plan themselves; row-level security limits what is read);
// these actions validate the input and turn the answers into plain messages.
import { revalidatePath } from "next/cache"
import { createClient } from "@/utils/supabase/server"
import { getCurrentUserRole, getOrganizationCurrency, getOrganizationId, getOrganizationTimezone } from "./document-utils"
import { todayInTimezone } from "@/utils/dates"
import { featureAllowed } from "@/utils/plan"
import { formatDay, isIsoDay, isMonthEnd, parseLockInput, pastMonthEnds } from "@/utils/lock"
import { letterheadLines } from "@/utils/donation-receipt"
import { loadLetterhead } from "@/utils/letterhead-server"
import { parseMoney } from "@/utils/balance-input"
import { AUDIT_KINDS, describeChange, type AuditChange, type AuditKind, type AuditLookups, type DescribedChange } from "@/utils/audit-changes"
import { getCurrencyDetails } from "@/utils/currency"
import {
    checksStatus, defaultFinancialYear, financialYears, lockStatus, openingStatus, reconciliationStatus,
    type AccountStatus, type FinancialYearOption, type StepStatus,
} from "@/utils/year-end"

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function dbMessage(error: { message?: string } | null | undefined, fallback: string): string {
    const m = (error?.message ?? "").trim()
    if (!m || /row-level security|permission denied|violates|syntax|duplicate key|function .* does not exist/i.test(m)) return fallback
    return m
}

function revalidateAll() {
    for (const p of ["/settings", "/bank", "/audit-log", "/inbox", "/transactions", "/invoices", "/assets", "/dashboard", "/reports"]) revalidatePath(p)
}

// ------------------------------------------------------------------ the lock

// For the dashboard layout: the lock date of the active organisation (null when not locked)
export async function getLockState(): Promise<{ lockDate: string | null; startDate: string | null }> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return { lockDate: null, startDate: null }
    const supabase = await createClient()
    const { data } = await supabase.from("organizations").select("lock_date, tracking_start_date").eq("id", organizationId).maybeSingle()
    return { lockDate: (data?.lock_date as string | null) ?? null, startDate: (data?.tracking_start_date as string | null) ?? null }
}

export interface HistoryRow extends DescribedChange { when: string; who: string }

export interface YearEndState {
    lockDate: string | null
    startDate: string | null
    statementNote: string | null
    today: string
    canLock: boolean
    lockPaid: boolean
    isAdmin: boolean
    history: HistoryRow[]
}

export async function getYearEnd(): Promise<YearEndState | null> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const supabase = await createClient()
    const [{ data: org }, role, lockPaid, today, history] = await Promise.all([
        supabase.from("organizations").select("lock_date, tracking_start_date, statement_note").eq("id", organizationId).maybeSingle(),
        getCurrentUserRole(),
        featureAllowed(supabase, organizationId, "period_lock", "use"),
        getOrganizationTimezone().then(todayInTimezone),
        getChanges({ kinds: ["settings"], limit: 30, settingsOnlyLock: true }),
    ])
    return {
        lockDate: (org?.lock_date as string | null) ?? null,
        startDate: (org?.tracking_start_date as string | null) ?? null,
        statementNote: (org?.statement_note as string | null) ?? null,
        today,
        isAdmin: role === "Admin",
        lockPaid,
        canLock: role === "Admin" && lockPaid,
        history: history.rows,
    }
}

export async function setLockDate(raw: unknown): Promise<ActionResult> {
    if ((await getCurrentUserRole()) !== "Admin") return { success: false, error: "Only Admins can lock or unlock a period" }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const supabase = await createClient()
    const [{ data: org }, today] = await Promise.all([
        supabase.from("organizations").select("lock_date").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone().then(todayInTimezone),
    ])
    const parsed = parseLockInput(raw, (org?.lock_date as string | null) ?? null, today)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const { error } = await supabase.rpc("set_lock_date", { p_date: parsed.value.date, p_reason: parsed.value.reason })
    if (error) return { success: false, error: dbMessage(error, "Could not change the lock. Please try again.") }
    revalidateAll()
    return { success: true }
}

export async function saveStatementNote(raw: unknown): Promise<ActionResult> {
    if ((await getCurrentUserRole()) !== "Admin") return { success: false, error: "Only Admins can change the statement line" }
    if (raw !== null && typeof raw !== "string") return { success: false, error: "The statement line could not be read" }
    const note = (raw ?? "").trim()
    if (note.length > 300) return { success: false, error: "Keep the statement line to 300 characters" }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const supabase = await createClient()
    const { data, error } = await supabase.from("organizations").update({ statement_note: note || null }).eq("id", organizationId).select("id")
    if (error || !data?.length) return { success: false, error: dbMessage(error, "Could not save the statement line. Please try again.") }
    revalidatePath("/settings")
    return { success: true }
}

// ------------------------------------------------------------------ reconciliations

export interface ReconciliationRow {
    account_id: string
    account_name: string
    archived: boolean
    outlayd_balance: number
    reconciliation_id: string | null
    statement_balance: number | null
    difference: number | null
    note: string | null
    suggested_balance: number | null
    // Which uploaded statement the suggested balance came from, in words
    suggested_source: string | null
}

export interface ReconciliationPage {
    periodEnd: string
    monthEnds: { date: string; reconciled: number }[]
    accountCount: number
    rows: ReconciliationRow[]
    lockDate: string | null
    canEdit: boolean
    paid: boolean
}

export async function getReconciliationPage(requested?: string | null): Promise<ReconciliationPage | null> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const supabase = await createClient()
    const today = todayInTimezone(await getOrganizationTimezone())
    const monthEnds = pastMonthEnds(today, 24)
    const periodEnd = isMonthEnd(requested) && requested < today ? requested : monthEnds[0]
    const [{ data: status, error }, { data: saved }, { data: accounts }, { data: org }, role, paid] = await Promise.all([
        supabase.rpc("reconciliation_status", { p_org: organizationId, p_period_end: periodEnd }),
        supabase.from("reconciliations").select("period_end").eq("organization_id", organizationId).gte("period_end", monthEnds[monthEnds.length - 1]),
        supabase.from("accounts").select("id").eq("organization_id", organizationId).is("archived_at", null),
        supabase.from("organizations").select("lock_date").eq("id", organizationId).maybeSingle(),
        getCurrentUserRole(),
        featureAllowed(supabase, organizationId, "reconciliation", "use"),
    ])
    if (error) console.error("getReconciliationPage failed:", error)
    const counts = new Map<string, number>()
    for (const r of (saved ?? []) as { period_end: string }[]) counts.set(r.period_end, (counts.get(r.period_end) ?? 0) + 1)
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    return {
        periodEnd,
        monthEnds: (monthEnds.includes(periodEnd) ? monthEnds : [periodEnd, ...monthEnds]).map((d) => ({ date: d, reconciled: counts.get(d) ?? 0 })),
        accountCount: (accounts ?? []).length,
        lockDate: (org?.lock_date as string | null) ?? null,
        paid,
        canEdit: paid && (role === "Admin" || role === "Editor"),
        rows: ((status ?? []) as Record<string, unknown>[])
            .map((r) => ({
                account_id: String(r.account_id), account_name: String(r.account_name), archived: r.archived === true,
                outlayd_balance: Number(r.outlayd_balance), reconciliation_id: (r.reconciliation_id as string | null) ?? null,
                statement_balance: num(r.statement_balance), difference: num(r.difference), note: (r.note as string | null) ?? null,
                suggested_balance: num(r.suggested_balance),
                suggested_source: (r.suggested_source as string | null) ?? null,
            }))
            .filter((r) => !r.archived || r.reconciliation_id !== null || r.outlayd_balance !== 0)
            .sort((a, b) => Number(a.archived) - Number(b.archived) || a.account_name.localeCompare(b.account_name)),
    }
}

export async function saveReconciliation(raw: unknown): Promise<ActionResult<{ id: string }>> {
    const r = (raw ?? {}) as { account_id?: unknown; period_end?: unknown; statement_balance?: unknown; note?: unknown }
    if (typeof r.account_id !== "string" || !UUID_RE.test(r.account_id)) return { success: false, error: "That account was not found" }
    if (!isMonthEnd(r.period_end)) return { success: false, error: "Reconcile to the last day of a month" }
    const rawBalance = String(r.statement_balance ?? "").trim()
    const balance = rawBalance === "" ? null : parseMoney(rawBalance, { allowZero: true, allowNegative: true })
    if (balance === null) return { success: false, error: "Enter the statement balance as an amount with at most two decimals" }
    if (r.note !== undefined && r.note !== null && typeof r.note !== "string") return { success: false, error: "The note could not be read" }
    const note = (typeof r.note === "string" ? r.note : "").trim()
    if (note.length > 500) return { success: false, error: "Keep the note to 500 characters" }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("save_reconciliation", {
        payload: { account_id: r.account_id, period_end: r.period_end, statement_balance: balance, note: note || null },
    })
    if (error || typeof data !== "string") return { success: false, error: dbMessage(error, "Could not save the reconciliation. Please try again.") }
    revalidatePath("/bank")
    revalidatePath("/reports")
    return { success: true, data: { id: data } }
}

export async function deleteReconciliation(id: string): Promise<ActionResult> {
    if (!UUID_RE.test(id ?? "")) return { success: false, error: "That reconciliation was not found" }
    const supabase = await createClient()
    const { error } = await supabase.rpc("delete_reconciliation", { p_id: id })
    if (error) return { success: false, error: dbMessage(error, "Could not remove the reconciliation. Please try again.") }
    revalidatePath("/bank")
    revalidatePath("/reports")
    return { success: true }
}

// ------------------------------------------------------------------ ready to submit (spec 8)

export interface IntegrityCheck {
    code: string
    title: string
    severity: "block" | "warning"
    // null when the check does not apply yet (for example before the opening position)
    passed: boolean | null
    detail: string | null
    fixHref: string | null
    fixLabel: string | null
}

export interface StatementAssurance {
    checks: IntegrityCheck[]
    // every blocking check passes: the PDF is final (no DRAFT mark)
    final: boolean
    lockDate: string | null
    // an Admin on a paid plan, for a period that ends after the lock date and not after today
    canLockPeriod: boolean
}

function fixFor(code: string, from: string, to: string, monthEnd: string | null): { href: string; label: string } | null {
    const range = `from=${from}&to=${to}`
    switch (code) {
        case "uncategorised": return { href: `/transactions?${range}`, label: "Open the cash book" }
        case "lines_balanced": return { href: `/transactions?${range}`, label: "Open the cash book" }
        case "opening_complete": return { href: "/settings/opening-position", label: "Complete the opening position" }
        case "balance_check": return { href: "/reports/financial-position", label: "Open the Statement of Financial Position" }
        case "prior_year": return { href: "/reports/changes-in-funds", label: "Open Changes in Funds" }
        case "invoices": return { href: "/invoices", label: "Open Invoices" }
        case "reconciled": return { href: `/bank?tab=reconciliation${monthEnd ? `&month=${monthEnd}` : ""}`, label: "Open month-end reconciliation" }
        case "restricted_negative": return { href: "/reports/changes-in-funds", label: "Open Changes in Funds" }
        default: return null
    }
}

export async function getStatementAssurance(from: string, to: string): Promise<StatementAssurance | null> {
    if (!isIsoDay(from) || !isIsoDay(to) || from > to) return null
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const supabase = await createClient()
    if (!(await featureAllowed(supabase, organizationId, "financial_statements", "read"))) return null
    const [{ data, error }, { data: org }, role, lockPaid, today] = await Promise.all([
        supabase.rpc("integrity_checks", { p_org: organizationId, p_from: from, p_to: to }),
        supabase.from("organizations").select("lock_date").eq("id", organizationId).maybeSingle(),
        getCurrentUserRole(),
        featureAllowed(supabase, organizationId, "period_lock", "use"),
        getOrganizationTimezone().then(todayInTimezone),
    ])
    if (error) {
        console.error("getStatementAssurance failed:", error)
        return null
    }
    const checks = ((data ?? []) as { code: string; title: string; severity: "block" | "warning"; passed: boolean | null; detail: string | null }[]).map((c) => {
        // The reconciliation check names its month-end in its title ("... at 2026-10-31")
        const monthEnd = c.code === "reconciled" ? (c.title.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null) : null
        const fix = c.passed === false || c.passed === null ? fixFor(c.code, from, to, monthEnd) : null
        const detail = c.code === "prior_year" && c.detail === "The period starts at the opening position"
            ? "Does not apply: the period starts on or before your tracking start date, so there is no earlier period in Outlayd"
            : c.detail
        return {
            code: c.code, severity: c.severity, passed: c.passed, detail,
            title: monthEnd ? c.title.replace(monthEnd, formatDay(monthEnd)) : c.title,
            fixHref: fix?.href ?? null, fixLabel: fix?.label ?? null,
        }
    })
    const lockDate = (org?.lock_date as string | null) ?? null
    return {
        checks,
        final: checks.every((c) => c.severity !== "block" || c.passed !== false),
        lockDate,
        canLockPeriod: role === "Admin" && lockPaid && to <= today && (!lockDate || to > lockDate),
    }
}

export interface StatementFrameData {
    letterhead: string[]
    letterheadImage: string | null
    signatories: { name: string; title: string }[]
    statementNote: string | null
    preparedOn: string
    assurance: StatementAssurance
}

// Everything a statement PDF needs besides its figures: the letterhead, signatories, the statement line,
// and whether the period passes its checks (otherwise the PDF is marked DRAFT)
export async function getStatementFrame(from: string, to: string): Promise<ActionResult<StatementFrameData>> {
    const assurance = await getStatementAssurance(from, to)
    if (!assurance) return { success: false, error: "Financial statements are available on the Growth and Nonprofit plans." }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const supabase = await createClient()
    const [{ data: o }, today] = await Promise.all([
        supabase.from("organizations").select("name, legal_name, address, registration_id, signatories, letterhead_path, statement_note").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone().then(todayInTimezone),
    ])
    if (!o) return { success: false, error: "No active organization" }
    const signatories = (Array.isArray(o.signatories) ? o.signatories : [])
        .filter((s): s is { name: string; title?: string } => !!s && typeof (s as { name?: unknown }).name === "string")
        .map((s) => ({ name: String(s.name), title: String(s.title ?? "") }))
        .slice(0, 3)
    return {
        success: true,
        data: {
            letterhead: letterheadLines({ name: String(o.name ?? ""), legal_name: (o.legal_name as string | null) ?? null, address: (o.address as string | null) ?? null, registration_id: (o.registration_id as string | null) ?? null }),
            letterheadImage: await loadLetterhead(organizationId, o.letterhead_path as string | null),
            signatories,
            statementNote: (o.statement_note as string | null) ?? null,
            preparedOn: formatDay(today),
            assurance,
        },
    }
}

// ------------------------------------------------------------------ change history

async function lookups(organizationId: string): Promise<AuditLookups> {
    const supabase = await createClient()
    const [{ data: c }, { data: f }, { data: a }, { data: i }] = await Promise.all([
        supabase.from("categories").select("id, name").eq("organization_id", organizationId),
        supabase.from("funds").select("id, name").eq("organization_id", organizationId),
        supabase.from("accounts").select("id, name").eq("organization_id", organizationId),
        supabase.from("items").select("id, name").eq("organization_id", organizationId),
    ])
    const map = (rows: unknown) => new Map(((rows ?? []) as { id: string; name: string }[]).map((r) => [r.id, r.name]))
    return { categories: map(c), funds: map(f), accounts: map(a), items: map(i) }
}

export interface ChangeQuery {
    kinds?: AuditKind[]
    from?: string | null
    to?: string | null
    record?: string | null
    page?: number
    limit?: number
    settingsOnlyLock?: boolean
    // Only changes by this person (their email), or "System" for changes made by no one signed in
    actor?: string | null
}

// The people who appear in the change history, for the Audit log's user filter
export async function getAuditActors(): Promise<string[]> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return []
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("audit_actors", { p_org: organizationId })
    if (error) {
        console.error("getAuditActors failed:", error)
        return []
    }
    return ((data ?? []) as { actor_email: string }[]).map((r) => r.actor_email).filter(Boolean)
}

export async function getChanges(q: ChangeQuery): Promise<{ rows: HistoryRow[]; total: number }> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return { rows: [], total: 0 }
    const valid = new Set(AUDIT_KINDS.map((k) => k.value))
    const kinds = (q.kinds ?? []).filter((k) => valid.has(k))
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)
    const page = Number.isInteger(q.page) && (q.page as number) > 0 ? (q.page as number) : 1
    const record = q.record && UUID_RE.test(q.record) ? q.record : null
    if (q.record && !record) return { rows: [], total: 0 }
    const actorRaw = typeof q.actor === "string" ? q.actor.trim().slice(0, 254) : ""
    const actor = actorRaw === "System" ? "System" : /^[^\s@]+@[^\s@]+$/.test(actorRaw) ? actorRaw.toLowerCase() : null
    const supabase = await createClient()
    const [{ data, error }, look, currency, timeZone] = await Promise.all([
        supabase.rpc("audit_changes", {
            p_org: organizationId, p_kinds: kinds.length ? kinds : null,
            p_from: isIsoDay(q.from) ? q.from : null, p_to: isIsoDay(q.to) ? q.to : null,
            p_record: record, p_limit: limit, p_offset: (page - 1) * limit,
            p_actor: actor,
        }),
        lookups(organizationId),
        getOrganizationCurrency(),
        getOrganizationTimezone(),
    ])
    if (error) {
        console.error("getChanges failed:", error)
        return { rows: [], total: 0 }
    }
    const symbol = getCurrencyDetails(currency).symbol
    const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone })
    let list = (data ?? []) as (AuditChange & { total_count: number })[]
    if (q.settingsOnlyLock) list = list.filter((c) => c.root_entity === "organizations" && c.before?.lock_date !== c.after?.lock_date)
    return {
        total: Number(list[0]?.total_count ?? 0),
        rows: list.map((c) => ({ ...describeChange(c, look, symbol), when: fmt.format(new Date(c.changed_at)), who: c.actor_email ?? "System" })),
    }
}

// The History panel of one invoice, asset or loan
export async function getRecordHistory(id: string): Promise<HistoryRow[]> {
    if (!UUID_RE.test(id ?? "")) return []
    return (await getChanges({ record: id, limit: 100 })).rows
}

// ------------------------------------------------------------------ the Year end hub (simplification step 5)

export interface YearEndHub {
    years: FinancialYearOption[]
    year: FinancialYearOption
    // the period of the year so far (the statements stop at today)
    checkTo: string
    today: string
    opening: { status: StepStatus; startDate: string | null; completedAt: string | null }
    reconciliation: { status: StepStatus; accounts: AccountStatus[]; monthEnd: string; canOpen: boolean }
    checks: { status: StepStatus; available: boolean }
    lock: { status: StepStatus; lockDate: string | null }
}

// Everything the Year end hub shows for one financial year: the opening position, the reconciliation of
// each account at the year end, the integrity checks, and the lock. Read through the user's own session.
export async function getYearEndHub(requestedYear: string | null): Promise<YearEndHub | null> {
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const supabase = await createClient()
    const [{ data: org }, today] = await Promise.all([
        supabase.from("organizations").select("fiscal_year_start, tracking_start_date, opening_position_completed_at, lock_date").eq("id", organizationId).maybeSingle(),
        getOrganizationTimezone().then(todayInTimezone),
    ])
    if (!org) return null
    const startDate = (org.tracking_start_date as string | null) ?? null
    const years = financialYears(startDate, Number(org.fiscal_year_start) || 1, today)
    const year = years.find((y) => y.key === requestedYear) ?? defaultFinancialYear(years)
    const checkTo = year.to > today ? today : year.to

    const [{ data: recon }, assurance] = await Promise.all([
        supabase.rpc("reconciliation_status", { p_org: organizationId, p_period_end: year.ended ? year.to : checkTo }),
        getStatementAssurance(year.from, checkTo),
    ])
    const rec = reconciliationStatus(((recon ?? []) as Record<string, unknown>[]).map((r) => ({
        account_id: String(r.account_id), account_name: String(r.account_name), archived: r.archived === true,
        outlayd_balance: Number(r.outlayd_balance), reconciliation_id: (r.reconciliation_id as string | null) ?? null,
        difference: r.difference === null || r.difference === undefined ? null : Number(r.difference), note: (r.note as string | null) ?? null,
    })), year.ended)
    const lockDate = (org.lock_date as string | null) ?? null
    return {
        years, year, checkTo, today,
        opening: { status: openingStatus(startDate, (org.opening_position_completed_at as string | null) ?? null), startDate, completedAt: (org.opening_position_completed_at as string | null) ?? null },
        // The reconciliation page offers month-ends before today, so a year that has not ended yet has nothing to open
        reconciliation: { ...rec, monthEnd: year.to, canOpen: year.ended },
        checks: { status: checksStatus(assurance?.checks ?? null), available: assurance !== null },
        lock: { status: lockStatus(lockDate, year.to, year.ended), lockDate },
    }
}
