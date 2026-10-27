require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing environment variables in .env.local");
    process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    console.log("Starting Delete Account verification test...");

    // 1. Create a test organization
    const orgName = `Test Delete Org ${Date.now()}`;
    const { data: org, error: orgError } = await adminClient
        .from('organizations')
        .insert({
            name: orgName,
            base_currency: 'USD',
            fiscal_year_start: 1
        })
        .select()
        .single();

    if (orgError) {
        console.error("Failed to create test organization:", orgError);
        process.exit(1);
    }
    const orgId = org.id;
    console.log(`Created test organization: ${orgName} (ID: ${orgId})`);

    try {
        // 2. Seed mock records for this organization
        // Seed category
        const { data: cat, error: catError } = await adminClient
            .from('categories')
            .insert({ name: 'Test Category', organization_id: orgId })
            .select()
            .single();
        if (catError) throw catError;

        // Seed fund
        const { data: fund, error: fundError } = await adminClient
            .from('funds')
            .insert({ name: 'Test Fund', organization_id: orgId })
            .select()
            .single();
        if (fundError) throw fundError;

        const vendorName = `Test Vendor ${Date.now()}`;
        // Seed vendor
        const { data: vendor, error: vendorError } = await adminClient
            .from('vendors')
            .insert({ name: vendorName, organization_id: orgId })
            .select()
            .single();
        if (vendorError) throw vendorError;

        // Seed document
        const { data: doc, error: docError } = await adminClient
            .from('documents')
            .insert({
                organization_id: orgId,
                vendor_name: vendorName,
                vendor_id: vendor.id,
                category_id: cat.id,
                fund_id: fund.id,
                amount: 100.0,
                status: 'verified'
            })
            .select()
            .single();
        if (docError) throw docError;

        // Seed procurement project
        const { data: proj, error: projError } = await adminClient
            .from('procurement_projects')
            .insert({
                organization_id: orgId,
                title: 'Test Project',
                budget_ceiling: 5000,
                required_deadline: '2026-12-31'
            })
            .select()
            .single();
        if (projError) throw projError;

        // Seed quote
        const { data: quote, error: quoteError } = await adminClient
            .from('quotes')
            .insert({
                organization_id: orgId,
                project_id: proj.id,
                vendor_name: vendorName,
                total_amount: 4500,
                status: 'uploaded'
            })
            .select()
            .single();
        if (quoteError) throw quoteError;

        // Seed user role
        const { data: role, error: roleError } = await adminClient
            .from('user_roles')
            .insert({
                organization_id: orgId,
                email: `test-member-${Date.now()}@example.com`,
                role: 'Viewer',
                full_name: 'Test Member'
            })
            .select()
            .single();
        if (roleError) throw roleError;

        console.log("Successfully seeded mock data for all tables.");

        // Verify they exist in DB
        const tables = [
            'quotes', 'procurement_projects', 'documents', 'vendors', 'funds', 'categories', 'user_roles'
        ];
        for (const table of tables) {
            const { count, error } = await adminClient
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', orgId);
            if (error) throw error;
            if (count !== 1) {
                throw new Error(`Expected 1 row in ${table}, found ${count}`);
            }
        }
        console.log("Verification of seeded rows: PASSED");

        // 3. Perform Deletions in same order as settings.ts action
        console.log("Simulating deletion process...");
        const tablesToDelete = [
            "quotes",
            "procurement_projects",
            "documents",
            "vendors",
            "funds",
            "categories",
            "workspace_invites",
            "user_profiles",
            "user_roles"
        ];

        for (const table of tablesToDelete) {
            const { error } = await adminClient
                .from(table)
                .delete()
                .eq("organization_id", orgId);
            if (error) {
                throw new Error(`Failed to delete table ${table}: ${error.message}`);
            }
            console.log(`- Deleted from ${table}`);
        }

        // Delete organization itself
        const { error: deleteOrgError } = await adminClient
            .from("organizations")
            .delete()
            .eq("id", orgId);

        if (deleteOrgError) {
            throw new Error(`Failed to delete organization: ${deleteOrgError.message}`);
        }
        console.log("- Deleted organization record");

        // 4. Verify everything is deleted
        console.log("Checking that database is completely cleaned up...");
        for (const table of tables) {
            const { count, error } = await adminClient
                .from(table)
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', orgId);
            if (error) throw error;
            if (count !== 0) {
                throw new Error(`Orphaned row found in ${table}! Count: ${count}`);
            }
        }

        const { data: orgCheck, error: orgCheckError } = await adminClient
            .from('organizations')
            .select('*')
            .eq('id', orgId)
            .maybeSingle();
        if (orgCheckError) throw orgCheckError;
        if (orgCheck) {
            throw new Error("Organization record still exists in the database!");
        }

        console.log("Verification of complete deletion: PASSED");
        console.log("Test execution completed successfully! All database cascade cleanup queries functioned correctly.");

    } catch (err) {
        console.error("Test failed during execution:", err);
        // Clean up org if it still exists
        await adminClient.from('organizations').delete().eq('id', orgId);
        process.exit(1);
    }
}

run();
