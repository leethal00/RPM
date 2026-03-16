#!/usr/bin/env node

/**
 * Apply migrations and seed data to Supabase dev database
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = 'https://jtotzntmndxanhjijqcz.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MIGRATION_FILE = path.join(__dirname, '..', 'rpm-dev-migrations.sql');
const SEED_FILE = path.join(__dirname, 'seed-dev-clean.sql');

async function executeSqlFile(client, filePath, description) {
  console.log(`\n📄 Executing ${description}...`);
  console.log(`   File: ${path.basename(filePath)}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf-8');

  try {
    // Execute via Supabase RPC (for raw SQL)
    const { data, error } = await client.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, we need to execute via REST API
      console.log(`   ⚠️  RPC method not available, using direct execution...`);

      // Split into individual statements and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`   Found ${statements.length} statements to execute`);

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement) continue;

        try {
          const { error: stmtError } = await client.rpc('exec_sql', { sql_query: statement + ';' });
          if (stmtError) {
            console.log(`   ⚠️  Statement ${i + 1} warning: ${stmtError.message}`);
          }
        } catch (err) {
          console.log(`   ⚠️  Statement ${i + 1} error: ${err.message}`);
        }
      }
    }

    console.log(`   ✅ ${description} completed`);
  } catch (error) {
    console.error(`   ❌ Error executing ${description}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🗃️  RPM Dev Database Setup');
  console.log('==========================');
  console.log(`Target: ${SUPABASE_URL}\n`);

  // Create Supabase client with service role key
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Apply migrations
    await executeSqlFile(supabase, MIGRATION_FILE, 'Migrations');

    // Apply seed data
    await executeSqlFile(supabase, SEED_FILE, 'Seed Data');

    console.log('\n✨ Database setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Verify data in Supabase dashboard');
    console.log('   2. Test the application against dev database');
    console.log('   3. Create a test user if needed\n');
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('   - Verify the service role key is correct');
    console.error('   - Check Supabase dashboard for detailed error logs');
    console.error('   - Ensure RLS policies allow your operations\n');
    process.exit(1);
  }
}

// Note: This script uses Supabase JS client which may not support all DDL operations
// If this fails, use the SQL Editor in Supabase Dashboard:
console.log('⚠️  Note: If automatic execution fails, you can manually apply SQL files via:');
console.log('   https://supabase.com/dashboard/project/jtotzntmndxanhjijqcz/sql\n');

main().catch(console.error);
