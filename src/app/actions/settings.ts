"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId } from "./document-utils"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import Stripe from 'stripe';
import { TEMPLATES } from "@/utils/templates"

// --- Organization Profile ---

export async function getOrganizationSettings() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // Local dev fallback
    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const orgName = cookieStore.get('dev_org_name')?.value || "Local Dev Organization";
        const baseCurrency = cookieStore.get('dev_org_currency')?.value || "USD";
        const fiscalYearStart = parseInt(cookieStore.get('dev_org_fiscal_year')?.value || "1", 10);

        return {
            id: organization_id,
            name: orgName,
            base_currency: baseCurrency,
            fiscal_year_start: fiscalYearStart,
            registration_id: "",
            subscription_status: cookieStore.get('dev_org_status')?.value || "pro",
            cancel_at_period_end: cookieStore.get('dev_org_cancelled')?.value === 'true',
            subscription_end_date: cookieStore.get('dev_org_end_date')?.value || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
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

export async function updateOrganizationSettings(updates: any) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        if (updates.name) cookieStore.set('dev_org_name', updates.name, { path: '/' });
        if (updates.base_currency) cookieStore.set('dev_org_currency', updates.base_currency, { path: '/' });
        if (updates.fiscal_year_start) cookieStore.set('dev_org_fiscal_year', updates.fiscal_year_start.toString(), { path: '/' });

        revalidatePath("/settings")
        return { success: true, data: { ...updates, id: organization_id } };
    }

    const { data, error } = await supabase
        .from("organizations")
        .update({
            name: updates.name,
            registration_id: updates.registration_id,
            base_currency: updates.base_currency,
            fiscal_year_start: updates.fiscal_year_start
        })
        .eq("id", organization_id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update org settings:", error)
        throw new Error("Failed to update organization settings")
    }

    revalidatePath("/settings")
    return { success: true, data }
}

// --- Funds ---

export async function getSettingsFunds() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const choice = cookieStore.get('dev_template_choice')?.value || 'digital_agency';
        const template = TEMPLATES[choice] || TEMPLATES.digital_agency;
        return template.funds.map((f: any, i: number) => ({ 
            id: `mock-fund-${i}`, 
            organization_id, 
            name: f.name 
        }));
    }

    const { data, error } = await supabase
        .from("funds")
        .select("*")
        .eq("organization_id", organization_id)
        .order("name")

    if (error) return []
    return data
}

export async function addSettingFund(name: string, code?: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

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

export async function deleteSettingFund(id: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("funds")
        .delete()
        .eq("id", id)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Supabase Error (deleteSettingFund):", error)
        throw new Error("Failed to delete fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Categories ---

export async function getSettingsCategories() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const choice = cookieStore.get('dev_template_choice')?.value || 'digital_agency';
        const template = TEMPLATES[choice] || TEMPLATES.digital_agency;
        return template.categories.map((c: any, i: number) => ({ 
            id: `mock-category-${i}`, 
            organization_id, 
            name: c.name 
        }));
    }

    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("organization_id", organization_id)
        .order("name")

    if (error) return []
    return data
}

export async function addSettingCategory(name: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("categories")
        .insert({
            organization_id,
            name
        })

    if (error) {
        console.error("Supabase Error (addSettingCategory):", error)
        throw new Error("Failed to add category")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function deleteSettingCategory(id: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Supabase Error (deleteSettingCategory):", error)
        throw new Error("Failed to delete category")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Team Management ---

export async function getTeamMembers() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at")

    if (error) return []
    return data
}

export async function inviteTeamMember(email: string, full_name: string, role: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { error } = await supabase
        .from("user_roles")
        .insert({
            organization_id,
            email,
            full_name,
            role
        })

    if (error) throw new Error("Failed to invite team member: " + error.message)
    revalidatePath("/settings")
    return { success: true }
}

// --- Subscription / Upgrade ---

export async function verifyCheckoutSession(sessionId: string) {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid' && session.metadata?.organization_id === organization_id) {
            const { error } = await supabase
                .rpc('upgrade_org_to_pro', { org_id: organization_id });

            if (error) {
                console.error('Error upgrading org from client verify:', error);
                return { success: false };
            }

            revalidatePath("/", "layout")
            return { success: true };
        }
        
    } catch (e) {
        console.error("verifyCheckoutSession error:", e)
    }
    
    return { success: false };
}



