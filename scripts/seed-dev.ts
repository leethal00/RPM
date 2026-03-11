/**
 * Comprehensive Seed Script for RPM Dev Environment
 *
 * This seeds the development database with realistic test data including:
 * - Multiple clients with branding
 * - Asset types catalog
 * - Regions across NZ
 * - Multiple stores per client with varied configurations
 * - Assets at each store with maintenance schedules
 * - Vendors across different trades
 * - Sample jobs (faults and maintenance)
 * - HQ Projects
 * - Photos for sites and assets
 *
 * Usage: NEXT_PUBLIC_SUPABASE_URL=<dev-url> SUPABASE_SERVICE_ROLE_KEY=<dev-service-key> npx tsx scripts/seed-dev.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Missing environment variables!')
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    console.error('\nUsage:')
    console.error('NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/seed-dev.ts')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function seed() {
    console.log('🌱 Starting seed process for RPM dev environment...\n')

    try {
        // ==================== 1. CREATE CLIENTS ====================
        console.log('📦 Creating clients...')
        const { data: clients, error: clientError } = await supabase
            .from('clients')
            .insert([
                {
                    name: "St Pierre's Sushi",
                    primary_color: '#2D6A4F',
                    contact_email: 'operations@stpierres.co.nz',
                    active: true
                },
                {
                    name: "Bento Bowl",
                    primary_color: '#D32F2F',
                    contact_email: 'admin@bentobowl.co.nz',
                    active: true
                },
                {
                    name: "K10 Sushi Train",
                    primary_color: '#1976D2',
                    contact_email: 'info@k10.co.nz',
                    active: true
                }
            ])
            .select()

        if (clientError) throw clientError
        console.log(`✅ Created ${clients?.length} clients\n`)

        const stPierresClient = clients?.find(c => c.name === "St Pierre's Sushi")
        const bentoBowlClient = clients?.find(c => c.name === "Bento Bowl")
        const k10Client = clients?.find(c => c.name === "K10 Sushi Train")

        // ==================== 2. CREATE ASSET TYPES ====================
        console.log('🏷️  Creating asset types...')
        const { data: assetTypes, error: assetTypeError } = await supabase
            .from('asset_types')
            .insert([
                { label: 'Digital Menu Board', default_interval_days: 180, icon_name: 'Monitor' },
                { label: 'Pylon Sign', default_interval_days: 365, icon_name: 'ArrowUp' },
                { label: 'Fascia Sign', default_interval_days: 365, icon_name: 'Layout' },
                { label: 'Internal Lightbox', default_interval_days: 180, icon_name: 'Box' },
                { label: 'Window Graphics', default_interval_days: 365, icon_name: 'Frame' },
                { label: 'Exterior LED Lighting', default_interval_days: 180, icon_name: 'Lightbulb' },
                { label: 'Drive-Thru Menu Board', default_interval_days: 180, icon_name: 'Car' },
                { label: 'A-Frame Sign', default_interval_days: 365, icon_name: 'Triangle' }
            ])
            .select()

        if (assetTypeError) throw assetTypeError
        console.log(`✅ Created ${assetTypes?.length} asset types\n`)

        // ==================== 3. CREATE REGIONS ====================
        console.log('🗺️  Creating regions...')

        // Check if regions already exist
        const { data: existingRegions } = await supabase
            .from('regions')
            .select('name')

        if (existingRegions && existingRegions.length > 0) {
            console.log(`ℹ️  Regions already exist (${existingRegions.length} found), skipping...\n`)
        } else {
            const { data: regions, error: regionError } = await supabase
                .from('regions')
                .insert([
                    { name: 'Auckland' },
                    { name: 'Wellington' },
                    { name: 'Christchurch' },
                    { name: 'Hamilton' },
                    { name: 'Tauranga' },
                    { name: 'Dunedin' },
                    { name: 'Palmerston North' },
                    { name: 'Queenstown' }
                ])
                .select()

            if (regionError) throw regionError
            console.log(`✅ Created ${regions?.length} regions\n`)
        }

        // ==================== 4. CREATE STORES ====================
        console.log('🏪 Creating stores...')
        const stores = [
            // St Pierre's Stores
            {
                client_id: stPierresClient?.id,
                name: "St Pierre's — Ponsonby",
                region: 'Auckland',
                address: '254 Ponsonby Road, Ponsonby, Auckland 1011',
                lat: -36.8530,
                lng: 174.7470,
                status: 'active',
                brand_st_pierres: true,
                brand_bento_bowl: false,
                brand_k10: false,
                site_category: 'Stand alone',
                has_drive_thru: false,
                maintenance_score: 92.5,
                manager_name: 'Sarah Chen',
                manager_phone: '021 234 5678'
            },
            {
                client_id: stPierresClient?.id,
                name: "St Pierre's — Sylvia Park",
                region: 'Auckland',
                address: '286 Mount Wellington Highway, Mount Wellington, Auckland 1060',
                lat: -36.9150,
                lng: 174.8420,
                status: 'active',
                brand_st_pierres: true,
                brand_bento_bowl: true,
                brand_k10: false,
                site_category: 'Food court',
                has_drive_thru: false,
                maintenance_score: 88.0,
                manager_name: 'Mike Johnson',
                manager_phone: '021 345 6789'
            },
            {
                client_id: stPierresClient?.id,
                name: "St Pierre's — Takapuna",
                region: 'Auckland',
                address: '22 Hurstmere Road, Takapuna, Auckland 0622',
                lat: -36.7885,
                lng: 174.7700,
                status: 'active',
                brand_st_pierres: true,
                brand_bento_bowl: false,
                brand_k10: false,
                site_category: 'Stand alone',
                has_drive_thru: true,
                maintenance_score: 95.0,
                manager_name: 'Emma Watson',
                manager_phone: '021 456 7890'
            },
            {
                client_id: stPierresClient?.id,
                name: "St Pierre's — Wellington CBD",
                region: 'Wellington',
                address: '123 Lambton Quay, Wellington 6011',
                lat: -41.2790,
                lng: 174.7760,
                status: 'active',
                brand_st_pierres: true,
                brand_bento_bowl: false,
                brand_k10: false,
                site_category: 'Stand alone',
                has_drive_thru: false,
                maintenance_score: 90.5,
                manager_name: 'David Lee',
                manager_phone: '021 567 8901'
            },
            // Bento Bowl Stores
            {
                client_id: bentoBowlClient?.id,
                name: 'Bento Bowl — Newmarket',
                region: 'Auckland',
                address: '277 Broadway, Newmarket, Auckland 1023',
                lat: -36.8690,
                lng: 174.7780,
                status: 'active',
                brand_st_pierres: false,
                brand_bento_bowl: true,
                brand_k10: false,
                site_category: 'Food court',
                has_drive_thru: false,
                maintenance_score: 87.5,
                manager_name: 'Lisa Park',
                manager_phone: '021 678 9012'
            },
            {
                client_id: bentoBowlClient?.id,
                name: 'Bento Bowl — Christchurch Central',
                region: 'Christchurch',
                address: '185 High Street, Christchurch 8011',
                lat: -43.5320,
                lng: 172.6370,
                status: 'active',
                brand_st_pierres: false,
                brand_bento_bowl: true,
                brand_k10: false,
                site_category: 'Stand alone',
                has_drive_thru: false,
                maintenance_score: 91.0,
                manager_name: 'Tom Wilson',
                manager_phone: '021 789 0123'
            },
            // K10 Stores
            {
                client_id: k10Client?.id,
                name: 'K10 Sushi Train — Queen Street',
                region: 'Auckland',
                address: '55 Queen Street, Auckland CBD, Auckland 1010',
                lat: -36.8485,
                lng: 174.7633,
                status: 'active',
                brand_st_pierres: false,
                brand_bento_bowl: false,
                brand_k10: true,
                site_category: 'Stand alone',
                has_drive_thru: false,
                maintenance_score: 93.5,
                manager_name: 'Akira Tanaka',
                manager_phone: '021 890 1234'
            }
        ]

        const { data: createdStores, error: storeError } = await supabase
            .from('stores')
            .insert(stores)
            .select()

        if (storeError) throw storeError
        console.log(`✅ Created ${createdStores?.length} stores\n`)

        // ==================== 5. CREATE VENDORS ====================
        console.log('🔧 Creating vendors...')
        const { data: vendors, error: vendorError } = await supabase
            .from('vendors')
            .insert([
                {
                    client_id: stPierresClient?.id,
                    name: 'Auckland Signage Solutions',
                    trade: 'Signage',
                    email: 'jobs@aucklandsignage.co.nz',
                    phone: '09 123 4567',
                    account_code: 'ASS-001',
                    status: 'active'
                },
                {
                    client_id: stPierresClient?.id,
                    name: 'NZ Electrical Services',
                    trade: 'Electrical',
                    email: 'bookings@nzelec.co.nz',
                    phone: '09 234 5678',
                    account_code: 'NZES-001',
                    status: 'active'
                },
                {
                    client_id: stPierresClient?.id,
                    name: 'Premier Maintenance Ltd',
                    trade: 'General Maintenance',
                    email: 'ops@premiermaint.co.nz',
                    phone: '09 345 6789',
                    account_code: 'PML-001',
                    status: 'active'
                },
                {
                    client_id: bentoBowlClient?.id,
                    name: 'Southern Refrigeration',
                    trade: 'Refrigeration',
                    email: 'service@southernrefrig.co.nz',
                    phone: '03 456 7890',
                    account_code: 'SR-001',
                    status: 'active'
                }
            ])
            .select()

        if (vendorError) throw vendorError
        console.log(`✅ Created ${vendors?.length} vendors\n`)

        // ==================== 6. CREATE ASSETS ====================
        console.log('📦 Creating assets for each store...')
        const digitalMenuBoardType = assetTypes?.find(t => t.label === 'Digital Menu Board')
        const pylonSignType = assetTypes?.find(t => t.label === 'Pylon Sign')
        const fasciaSignType = assetTypes?.find(t => t.label === 'Fascia Sign')
        const lightboxType = assetTypes?.find(t => t.label === 'Internal Lightbox')
        const driveThruType = assetTypes?.find(t => t.label === 'Drive-Thru Menu Board')

        const assetsToCreate = createdStores?.flatMap(store => {
            const baseAssets = [
                {
                    store_id: store.id,
                    name: 'Main Fascia Sign',
                    asset_type_id: fasciaSignType?.id,
                    asset_group: 'external',
                    install_date: '2022-03-15',
                    last_service_date: '2024-09-01',
                    service_interval_days: 365,
                    status: 'operational',
                    asset_dimensions: '6m x 1.2m',
                    notes: 'LED illuminated fascia with brand logo'
                },
                {
                    store_id: store.id,
                    name: 'Digital Menu Board #1',
                    asset_type_id: digitalMenuBoardType?.id,
                    asset_group: 'internal',
                    install_date: '2023-01-10',
                    last_service_date: '2025-01-15',
                    service_interval_days: 180,
                    status: 'operational',
                    asset_dimensions: '55 inch display',
                    notes: 'Primary menu display above counter'
                },
                {
                    store_id: store.id,
                    name: 'Internal Menu Lightbox',
                    asset_type_id: lightboxType?.id,
                    asset_group: 'internal',
                    install_date: '2022-03-15',
                    last_service_date: '2024-08-20',
                    service_interval_days: 180,
                    status: 'operational',
                    asset_dimensions: '2m x 1.5m',
                    notes: 'Backlit menu board'
                }
            ]

            // Add pylon for stand-alone stores
            if (store.site_category === 'Stand alone') {
                baseAssets.push({
                    store_id: store.id,
                    name: 'Street Pylon Sign',
                    asset_type_id: pylonSignType?.id,
                    asset_group: 'external',
                    install_date: '2022-03-15',
                    last_service_date: '2024-03-20',
                    service_interval_days: 365,
                    status: 'operational',
                    asset_dimensions: '8m height',
                    notes: 'Illuminated pylon with brand identity'
                })
            }

            // Add drive-thru board if applicable
            if (store.has_drive_thru) {
                baseAssets.push({
                    store_id: store.id,
                    name: 'Drive-Thru Menu Board',
                    asset_type_id: driveThruType?.id,
                    asset_group: 'external',
                    install_date: '2023-06-01',
                    last_service_date: '2025-01-10',
                    service_interval_days: 180,
                    status: 'operational',
                    asset_dimensions: '3m x 2m',
                    notes: 'Illuminated drive-thru ordering board'
                })
            }

            return baseAssets
        }) || []

        const { data: createdAssets, error: assetError } = await supabase
            .from('assets')
            .insert(assetsToCreate)
            .select()

        if (assetError) throw assetError
        console.log(`✅ Created ${createdAssets?.length} assets\n`)

        // ==================== 7. CREATE HQ PROJECTS ====================
        console.log('📊 Creating HQ projects...')
        const takapunaStore = createdStores?.find(s => s.name.includes('Takapuna'))
        const wellingtonStore = createdStores?.find(s => s.name.includes('Wellington CBD'))

        const { data: projects, error: projectError } = await supabase
            .from('projects')
            .insert([
                {
                    name: 'Takapuna Store Refresh 2026',
                    description: 'Complete signage and interior refresh including new digital menu boards and updated fascia',
                    status: 'in_progress',
                    budget: 45000,
                    start_date: '2026-02-01',
                    end_date: '2026-04-30',
                    store_id: takapunaStore?.id
                },
                {
                    name: 'Wellington Brand Rollout',
                    description: 'Update all signage to new brand guidelines',
                    status: 'planning',
                    budget: 32000,
                    start_date: '2026-05-01',
                    end_date: '2026-06-30',
                    store_id: wellingtonStore?.id
                }
            ])
            .select()

        if (projectError) throw projectError
        console.log(`✅ Created ${projects?.length} HQ projects\n`)

        // ==================== 8. CREATE SAMPLE JOBS ====================
        console.log('📋 Creating sample jobs...')

        // Get a test user (you'll need to create users separately via Supabase Auth)
        // For now, we'll skip job creation that requires user IDs
        console.log('ℹ️  Skipping job creation (requires authenticated users)\n')

        // ==================== 9. CREATE MAINTENANCE SCHEDULES ====================
        console.log('🗓️  Creating maintenance schedules...')
        const maintenanceSchedules = createdAssets?.slice(0, 5).map(asset => ({
            asset_id: asset.id,
            task_name: 'Preventive Maintenance Inspection',
            frequency_days: asset.service_interval_days,
            next_due_at: new Date(Date.now() + (asset.service_interval_days * 24 * 60 * 60 * 1000)).toISOString()
        })) || []

        if (maintenanceSchedules.length > 0) {
            const { error: scheduleError } = await supabase
                .from('maintenance_schedules')
                .insert(maintenanceSchedules)

            if (scheduleError) throw scheduleError
            console.log(`✅ Created ${maintenanceSchedules.length} maintenance schedules\n`)
        }

        console.log('✨ Seed completed successfully!\n')
        console.log('📊 Summary:')
        console.log(`   - ${clients?.length} clients`)
        console.log(`   - ${assetTypes?.length} asset types`)
        console.log(`   - ${regions?.length} regions`)
        console.log(`   - ${createdStores?.length} stores`)
        console.log(`   - ${vendors?.length} vendors`)
        console.log(`   - ${createdAssets?.length} assets`)
        console.log(`   - ${projects?.length} projects`)
        console.log(`   - ${maintenanceSchedules.length} maintenance schedules`)
        console.log('\n🎉 Dev environment is ready for testing!\n')

    } catch (error) {
        console.error('❌ Seed failed:', error)
        process.exit(1)
    }
}

seed()
