"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { foreignApprovalProblem } from "@/utils/fx"
import { DEFAULT_TIMEZONE, isValidTimezone, todayInTimezone } from "@/utils/dates"
import { errorMessage, errorProp, type SplitRow } from "@/utils/row-types";
import {
    sanitizeDocumentUpdates,
    assertOwnedIds,
    UpdateValidationError,
} from "@/utils/sanitize-updates"

export async function getOrganizationId() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null;

    try {
        const cookieStore = await cookies();
        const activeOrgId = cookieStore.get('active_org_id')?.value;
        const isValidActiveOrg = activeOrgId && activeOrgId !== 'null' && activeOrgId !== 'undefined' && activeOrgId !== '';

        const { createAdminClient } = await import("@/utils/supabase/admin")
        const adminClient = createAdminClient()

        // 1. If activeOrgId cookie exists, verify the user is a member of this organization
        if (isValidActiveOrg) {
            const { data: roleData } = await adminClient
                .from('user_roles')
                .select('organization_id')
                .eq('email', user.email)
                .eq('organization_id', activeOrgId)
                .maybeSingle();

            if (roleData?.organization_id) {
                return roleData.organization_id;
            }
        }

        // 2. Fallback: Query first organization they belong to in user_roles
        const { data: userRoles } = await adminClient
            .from('user_roles')
            .select('organization_id')
            .eq('email', user.email)
            .order('created_at', { ascending: true })
            .limit(1);

        if (userRoles && userRoles.length > 0) {
            const firstOrgId = userRoles[0].organization_id;
            try {
                cookieStore.set('active_org_id', firstOrgId, { path: '/' });
            } catch {
                // Ignore cookie setting errors when called during Server Component rendering
            }
            return firstOrgId;
        }
        if (!user.email) {
            return null;
        }
        // Check if there is a pending workspace invite for this user's email
        const { data: invite } = await adminClient
            .from("workspace_invites")
            .select("*")
            .eq("email", user.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (invite) {
            // User has a pending invite, force them to set a password and join properly
            const { redirect } = await import("next/navigation")
            redirect("/accept-invite")
        }

        return null;
    } catch (e) {
        // Rethrow Next.js redirect exceptions so they aren't swallowed by our try-catch block
        const digest = errorProp(e, "digest");
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
            throw e;
        }
        console.error("Error in getOrganizationId:", e);
        return null;
    }
}

export async function getCurrentUserRole() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
        return null;
    }

    try {
        const { createAdminClient } = await import("@/utils/supabase/admin")
        const adminClient = createAdminClient()

        const cookieStore = await cookies();
        const activeOrgId = cookieStore.get('active_org_id')?.value;

        let query = adminClient
            .from('user_roles')
            .select('role')
            .eq('email', user.email);

        if (activeOrgId && activeOrgId !== 'null' && activeOrgId !== 'undefined' && activeOrgId !== '') {
            query = query.eq('organization_id', activeOrgId);
        }

        const { data: roleRows } = await query
            .order('created_at', { ascending: true })
            .limit(1);

        if (roleRows && roleRows.length > 0 && roleRows[0].role) {
            return roleRows[0].role;
        }

        return null;
    } catch (e) {
        console.error("Error in getCurrentUserRole:", e);
        return null;
    }
}


export async function updateDocument(id: string, rawUpdates: unknown) {
    await checkWriteAccess();
    const supabase = await createClient()

    let updates: Record<string, unknown>
    try {
        updates = sanitizeDocumentUpdates(rawUpdates)

        const splits = Array.isArray(updates.splits) ? updates.splits : []
        await assertOwnedIds(supabase, "vendors", [updates.vendor_id])
        await assertOwnedIds(supabase, "funds", [updates.fund_id, ...splits.map((s: SplitRow | null) => s?.fund_id)])
        await assertOwnedIds(supabase, "categories", [updates.category_id, ...splits.map((s: SplitRow | null) => s?.category_id)])
    } catch (e) {
        if (e instanceof UpdateValidationError) {
            return { success: false, error: errorMessage(e) }
        }
        throw e
    }

    // A foreign-currency document needs an exchange rate before it can be approved or paid,
    // otherwise its amount would be counted as if it were in the base currency.
    if (updates.status === "paid" || updates.status === "awaiting_payment") {
        const { data: current, error: currentError } = await supabase
            .from("documents")
            .select("amount, original_currency, original_amount, exchange_rate, status, document_type, document_date")
            .eq("id", id)
            .maybeSingle()
        if (currentError) {
            console.error("Error checking document currency:", currentError)
            return { success: false, error: "Could not check this document's currency. Please try again." }
        }
        if (!current) return { success: false, error: "Document not found" }

        const problem = foreignApprovalProblem({ ...current, ...updates }, await getOrganizationCurrency())
        if (problem) return { success: false, error: problem }

        // Record the payment date. Only stamp it when the document BECOMES paid, so
        // re-saving an already-paid document doesn't move its date.
        if (updates.status === "paid") {
            if (current.status !== "paid") {
                const merged: Record<string, unknown> = { ...current, ...updates }
                // A receipt is proof the payment already happened, so its own date is the payment date.
                const receiptDate =
                    merged.document_type === "receipt" &&
                    typeof merged.document_date === "string" &&
                    /^\d{4}-\d{2}-\d{2}/.test(merged.document_date)
                        ? merged.document_date.slice(0, 10)
                        : null
                updates.paid_date = receiptDate ?? todayInTimezone(await getOrganizationTimezone())
            }
        } else {
            updates.paid_date = null // moved back to awaiting payment
        }
    }

    // Automatically link vendor_id if editing the vendor_name manually in the UI
    if (updates.vendor_name && !updates.vendor_id) {
        const { data: vendor } = await supabase
            .from("vendors")
            .select("id")
            .ilike("name", String(updates.vendor_name).replace(/[\\%_]/g, (c) => "\\" + c))
            .single()

        if (vendor) {
            updates.vendor_id = vendor.id
        }
    }

    const { data, error } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", id)
        .select()

    if (error) {
        console.error("Error updating document:", error)
        return { success: false, error: error.message || "Failed to update document" }
    }

    revalidatePath("/inbox")
    revalidatePath("/transactions")
    revalidatePath("/")
    revalidatePath("/vendors")
    revalidatePath("/reports")
    return { success: true, data }
}

export async function checkWriteAccess() {
    const role = await getCurrentUserRole();
    if (role !== 'Admin' && role !== 'Editor') {
        throw new Error("Unauthorized: You do not have permission to perform this action.");
    }
    return role;
}

export async function getOrganizationCurrency(): Promise<string> {
    const cookieStore = await cookies();

    // 1. Fast path: the currency cached in a cookie for the active organisation
    const activeCurrency = cookieStore.get('active_org_currency')?.value;
    if (activeCurrency) return activeCurrency;

    // 2. Query from Supabase organizations table using current orgId
    try {
        const orgId = await getOrganizationId();
        if (orgId) {
            const { createAdminClient } = await import("@/utils/supabase/admin");
            const adminClient = createAdminClient();
            const { data: org } = await adminClient
                .from("organizations")
                .select("base_currency")
                .eq("id", orgId)
                .maybeSingle();

            if (org?.base_currency) {
                return org.base_currency;
            }
        }
    } catch (e) {
        console.error("Error fetching organization currency:", e);
    }

    return "MYR";
}
export async function getOrganizationTimezone(): Promise<string> {
    try {
        const orgId = await getOrganizationId();
        if (orgId) {
            const supabase = await createClient();
            const { data } = await supabase
                .from("organizations")
                .select("timezone")
                .eq("id", orgId)
                .maybeSingle();
            if (data?.timezone && isValidTimezone(data.timezone)) return data.timezone;
        }
    } catch (e) {
        console.error("Error fetching organization timezone:", e);
    }
    return DEFAULT_TIMEZONE;
}
