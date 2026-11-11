"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import {
    sanitizeDocumentUpdates,
    assertOwnedIds,
    UpdateValidationError,
} from "@/utils/sanitize-updates"

export async function getOrganizationId() {
    // 1. Check local dev override
    if (process.env.NODE_ENV === 'development') {
        const cookieStore = await cookies();
        const devOrgId = cookieStore.get('dev_org_id')?.value;
        if (devOrgId && devOrgId !== 'null' && devOrgId !== 'undefined' && devOrgId !== '') {
            if (devOrgId === '11111111-1111-1111-1111-111111111111') return '00000000-0000-0000-0000-000000000000';
            return devOrgId;
        }
    }

    // 2. Standard Session Auth
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
    } catch (e: any) {
        // Rethrow Next.js redirect exceptions so they aren't swallowed by our try-catch block
        if (e && e.digest && e.digest.startsWith("NEXT_REDIRECT")) {
            throw e;
        }
        console.error("Error in getOrganizationId:", e);
        return null;
    }
}

export async function getCurrentUserRole() {
    // 1. Check local dev override
    if (process.env.NODE_ENV === 'development') {
        const cookieStore = await cookies();
        const devRole = cookieStore.get('dev_user_role')?.value;
        if (devRole) return devRole;
    }

    // 2. Standard Session Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
        if (process.env.NODE_ENV === 'development') return 'Admin';
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

        if (process.env.NODE_ENV === 'development') {
            return 'Admin';
        }

        return null;
    } catch (e: any) {
        console.error("Error in getCurrentUserRole:", e);
        if (process.env.NODE_ENV === 'development') {
            return 'Admin';
        }
        return null;
    }
}


export async function updateDocument(id: string, rawUpdates: unknown) {
    await checkWriteAccess();
    const supabase = await createClient()

    let updates: Record<string, any>
    try {
        updates = sanitizeDocumentUpdates(rawUpdates)

        const splits = Array.isArray(updates.splits) ? updates.splits : []
        await assertOwnedIds(supabase, "vendors", [updates.vendor_id])
        await assertOwnedIds(supabase, "funds", [updates.fund_id, ...splits.map((s: any) => s?.fund_id)])
        await assertOwnedIds(supabase, "categories", [updates.category_id, ...splits.map((s: any) => s?.category_id)])
    } catch (e) {
        if (e instanceof UpdateValidationError) {
            return { success: false, error: e.message }
        }
        throw e
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

    revalidatePath("/ledger")
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

    // 1. Check cookies (both active org currency and dev override)
    const activeCurrency = cookieStore.get('active_org_currency')?.value;
    if (activeCurrency) return activeCurrency;

    if (process.env.NODE_ENV === 'development') {
        const devCurrency = cookieStore.get('dev_org_currency')?.value;
        if (devCurrency) return devCurrency;
    }

    // 2. Query from Supabase organizations table using current orgId
    try {
        const orgId = await getOrganizationId();
        if (orgId) {
            // Local dev fallback check
            if (process.env.NODE_ENV === 'development' && orgId === '00000000-0000-0000-0000-000000000000') {
                const devCurrency = cookieStore.get('dev_org_currency')?.value;
                if (devCurrency) return devCurrency;
            }

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