require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    // 1. Sign in or sign up
    const email = 'test' + Date.now() + '@example.com';
    const { data: { user, session }, error: signinError } = await supabase.auth.signUp({
        email,
        password: 'password123'
    });
    if (signinError) {
        console.error("Sign in error:", signinError);
        return;
    }

    console.log("Signed in:", user.id);
    
    // 2. Create organization
    const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
            name: 'Test Org ' + Date.now(),
            base_currency: 'USD',
            fiscal_year_start: 1,
        })
        .select()
        .single();
    
    if (orgError) {
        console.error("Org error:", orgError);
        return;
    }
    console.log("Created org:", org.id);

    // 3. Update user metadata
    const { data: userData, error: updateError } = await supabase.auth.updateUser({
        data: { organization_id: org.id }
    });

    if (updateError) {
        console.error("Update error:", updateError);
        return;
    }
    console.log("Updated user metadata:", userData.user.user_metadata);

    const { data: dbOrgId, error: fnError } = await supabase.rpc('get_user_org_id', {});
    console.log("From DB get_user_org_id():", dbOrgId, fnError);

    // 4. Try to insert category
    const { data: cat, error: catError } = await supabase
        .from('categories')
        .insert({
            organization_id: org.id,
            name: 'Test Category ' + Date.now(),
            type: 'operating'
        })
        .select();
    
    if (catError) {
        console.error("Category insert error:", catError);
    } else {
        console.log("Inserted category:", cat);
    }
}

main();
