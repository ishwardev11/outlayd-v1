"use server"

import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { BASE_CURRENCY_CODES, isBaseCurrencyCode } from "@/utils/currency"
import { isValidTimezone } from "@/utils/dates"

export interface OnboardingData {
    orgName: string;
    baseCurrency: string;
    fiscalYearStart: string;
    templateChoice: string;
    timezone?: string; // IANA name from the browser, e.g. "Asia/Kuala_Lumpur"
    // invites: { email: string; role: string }[];
}

export async function completeOnboardingSetup(data: OnboardingData) {
    if (!isBaseCurrencyCode(data.baseCurrency)) {
        return { success: false, error: `Choose a base currency: ${BASE_CURRENCY_CODES.join(", ")}.` };
    }

    const supabase = await createClient();

    // 1. Get the signed-in user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: "You need to be signed in to set up an organisation." };
    }
    if (!user.email) {
        return { success: false, error: "Your account has no email address, so it can't own an organisation." };
    }

    const userEmail = user.email;
    const userFullName = user.user_metadata?.full_name || "Admin";

    try {
        // Initialize admin client to reliably bypass RLS chicken-and-egg condition during first-time tenant creation
        const { createAdminClient } = await import("@/utils/supabase/admin");
        const adminClient = createAdminClient();

        // 2. Create Organization
        const { data: org, error: orgError } = await adminClient
            .from("organizations")
            .insert({
                name: data.orgName,
                base_currency: data.baseCurrency,
                fiscal_year_start: parseInt(data.fiscalYearStart, 10),
                // Falls back to the database default (Kuala Lumpur) if the browser sent nothing usable
                ...(isValidTimezone(data.timezone) ? { timezone: data.timezone } : {}),
            })
            .select()
            .single();

        if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

        const organization_id = org.id;

        // 3. Link user to organization via cookie and metadata immediately
        if (user) {
            const cookieStore = await cookies();
            cookieStore.set('active_org_id', organization_id, { path: '/' });
            cookieStore.set('active_org_currency', data.baseCurrency, { path: '/' });

            // Sync organization_id into user metadata for fallback lookups
            await adminClient.auth.admin.updateUserById(user.id, {
                user_metadata: {
                    ...user.user_metadata,
                    organization_id: organization_id,
                    onboarding_completed: true,
                }
            });
        }

        // 4. Assign user roles (current user as Admin only)
        const rolesToInsert = [
            { organization_id, email: userEmail, role: "Admin", full_name: userFullName }
        ];

        const { error: rolesError } = await adminClient.from("user_roles").insert(rolesToInsert);
        if (rolesError) {
            console.error("Error creating user roles:", rolesError);
            throw new Error(`Failed to assign user role: ${rolesError.message}`);
        }


        // 4. Seed template data with robust switch statement
        let categoriesList: string[] = [];
        let fundsList: string[] = [];

        switch (data.templateChoice) {
            case 'non_profit':
                categoriesList = [
                    'Program Supplies', 'Fundraising Expenses', 'Administrative & Overhead', 
                    'Professional Fees', 'Travel & Events', 'Grants & Awards'
                ];
                fundsList = [
                    'General Unrestricted', 'Restricted Grant', 'Community Outreach', 'Building Fund'
                ];
                break;
            case 'ecommerce':
                categoriesList = [
                    'Cost of Goods Sold (COGS)', 'Shipping & Fulfillment', 'Merchant Processing Fees', 
                    'Advertising & Promotions', 'Packaging Supplies', 'Warehouse Rent'
                ];
                fundsList = [
                    'Store Operations', 'Logistics & Supply Chain', 'Marketing & Growth'
                ];
                break;
            case 'digital_agency':
            default:
                categoriesList = [
                    'Software & Cloud Infrastructure', 'Marketing & Advertising', 'Contractor Fees', 
                    'Legal & Professional', 'Office & Equipment', 'Travel & Meals'
                ];
                fundsList = [
                    'General OpEx', 'Client Projects', 'Internal R&D'
                ];
                break;
        }

        if (categoriesList.length > 0) {
            const categoriesToInsert = categoriesList.map(name => ({
                name,
                organization_id
            }));
            const { error: catError } = await adminClient
                .from("categories")
                .upsert(categoriesToInsert, { onConflict: "name,organization_id", ignoreDuplicates: true });
            if (catError) {
                console.error("Failed to seed categories:", catError);
                throw new Error(`Failed to seed categories: ${catError.message}`);
            }
        }

        if (fundsList.length > 0) {
            const fundsToInsert = fundsList.map(name => ({
                name,
                organization_id
            }));
            const { error: fundError } = await adminClient
                .from("funds")
                .upsert(fundsToInsert, { onConflict: "name,organization_id", ignoreDuplicates: true });
            if (fundError) {
                console.error("Failed to seed funds:", fundError);
                throw new Error(`Failed to seed funds: ${fundError.message}`);
            }
        }



        return { success: true, organization_id };
    } catch (error: any) {
        console.error("Onboarding failed:", error);
        return { success: false, error: error.message };
    }
}
