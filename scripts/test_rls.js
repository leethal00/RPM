const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, anonKey);

async function run() {
    console.log('Testing ANON insert into site_photos...');

    const { data: stores, error: sError } = await supabase.from('stores').select('id').limit(1);
    if (sError || !stores || stores.length === 0) {
        console.error('Cannot find a store to test with.');
        return;
    }

    const storeId = stores[0].id;
    console.log('Using Store ID:', storeId);

    const { error } = await supabase
        .from('site_photos')
        .insert({
            store_id: storeId,
            url: 'https://example.com/test.jpg',
            caption: 'Test'
        });

    if (error) {
        console.error('RESULT: FAIL - ' + error.message);
    } else {
        console.log('RESULT: SUCCESS');
    }
}

run();
