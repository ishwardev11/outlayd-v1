"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

export async function getOrganizationId() {
    // 1. Check local dev override
    if (process.env.NODE_ENV === 'development') {
        const cookieStore = await cookies();
        const devOrgId = cookieStore.get('dev_org_id')?.value;
        if (devOrgId) {
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

        const { createAdminClient } = await import("@/utils/supabase/admin")
        const adminClient = createAdminClient()

        // 1. If activeOrgId cookie exists, verify the user is a member of this organization
        if (activeOrgId) {
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
            cookieStore.set('active_org_id', firstOrgId, { path: '/' });
            return firstOrgId;
        }

        // 3. Fallback: Query metadata organization_id
        if (user.user_metadata?.organization_id) {
            return user.user_metadata.organization_id;
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
        // If not explicitly set in dev, assume Admin to allow access
        return 'Admin';
    }

    // 2. Standard Session Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) return null;

    try {
        const { createAdminClient } = await import("@/utils/supabase/admin")
        const adminClient = createAdminClient()
        const { data: roleData } = await adminClient
            .from('user_roles')
            .select('role')
            .eq('email', user.email)
            .maybeSingle();

        if (roleData?.role) {
            return roleData.role;
        }

        return null;
    } catch (e: any) {
        console.error("Error in getCurrentUserRole:", e);
        return null;
    }
}


export async function updateDocument(id: string, updates: any) {
    await checkWriteAccess();
    const supabase = await createClient()

    // Automatically link vendor_id if editing the vendor_name manually in the UI
    if (updates.vendor_name && !updates.vendor_id) {
        const { data: vendor } = await supabase
            .from("vendors")
            .select("id")
            .ilike("name", updates.vendor_name)
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
    if (role === 'Viewer') {
        throw new Error("Unauthorized: Viewers cannot perform this action.");
    }
    return role;
}

