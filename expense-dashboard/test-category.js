require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: cols } = await supabase
        .from('categories')
        .select('*')
        .limit(1);

    fs.writeFileSync('test-category-out.txt', JSON.stringify(cols, null, 2), 'utf8');
}

main().catch(console.error);
