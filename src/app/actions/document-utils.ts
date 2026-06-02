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
        if (user.user_metadata?.organization_id) {
            return user.user_metadata.organization_id;
        }

        // Secure fallback: Query user_roles table based on email
        const { data: roleData } = await supabase
            .from('user_roles')
            .select('organization_id')
            .eq('email', user.email)
            .single();

        if (roleData?.organization_id) {
            return roleData.organization_id;
        }

        return null;
    } catch (e) {
        console.error("Error in getOrganizationId:", e);
        return null;
    }
}

export async function updateDocument(id: string, updates: any) {
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
