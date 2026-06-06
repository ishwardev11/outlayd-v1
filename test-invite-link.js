const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function testGenerateInvite() {
    const email = `test-invite-${Date.now()}@example.com`;
    console.log("Inviting email:", email);
    
    // Use generateLink to see exactly what link Supabase creates
    const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
            redirectTo: 'http://localhost:3000/accept-invite'
        }
    });

    if (error) {
        console.error("Generate link error:", error);
    } else {
        console.log("Generated Link Data:", JSON.stringify(data, null, 2));
    }
}

testGenerateInvite();
