#!/usr/bin/env node

/**
 * Check existing users and create a new user in Supabase dev
 */

const { createClient } = require('@supabase/supabase-js');

// Dev configuration
const SUPABASE_URL = 'https://jtotzntmndxanhjijqcz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log('🔍 Checking users in dev database...\n');

  // Create Supabase client with service role key (has admin access)
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Check existing users in public.users table
  const { data: publicUsers, error: publicError } = await supabase
    .from('users')
    .select('*');

  if (publicError) {
    console.error('❌ Error fetching public users:', publicError.message);
  } else {
    console.log(`📊 Found ${publicUsers?.length || 0} users in public.users table`);
    if (publicUsers && publicUsers.length > 0) {
      console.log('\nExisting users:');
      publicUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.role})`);
      });
    }
  }

  // Check auth.users (via admin API)
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('\n❌ Error fetching auth users:', authError.message);
  } else {
    console.log(`\n📊 Found ${authData.users?.length || 0} users in auth.users table`);
  }

  // Create a new super admin user
  console.log('\n🔧 Creating new super admin user...\n');

  const newUserEmail = 'admin@rpm.dev';
  const newUserPassword = 'admin123';

  // Create user in auth.users
  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email: newUserEmail,
    password: newUserPassword,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      name: 'Dev Admin'
    }
  });

  if (createError) {
    console.error('❌ Error creating auth user:', createError.message);
    process.exit(1);
  }

  console.log('✅ Auth user created:', authUser.user.id);

  // Get the first client for assignment
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name')
    .limit(1)
    .single();

  // Create user in public.users table
  const { data: publicUser, error: publicUserError } = await supabase
    .from('users')
    .insert({
      id: authUser.user.id,
      email: newUserEmail,
      name: 'Dev Admin',
      role: 'super_admin',
      client_id: clients?.id || null,
      store_ids: []
    })
    .select()
    .single();

  if (publicUserError) {
    console.error('❌ Error creating public user:', publicUserError.message);
    process.exit(1);
  }

  console.log('✅ Public user created');
  console.log('\n🎉 User created successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Email:    ', newUserEmail);
  console.log('🔑 Password: ', newUserPassword);
  console.log('👤 Role:     ', 'super_admin');
  console.log('🆔 User ID:  ', authUser.user.id);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🌐 Login at: https://jtotzntmndxanhjijqcz.supabase.co');
  console.log('\n⚠️  Remember to change this password after first login!\n');
}

main().catch(console.error);
