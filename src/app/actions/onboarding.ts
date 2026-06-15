"use server"

import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export interface OnboardingData {
    orgName: string;
    baseCurrency: string;
    fiscalYearStart: string;
    templateChoice: string;
    // invites: { email: string; role: string }[];
}

export async function completeOnboardingSetup(data: OnboardingData) {
    const supabase = await createClient();

    // 1. Get current user (support local dev fallback)
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.log("Local Dev: Bypassing DB insert for unauthenticated user.");
        const cookieStore = await cookies();
        const mockUuid = '00000000-0000-0000-0000-000000000000';
        cookieStore.set('dev_org_id', mockUuid, { path: '/' });
        cookieStore.set('dev_org_name', data.orgName, { path: '/' });
        cookieStore.set('dev_org_currency', data.baseCurrency, { path: '/' });
        cookieStore.set('dev_org_fiscal_year', data.fiscalYearStart, { path: '/' });
        cookieStore.set('dev_template_choice', data.templateChoice, { path: '/' });
        return { success: true, organization_id: mockUuid };
    }

    const userEmail = user?.email || "admin@example.com";
    const userFullName = user?.user_metadata?.full_name || "Admin";

    try {
        // 2. Create Organization
        const { data: org, error: orgError } = await supabase
            .from("organizations")
            .insert({
                name: data.orgName,
                base_currency: data.baseCurrency,
                fiscal_year_start: parseInt(data.fiscalYearStart, 10),
            })
            .select()
            .single();

        if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

        const organization_id = org.id;

        // 3. Link user to organization via cookie immediately
        if (user) {
            const cookieStore = await cookies();
            cookieStore.set('active_org_id', organization_id, { path: '/' });
        }

        // Re-create the Supabase client to ensure the x-active-org-id header is included in outgoing database queries
        const activeSupabase = await createClient();

        // 4. Assign user roles (current user as Admin only)
        // MUST be inserted before categories/funds seeding so get_user_org_id() can resolve the organization
        const rolesToInsert = [
            { organization_id, email: userEmail, role: "Admin", full_name: userFullName }
        ];

        const { error: rolesError } = await activeSupabase.from("user_roles").insert(rolesToInsert);
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
            const { error: catError } = await activeSupabase
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
            const { error: fundError } = await activeSupabase
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
