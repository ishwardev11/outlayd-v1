"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getCurrentUserRole } from "./document-utils"

async function checkWriteAccess() {
    const role = await getCurrentUserRole();
    if (role === 'Viewer') {
        throw new Error("Unauthorized: Viewers cannot perform this action.");
    }
    return role;
}

import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { isValidTimezone } from "@/utils/dates"
import Stripe from 'stripe';
import { createAdminClient } from "@/utils/supabase/admin"
import { toStoragePath } from "@/utils/storage-paths"
import { sanitizeFundDetails, UpdateValidationError } from "@/utils/sanitize-updates"
import { baseCurrencyChangeBlocked } from "@/utils/base-currency"
import { getPlanState, requireFeature } from "@/utils/plan"
import { errorMessage, errorProp, type IdName } from "@/utils/row-types";
import { isExpenseGroup, isIncomeNature, OTHER_GROUP } from "@/utils/category-options";

// A workspace_invites row (only the fields read here)
interface InviteRow {
    id: string
    organization_id: string
    email?: string
    role: string
    created_at: string | null
}

// --- Organization Profile ---

export async function getOrganizationSettings() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (!organization_id) {
        return null
    }

    const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organization_id)
        .single()

    if (error) {
        console.error("Failed to fetch org settings. Error code:", error.code, "Message:", error.message)
        return null
    }
    return data
}

// The organisation fields the Settings > Organization tab can change
interface OrganizationSettingsUpdate {
    name?: string
    registration_id?: string | null
    base_currency?: string
    fiscal_year_start?: number | string
    timezone?: string
}

export async function updateOrganizationSettings(updates: OrganizationSettingsUpdate) {
    const role = await checkWriteAccess();
    if (role !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can change organization settings.");
    }
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const cookieStore = await cookies();
    if (updates.base_currency !== undefined && !/^[A-Z]{3}$/.test(String(updates.base_currency))) {
        return { success: false, error: "Choose a valid base currency." };
    }
    if (updates.timezone !== undefined && !isValidTimezone(updates.timezone)) {
        return { success: false, error: "Choose a valid timezone." };
    }

    if (updates.base_currency) {
        const blocked = await baseCurrencyChangeBlocked(supabase, organization_id, updates.base_currency)
        if (blocked) return { success: false, error: blocked }
    }

    const { data, error } = await supabase
        .from("organizations")
        .update({
            name: updates.name,
            registration_id: updates.registration_id,
            base_currency: updates.base_currency,
            fiscal_year_start: updates.fiscal_year_start,
            timezone: updates.timezone
        })
        .eq("id", organization_id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update org settings:", error)
        throw new Error("Failed to update organization settings")
    }

    // Only switch the display currency once the database change has actually succeeded
    if (updates.base_currency) {
        cookieStore.set('active_org_currency', updates.base_currency, { path: '/' });
    }

    revalidatePath("/settings")
    revalidatePath("/dashboard")
    revalidatePath("/inbox")
    revalidatePath("/transactions")
    revalidatePath("/contacts")
    revalidatePath("/reports")
    return { success: true, data }
}

// --- Funds ---

export async function getSettingsFunds() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("funds")
        .select("*")
        .eq("organization_id", organization_id)
        .order("name")

    if (error) return []
    return data
}

// Spent (paid) and committed (awaiting payment) per fund, added up from document splits in Postgres.
// Used with funds.budget to show budget vs actual in Settings > Funds & Categories.
export async function getFundBudgetSummary() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    if (!organization_id) return []

    const { data, error } = await supabase.rpc("fund_budget_summary", { p_org: organization_id })
    if (error) {
        console.error("Supabase Error (getFundBudgetSummary):", error)
        return []
    }
    return ((data ?? []) as { fund_id: string; spent: unknown; committed: unknown }[]).map((r) => ({
        fund_id: String(r.fund_id),
        spent: Number(r.spent) || 0,
        committed: Number(r.committed) || 0,
    }))
}

export async function addSettingFund(name: string, code?: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    await requireFeature(supabase, organization_id, "funds", "use")

    const { error } = await supabase
        .from("funds")
        .insert({
            organization_id,
            name,
            code
        })

    if (error) {
        console.error("Supabase Error (addSettingFund):", error)
        throw new Error("Failed to add fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function archiveSettingFund(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    // Checked here as well as by the database: a refused update changes no rows without an error
    await requireFeature(supabase, organization_id, "funds", "use")

    const { error } = await supabase
        .from("funds")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", organization_id)
        .eq("is_default", false)

    if (error) {
        console.error("Supabase Error (archiveSettingFund):", error)
        throw new Error("Failed to archive fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function restoreSettingFund(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    await requireFeature(supabase, organization_id, "funds", "use")

    const { error } = await supabase
        .from("funds")
        .update({ archived_at: null })
        .eq("id", id)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Supabase Error (restoreSettingFund):", error)
        throw new Error("Failed to restore fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function updateFundDetails(id: string, rawDetails: unknown) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    await requireFeature(supabase, organization_id, "funds", "use")

    let updates: Record<string, unknown>
    try {
        updates = sanitizeFundDetails(rawDetails)
    } catch (e) {
        if (e instanceof UpdateValidationError) throw new Error(errorMessage(e))
        throw e
    }
    if (Object.keys(updates).length === 0) {
        throw new Error("Nothing to update")
    }

    const { data, error } = await supabase
        .from("funds")
        .update(updates)
        .eq("id", id)
        .eq("organization_id", organization_id)
        .select("id")

    if (error) {
        console.error("Supabase Error (updateFundDetails):", error)
        throw new Error("Failed to save fund details")
    }
    if (!data || data.length === 0) {
        throw new Error("Fund not found")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Categories ---

export async function getSettingsCategories() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("organization_id", organization_id)
        .eq("is_system", false)
        .order("kind")
        .order("sort_order")
        .order("name")

    if (error) return []
    return data
}

type CategoryResult = { success: true } | { success: false; error: string }

// Income categories belong to income tracking (a paid feature); expense categories are free
async function categoryWriteCheck(kind: string): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; organization_id: string } | { error: string }> {
    try {
        await checkWriteAccess()
    } catch {
        return { error: "Only Admins and Editors can change categories." }
    }
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    if (!organization_id) return { error: "No active organization" }
    if (kind === "income") {
        try {
            await requireFeature(supabase, organization_id, "income", "use")
        } catch (e) {
            return { error: errorMessage(e) }
        }
    }
    return { supabase, organization_id }
}

async function categoryKind(id: string): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.from("categories").select("kind").eq("id", id).maybeSingle()
    return (data?.kind as string | undefined) ?? null
}

function dbCategoryMessage(error: { code?: string; message?: string }, fallback: string): string {
    if (error.code === "23505") return "A category with this name already exists."
    const m = error.message ?? ""
    if (/in use|cannot be (edited|deleted|archived)/i.test(m)) return m
    return fallback
}

// Rename, or set the expense group / income nature. System categories are refused by the database.
export async function updateCategory(id: string, raw: unknown): Promise<CategoryResult> {
    const kind = await categoryKind(id)
    if (!kind) return { success: false, error: "That category was not found." }
    const ctx = await categoryWriteCheck(kind)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const input = (raw ?? {}) as Record<string, unknown>
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) {
        const name = typeof input.name === "string" ? input.name.trim() : ""
        if (!name || name.length > 100) return { success: false, error: "Enter a name of up to 100 characters." }
        updates.name = name
    }
    if (input.group_name !== undefined) {
        if (kind !== "expense") return { success: false, error: "Only expense categories have a group." }
        if (input.group_name === OTHER_GROUP || input.group_name === null || input.group_name === "") updates.group_name = null
        else if (isExpenseGroup(input.group_name)) updates.group_name = input.group_name
        else return { success: false, error: "Choose a valid group." }
    }
    if (input.nature !== undefined) {
        if (kind !== "income") return { success: false, error: "Only income categories have a type of income." }
        if (!isIncomeNature(input.nature)) return { success: false, error: "Choose a valid type of income." }
        updates.nature = input.nature
    }
    if (Object.keys(updates).length === 0) return { success: true }

    const { error } = await ctx.supabase.from("categories").update(updates).eq("id", id).eq("organization_id", ctx.organization_id)
    if (error) return { success: false, error: dbCategoryMessage(error, "Could not save the category.") }
    revalidatePath("/", "layout")
    return { success: true }
}

// Archived categories disappear from pickers but stay on old entries and in every report
export async function setCategoryArchived(id: string, archived: boolean): Promise<CategoryResult> {
    const kind = await categoryKind(id)
    if (!kind) return { success: false, error: "That category was not found." }
    const ctx = await categoryWriteCheck(kind)
    if ("error" in ctx) return { success: false, error: ctx.error }
    const { data, error } = await ctx.supabase
        .from("categories")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("organization_id", ctx.organization_id)
        .select("id")
    if (error) return { success: false, error: dbCategoryMessage(error, "Could not update the category.") }
    if (!data || data.length === 0) return { success: false, error: "That category was not found." }
    revalidatePath("/", "layout")
    return { success: true }
}

// Moves a category one place up or down within its kind (expense or income)
export async function moveCategory(id: string, direction: "up" | "down"): Promise<CategoryResult> {
    const kind = await categoryKind(id)
    if (!kind) return { success: false, error: "That category was not found." }
    const ctx = await categoryWriteCheck(kind)
    if ("error" in ctx) return { success: false, error: ctx.error }
    const { data: list, error } = await ctx.supabase
        .from("categories")
        .select("id, sort_order")
        .eq("organization_id", ctx.organization_id)
        .eq("kind", kind)
        .eq("is_system", false)
        .order("sort_order")
        .order("name")
    if (error || !list) return { success: false, error: "Could not reorder the categories." }
    const ids = list.map((c) => c.id as string)
    const i = ids.indexOf(id)
    const j = direction === "up" ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return { success: true }
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    // Renumber 10, 20, 30... and save only the rows whose position changed
    const before = new Map(list.map((c) => [c.id as string, c.sort_order as number]))
    for (const [n, cid] of ids.entries()) {
        const order = (n + 1) * 10
        if (before.get(cid) === order) continue
        const { error: e } = await ctx.supabase.from("categories").update({ sort_order: order }).eq("id", cid).eq("organization_id", ctx.organization_id)
        if (e) return { success: false, error: "Could not reorder the categories." }
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// Adds a category. Expense categories may have a group; income categories need a type of income
// (nature), which drives the "Donation / Other income" choice and the Income & Expenditure grouping.
export async function addSettingCategory(name: string, options: { kind?: "income" | "expense"; nature?: string | null; group_name?: string | null } = {}): Promise<CategoryResult> {
    const kind = options.kind === "income" ? "income" : "expense"
    const ctx = await categoryWriteCheck(kind)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const cleanName = (name ?? "").trim()
    if (!cleanName || cleanName.length > 100) return { success: false, error: "Enter a name of up to 100 characters." }
    const row: Record<string, unknown> = { organization_id: ctx.organization_id, name: cleanName, kind, sort_order: 1000 }
    if (kind === "income") {
        if (!isIncomeNature(options.nature)) return { success: false, error: "Choose a type of income." }
        row.nature = options.nature
    } else if (options.group_name && options.group_name !== OTHER_GROUP) {
        if (!isExpenseGroup(options.group_name)) return { success: false, error: "Choose a valid group." }
        row.group_name = options.group_name
    }

    const { error } = await ctx.supabase.from("categories").insert(row)
    if (error) {
        if (error.code !== "23505") console.error("Supabase Error (addSettingCategory):", error)
        return { success: false, error: dbCategoryMessage(error, "Could not add the category.") }
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// The account code from the organisation's chart of accounts (for example "6100"). The accounting
// export writes it into the AccountCode column. Empty clears it.
async function updateCategoryAccountCodeOrThrow(id: string, code: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const cleaned = String(code ?? "").trim()
    if (cleaned !== "" && !/^[A-Za-z0-9._\/ -]{1,30}$/.test(cleaned)) {
        throw new Error("Account codes can use letters, numbers, dots, dashes and slashes (up to 30 characters)")
    }

    const { data, error } = await supabase
        .from("categories")
        .update({ account_code: cleaned === "" ? null : cleaned })
        .eq("id", id)
        .eq("organization_id", organization_id)
        .select("id")

    if (error) {
        console.error("Supabase Error (updateCategoryAccountCode):", error)
        throw new Error("Failed to save the account code")
    }
    if (!data || data.length === 0) throw new Error("Category not found")
    revalidatePath("/settings")
    return { success: true }
}

// Errors thrown from a server action are hidden from the browser in production, so the reason is returned.
export async function updateCategoryAccountCode(id: string, code: string): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await updateCategoryAccountCodeOrThrow(id, code)
        return { success: true }
    } catch (e) {
        return { success: false, error: errorMessage(e) || "Failed to save the account code" }
    }
}

// Deletes a category nothing uses. One in use is refused by the database (archive it instead).
export async function deleteSettingCategory(id: string): Promise<CategoryResult> {
    const kind = await categoryKind(id)
    if (!kind) return { success: false, error: "That category was not found." }
    const ctx = await categoryWriteCheck(kind)
    if ("error" in ctx) return { success: false, error: ctx.error }

    const { data, error } = await ctx.supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("organization_id", ctx.organization_id)
        .eq("is_system", false)
        .select("id")

    if (error) {
        if (error.code !== "P0001") console.error("Supabase Error (deleteSettingCategory):", error)
        return { success: false, error: dbCategoryMessage(error, "Could not delete the category.") }
    }
    if (!data || data.length === 0) return { success: false, error: "That category was not found." }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Team Management ---

export async function getTeamMembers() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (!organization_id) {
        return []
    }

    // 1. Fetch active members
    const { data: activeMembers, error: activeError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at")

    if (activeError) {
        console.error("Failed to fetch active team members:", activeError)
    }

    // 2. Fetch pending invites using the admin client to bypass RLS
    const adminClient = createAdminClient()
    const { data: pendingInvites, error: pendingError } = await adminClient
        .from("workspace_invites")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at")

    if (pendingError) {
        console.error("Failed to fetch pending workspace invites:", pendingError)
    }

    const activeList = activeMembers || []
    const pendingList = ((pendingInvites || []) as InviteRow[]).map((invite) => ({
        id: invite.id,
        organization_id: invite.organization_id,
        email: invite.email,
        role: invite.role,
        full_name: null, // renders as "Pending Invite" in frontend
        created_at: invite.created_at,
        is_pending: true
    }))

    return [...activeList, ...pendingList]
}

export async function inviteTeamMember(email: string, full_name: string, role: string) {
    const currentUserRole = await checkWriteAccess();
    if (currentUserRole !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can invite team members.");
    }
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // Validate the requested role. Admin can only be created by the system initially.
    if (role !== "Editor" && role !== "Viewer") {
        role = "Viewer";
    }

    // 1. Check if user is already an active member of this organization
    const { data: existingMember, error: memberCheckError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("email", email)
        .maybeSingle()

    if (memberCheckError) {
        console.error("Error checking existing members:", memberCheckError)
    }

    if (existingMember) {
        return {
            success: false,
            error: "ALREADY_MEMBER",
            message: "This email is already a member of this workspace."
        }
    }

    // 2. Check if user already has a pending invite for this organization
    const adminClient = createAdminClient()
    const { data: existingInvite, error: inviteCheckError } = await adminClient
        .from("workspace_invites")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("email", email)
        .maybeSingle()

    if (inviteCheckError) {
        console.error("Error checking existing invites:", inviteCheckError)
    }

    if (existingInvite) {
        return {
            success: false,
            error: "ALREADY_INVITED",
            message: "An invitation has already been sent to this email address."
        }
    }

    // 3. Determine tier and seat limits
    // Same paid rule as every other feature (status pro, or tier growth/nonprofit)
    const isGrowth = (await getPlanState(supabase, organization_id)).paid;

    const limit = isGrowth ? 5 : 1;

    // 4. Count existing active members
    const { data: members, error: countError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("organization_id", organization_id)

    if (countError) {
        console.error("Failed to verify team size:", countError)
        throw new Error("Failed to verify team size")
    }

    // 5. Count existing pending invites
    const { count: pendingCount, error: pendingCountError } = await adminClient
        .from("workspace_invites")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)

    if (pendingCountError) {
        console.error("Failed to verify pending invites count:", pendingCountError)
        throw new Error("Failed to verify pending invites count")
    }

    const totalSeatsUsed = (members?.length || 0) + (pendingCount || 0)

    // 6. Block if total seats used (active + pending) exceeds limits
    if (totalSeatsUsed >= limit) {
        return {
            success: false,
            error: "LIMIT_REACHED",
            message: `You have reached your seat limit of ${limit} members. Please upgrade your subscription to add more.`
        }
    }

    // 7. Store the invite relation in workspace_invites
    const { error: dbInviteError } = await adminClient
        .from("workspace_invites")
        .insert({
            organization_id,
            email,
            role
        })

    if (dbInviteError) {
        if (dbInviteError.code === "23505") {
            return {
                success: false,
                error: "ALREADY_INVITED",
                message: "An invitation has already been sent to this email address."
            }
        }
        console.error("Failed to save invitation to database:", dbInviteError)
        throw new Error("Failed to create invitation: " + dbInviteError.message)
    }

    // 8. Call Supabase Auth admin API to invite user
    let isAlreadyRegistered = false
    try {
        const headersList = await headers()
        const host = headersList.get("host") || "localhost:3000"
        const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
        const redirectTo = `${protocol}://${host}/accept-invite`

        const { error: authInviteError } = await adminClient.auth.admin.inviteUserByEmail(
            email,
            { redirectTo }
        )

        if (authInviteError) {
            if (authInviteError.message.toLowerCase().includes("already") && authInviteError.message.toLowerCase().includes("registered")) {
                isAlreadyRegistered = true
            } else {
                console.error("Supabase Admin Auth invite error:", authInviteError)
                // Roll back database invite entry
                await adminClient
                    .from("workspace_invites")
                    .delete()
                    .eq("organization_id", organization_id)
                    .eq("email", email)

                throw new Error(authInviteError.message)
            }
        }
    } catch (inviteErr) {
        if (errorMessage(inviteErr).toLowerCase().includes("already") && errorMessage(inviteErr).toLowerCase().includes("registered")) {
            isAlreadyRegistered = true
        } else {
            throw new Error("Failed to dispatch auth invitation email: " + errorMessage(inviteErr))
        }
    }

    revalidatePath("/settings")
    if (isAlreadyRegistered) {
        return {
            success: true,
            message: "This user already has an Outlayd account. They'll see an invitation to accept the next time they open Outlayd."
        }
    }
    return { success: true }
}

export async function revokeTeamMember(memberId: string) {
    const role = await getCurrentUserRole();
    if (role !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can revoke team member access.");
    }
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (!currentUser || !currentUser.email) {
        throw new Error("Authentication required")
    }

    const organization_id = await getOrganizationId()
    const adminClient = createAdminClient()

    // 1. Try deleting from workspace_invites first (pending invites) using the admin client to bypass RLS
    const { data: inviteDeleted, error: inviteDeleteError } = await adminClient
        .from("workspace_invites")
        .delete()
        .eq("id", memberId)
        .eq("organization_id", organization_id)
        .select()

    let deletedEmail: string | null = null

    if (inviteDeleted && inviteDeleted.length > 0) {
        deletedEmail = inviteDeleted[0].email
    } else {
        // 2. If no invite was deleted, delete from user_roles (active members)
        // Find the active member first to get their email and verify it's not the current user
        const { data: activeMember } = await supabase
            .from("user_roles")
            .select("email")
            .eq("id", memberId)
            .eq("organization_id", organization_id)
            .single()

        if (activeMember?.email) {
            deletedEmail = activeMember.email

            // Guard: Prevent self-revocation
            if (activeMember.email.toLowerCase() === currentUser.email.toLowerCase()) {
                throw new Error("You cannot revoke your own access to the workspace.")
            }

            const { error: roleDeleteError } = await supabase
                .from("user_roles")
                .delete()
                .eq("id", memberId)
                .eq("organization_id", organization_id)

            if (roleDeleteError) {
                console.error("Failed to revoke active team member:", roleDeleteError)
                throw new Error("Failed to revoke team member: " + roleDeleteError.message)
            }
        }
    }

    revalidatePath("/settings")
    return { success: true }
}

export async function acceptInvite(password: string, fullName: string) {
    const supabase = await createClient()

    // 1. Get currently authenticated user (invited link login)
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user || !user.email) {
        return { success: false, error: "AUTH_REQUIRED", message: "You must use the secure link sent to your email to accept this invite." }
    }

    // The session must belong to a verified email (the person really opened the emailed link)
    if (!user.email_confirmed_at) {
        return { success: false, error: "EMAIL_NOT_VERIFIED", message: "Please verify your email address using the link we sent you." }
    }

    // 2. Fetch pending invite from workspace_invites using admin client
    const adminClient = createAdminClient()
    const { data: invite, error: inviteError } = await adminClient
        .from("workspace_invites")
        .select("*")
        .ilike("email", user.email.replace(/[\\%_]/g, (c) => "\\" + c))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (inviteError || !invite) {
        console.error("Invite record look up failed:", inviteError)
        return { success: false, error: "INVITE_NOT_FOUND", message: "No active workspace invitation was found for your email address." }
    }

    // Invites expire after 7 days
    const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
    if (!invite.created_at || Date.now() - new Date(invite.created_at).getTime() > INVITE_TTL_MS) {
        await adminClient.from("workspace_invites").delete().eq("id", invite.id)
        return { success: false, error: "INVITE_EXPIRED", message: "This invitation has expired. Ask your workspace admin to send a new one." }
    }
    const { organization_id, role } = invite

    // 3. Set the password and user full name
    const { error: authUpdateError } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName }
    })

    if (authUpdateError) {
        return { success: false, error: "PASSWORD_UPDATE_FAILED", message: authUpdateError.message }
    }

    // 4. Update the user metadata via Admin client (keep onboarding_completed, but avoid overwriting organization_id)
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(
        user.id,
        { user_metadata: { onboarding_completed: true } }
    )

    if (metadataError) {
        console.error("Failed to update organization metadata on user auth:", metadataError)
    }

    // Set active workspace cookie client-side
    const cookieStore = await cookies()
    cookieStore.set('active_org_id', organization_id, { path: '/' })

    // 5. Insert active role mapped to user_roles
    const { error: roleInsertError } = await adminClient
        .from("user_roles")
        .insert({
            organization_id,
            email: user.email,
            role,
            full_name: fullName
        })

    if (roleInsertError) {
        console.error("Failed to insert mapping inside user_roles table:", roleInsertError)
        return { success: false, error: "ROLE_ASSIGNMENT_FAILED", message: "Failed to map user access: " + roleInsertError.message }
    }

    // 6. Cleanup workspace_invites record
    await adminClient
        .from("workspace_invites")
        .delete()
        .eq("id", invite.id)

    revalidatePath("/settings")
    return { success: true }
}

// --- Invites for people who already have an Outlayd account ---

export async function getMyPendingInvites() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !user.email_confirmed_at) return []

    const adminClient = createAdminClient()
    const { data: invites, error } = await adminClient
        .from("workspace_invites")
        .select("id, organization_id, role, created_at")
        .ilike("email", user.email.replace(/[\\%_]/g, (c) => "\\" + c))
        .order("created_at", { ascending: false })
    if (error || !invites || invites.length === 0) return []

    const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
    const live = (invites as InviteRow[]).filter((i) => i.created_at && Date.now() - new Date(i.created_at).getTime() <= INVITE_TTL_MS)
    if (live.length === 0) return []

    const { data: orgs } = await adminClient
        .from("organizations")
        .select("id, name")
        .in("id", live.map((i) => i.organization_id))
    const orgNames = new Map<string, string>(((orgs ?? []) as IdName[]).map((o) => [o.id, o.name]))

    return live.map((i) => ({
        id: i.id as string,
        role: i.role as string,
        organization_name: orgNames.get(i.organization_id) || "a workspace",
    }))
}

export async function acceptPendingInvite(inviteId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { success: false, message: "Please sign in again." }
    if (!user.email_confirmed_at) return { success: false, message: "Please verify your email address first." }

    const adminClient = createAdminClient()
    const { data: invite } = await adminClient
        .from("workspace_invites")
        .select("*")
        .eq("id", inviteId)
        .maybeSingle()

    // The invite must be addressed to exactly this account
    if (!invite || String(invite.email).toLowerCase() !== user.email.toLowerCase()) {
        return { success: false, message: "This invitation was not found." }
    }

    const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
    if (!invite.created_at || Date.now() - new Date(invite.created_at).getTime() > INVITE_TTL_MS) {
        await adminClient.from("workspace_invites").delete().eq("id", invite.id)
        return { success: false, message: "This invitation has expired. Ask your workspace admin to send a new one." }
    }

    const { data: existing } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("organization_id", invite.organization_id)
        .eq("email", user.email)
        .maybeSingle()

    if (!existing) {
        const { error: roleError } = await adminClient.from("user_roles").insert({
            organization_id: invite.organization_id,
            email: user.email,
            role: invite.role,
            full_name: user.user_metadata?.full_name || user.email.split("@")[0],
        })
        if (roleError) {
            console.error("Failed to add user_roles row for accepted invite:", roleError)
            return { success: false, message: "Could not join the workspace. Please try again." }
        }
    }

    await adminClient.from("workspace_invites").delete().eq("id", invite.id)

    const cookieStore = await cookies()
    cookieStore.set("active_org_id", invite.organization_id, { path: "/" })
    cookieStore.delete("active_org_currency") // belongs to the previous workspace; it is re-read from the database
    revalidatePath("/", "layout")
    return { success: true }
}

export async function declinePendingInvite(inviteId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { success: false, message: "Please sign in again." }

    const adminClient = createAdminClient()
    const { data: invite } = await adminClient
        .from("workspace_invites")
        .select("id, email")
        .eq("id", inviteId)
        .maybeSingle()
    if (!invite || String(invite.email).toLowerCase() !== user.email.toLowerCase()) {
        return { success: false, message: "This invitation was not found." }
    }

    await adminClient.from("workspace_invites").delete().eq("id", invite.id)
    revalidatePath("/", "layout")
    return { success: true }
}

export async function getMyWorkspaces() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { workspaces: [] as { id: string; name: string; role: string }[], activeId: null as string | null }

    const adminClient = createAdminClient()
    const { data: roles } = await adminClient
        .from("user_roles")
        .select("organization_id, role")
        .eq("email", user.email)
        .order("created_at", { ascending: true })

    const roleRows = (roles ?? []) as { organization_id: string; role: string }[]
    const ids = roleRows.map((r) => r.organization_id)
    if (ids.length === 0) return { workspaces: [], activeId: null }

    const { data: orgs } = await adminClient.from("organizations").select("id, name").in("id", ids)
    const names = new Map<string, string>(((orgs ?? []) as IdName[]).map((o) => [o.id, o.name]))

    return {
        workspaces: roleRows.map((r) => ({
            id: r.organization_id as string,
            name: names.get(r.organization_id) || "Workspace",
            role: r.role as string,
        })),
        activeId: await getOrganizationId(),
    }
}

export async function switchWorkspace(organizationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { success: false, message: "Please sign in again." }

    const adminClient = createAdminClient()
    const { data: membership } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("email", user.email)
        .eq("organization_id", organizationId)
        .maybeSingle()
    if (!membership) return { success: false, message: "You are not a member of that workspace." }

    const cookieStore = await cookies()
    cookieStore.set("active_org_id", organizationId, { path: "/" })
    cookieStore.delete("active_org_currency") // belongs to the previous workspace; it is re-read from the database
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Subscription / Upgrade ---

export async function verifyCheckoutSession(sessionId: string) {
    const organization_id = await getOrganizationId()

    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid' && session.metadata?.organization_id === organization_id) {
            const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null;
            const tier = session.metadata?.tier || 'growth';
            // Billing changes are server-only: the RPC is no longer callable with the user's session.
            const adminClient = createAdminClient();
            const { error } = await adminClient
                .rpc('upgrade_org_to_pro', {
                    org_id: organization_id,
                    p_tier: tier,
                    p_customer_id: customerId
                });

            if (error) {
                console.error('Error upgrading org from client verify via RPC:', error);
                // Fallback: direct update via admin client
                await adminClient.from('organizations').update({
                    subscription_status: 'pro',
                    subscription_tier: tier,
                    stripe_customer_id: customerId || undefined,
                    cancel_at_period_end: false,
                    subscription_end_date: null
                }).eq('id', organization_id);
            }

            revalidatePath("/", "layout")
            return { success: true };
        }

    } catch (e) {
        console.error("verifyCheckoutSession error:", e)
    }

    return { success: false };
}

export async function deleteOrganizationAccount() {
    const role = await checkWriteAccess();
    if (role !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can delete the organization account.");
    }
    const organization_id = await getOrganizationId();
    if (!organization_id) {
        throw new Error("No active organization");
    }

    const adminClient = createAdminClient();
    const { data: org, error: orgError } = await adminClient
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', organization_id)
        .single();

    if (orgError) {
        console.error("Failed to fetch organization for deletion:", orgError);
        throw new Error("Failed to delete organization: data fetch failed");
    }

    // 1. Cancel every live Stripe subscription FIRST. If this fails, nothing has been deleted yet.
    if (org?.stripe_customer_id) {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error("Billing is not configured, so the subscription cannot be cancelled. Nothing was deleted.");
        }
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2026-02-25.clover',
        });
        try {
            const subscriptions = await stripe.subscriptions.list({
                customer: org.stripe_customer_id,
                status: 'all',
                limit: 100,
            });
            for (const sub of subscriptions.data) {
                if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
                    await stripe.subscriptions.cancel(sub.id);
                    console.log(`Cancelled Stripe subscription ${sub.id}`);
                }
            }
        } catch (stripeError) {
            // A customer from another Stripe environment (test vs live) has nothing to cancel here
            if (errorProp(stripeError, "code") !== 'resource_missing') {
                console.error("Stripe subscription cancellation failed during account deletion:", stripeError);
                throw new Error("Could not cancel the subscription. Nothing was deleted. Please try again.");
            }
        }
    }

    // 2. Work out which logins to remove: only people who belong to NO other organisation
    const { data: memberRows, error: memberErr } = await adminClient
        .from("user_roles").select("email").eq("organization_id", organization_id);
    const { data: inviteRows, error: inviteErr } = await adminClient
        .from("workspace_invites").select("email").eq("organization_id", organization_id);
    if (memberErr || inviteErr) {
        throw new Error("Could not read team members. Nothing was deleted.");
    }

    const candidates = [...new Set(
        [...(memberRows ?? []), ...(inviteRows ?? [])]
            .map((r: { email: string | null }) => String(r.email || "").trim().toLowerCase())
            .filter(Boolean)
    )];
    // Anything unusual is left alone rather than risk deleting the wrong login
    const safeCandidates = candidates.filter((e) => /^[a-z0-9._+\-]+@[a-z0-9.\-]+$/.test(e));

    let emailsToDelete: string[] = [];
    if (safeCandidates.length > 0) {
        const orFilter = safeCandidates.map((e) => `email.ilike.${e}`).join(",");
        const [otherRoles, otherInvites] = await Promise.all([
            adminClient.from("user_roles").select("email").neq("organization_id", organization_id).or(orFilter),
            adminClient.from("workspace_invites").select("email").neq("organization_id", organization_id).or(orFilter),
        ]);
        if (otherRoles.error || otherInvites.error) {
            throw new Error("Could not verify other memberships. Nothing was deleted.");
        }
        const keep = new Set(
            [...(otherRoles.data ?? []), ...(otherInvites.data ?? [])]
                .map((r: { email: string | null }) => String(r.email || "").trim().toLowerCase())
        );
        emailsToDelete = safeCandidates.filter((e) => !keep.has(e));
    }

    // 3. Collect every uploaded file: this org's folder plus older files referenced by URL
    const storage = adminClient.storage.from("receipts");
    const filePaths = new Set<string>();

    // (Money-in and invoice attachments sit in subfolders the folder listing below does not reach, so list them here)
    for (const [table, column] of [["documents", "image_url"], ["quotes", "file_url"], ["transactions", "attachment_url"], ["invoices", "attachment_url"]] as const) {
        let from = 0;
        while (true) {
            const { data, error } = await adminClient
                .from(table)
                .select(column)
                .eq("organization_id", organization_id)
                .range(from, from + 999);
            if (error) {
                throw new Error("Could not list uploaded files. Nothing was deleted.");
            }
            for (const row of (data ?? []) as Record<string, unknown>[]) {
                const path = row[column] ? toStoragePath(String(row[column])) : null;
                if (path && !path.includes("..")) filePaths.add(path);
            }
            if (!data || data.length < 1000) break;
            from += 1000;
        }
    }

    let offset = 0;
    while (true) {
        const { data, error } = await storage.list(organization_id, { limit: 1000, offset });
        if (error || !data || data.length === 0) break;
        for (const file of data) filePaths.add(`${organization_id}/${file.name}`);
        if (data.length < 1000) break;
        offset += 1000;
    }

    // 4. Delete all organisation data in one database transaction (all or nothing)
    const { error: deleteError } = await adminClient.rpc("delete_organization_data", { p_org_id: organization_id });
    if (deleteError) {
        console.error("Failed to delete organization data:", deleteError);
        throw new Error(`Failed to delete organization: ${deleteError.message}`);
    }

    // 5. Remove uploaded files (best effort: the data is already gone)
    const allPaths = [...filePaths];
    for (let i = 0; i < allPaths.length; i += 100) {
        const { error } = await storage.remove(allPaths.slice(i, i + 100));
        if (error) console.error("Failed to remove some uploaded files:", error);
    }

    // 6. Remove logins that belong to no other organisation (best effort)
    for (const email of emailsToDelete) {
        try {
            const { data: userId, error: rpcError } = await adminClient.rpc('get_user_id_by_email', {
                email_address: email
            });
            if (rpcError || !userId) continue;
            const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
            if (deleteAuthError) console.error(`Failed to delete login ${email}:`, deleteAuthError);
        } catch (err) {
            console.error(`Error deleting login ${email}:`, err);
        }
    }

    // 7. Clear active organization cookie
    const cookieStore = await cookies();
    cookieStore.set('active_org_id', '', { maxAge: 0, path: '/' });

    return { success: true };
}