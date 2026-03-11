/**
 * Apply migrations to Supabase database using direct PostgreSQL connection
 *
 * Usage: SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/apply-migrations-node.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function executeSql(sql: string, description: string) {
    console.log(`\n🔄 Executing: ${description}`)

    // Split SQL into individual statements
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'))

    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]
        if (!statement) continue

        try {
            // Use rpc if available, otherwise try raw query
            const { data, error } = await supabase.rpc('exec_sql', {
                sql_query: statement + ';'
            }).catch(async () => {
                // If exec_sql doesn't exist, we need to use Postgres connection
                // This is a limitation - Supabase JS client doesn't support DDL directly
                throw new Error('exec_sql function not available. Please apply migrations manually via SQL Editor.')
            })

            if (error) {
                console.error(`   ❌ Error in statement ${i + 1}:`, error.message)
                // Continue with other statements
            }
        } catch (err: any) {
            if (err.message.includes('exec_sql function not available')) {
                throw err
            }
            console.error(`   ⚠️  Warning in statement ${i + 1}:`, err.message)
        }
    }
}

async function applyMigrations() {
    console.log('🗃️  RPM Database Migration Applier')
    console.log('==================================')
    console.log(`Target: ${supabaseUrl}\n`)

    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')

    if (!fs.existsSync(migrationsDir)) {
        console.error('❌ Migrations directory not found:', migrationsDir)
        process.exit(1)
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort()

    if (migrationFiles.length === 0) {
        console.error('❌ No migration files found')
        process.exit(1)
    }

    console.log('📋 Found migrations:')
    migrationFiles.forEach(f => console.log(`   - ${f}`))

    console.log('\n⚠️  Note: Supabase JS client cannot execute DDL directly.')
    console.log('   I will create a combined SQL file for you to apply manually.\n')

    // Create combined SQL file
    const combinedSql: string[] = []

    for (const file of migrationFiles) {
        const filePath = path.join(migrationsDir, file)
        const sql = fs.readFileSync(filePath, 'utf-8')

        combinedSql.push(`-- ========================================`)
        combinedSql.push(`-- Migration: ${file}`)
        combinedSql.push(`-- ========================================`)
        combinedSql.push('')
        combinedSql.push(sql)
        combinedSql.push('')
        combinedSql.push('')
    }

    const outputFile = path.join(process.cwd(), 'combined-migrations.sql')
    fs.writeFileSync(outputFile, combinedSql.join('\n'))

    console.log(`✅ Combined migrations written to: ${outputFile}`)
    console.log('\n📝 To apply migrations:')
    console.log('   1. Open Supabase Dashboard SQL Editor')
    console.log(`   2. Visit: ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql`)
    console.log('   3. Copy contents of combined-migrations.sql')
    console.log('   4. Paste and click "Run"\n')

    return outputFile
}

applyMigrations().catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
})
