import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing env variables for seeding')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function seed() {
    console.log('Seeding data...')

    // 1. Create a Client
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert({
            name: "St Pierre's Sushi",
            primary_color: '#2D6A4F',
        })
        .select()
        .single()

    if (clientError) {
        console.error('Error creating client:', clientError)
        return
    }

    console.log('Created client:', client.name)

    // 2. Create Asset Types
    const assetTypes = [
        { label: 'Digital Menu Board', icon_name: 'Monitor' },
        { label: 'Pylon Sign', icon_name: 'ArrowUp' },
        { label: 'Fascia Sign', icon_name: 'Layout' },
        { label: 'Internal Lightbox', icon_name: 'Box' },
    ]

    const { data: createdAssetTypes, error: assetTypeError } = await supabase
        .from('asset_types')
        .insert(assetTypes)
        .select()

    if (assetTypeError) {
        console.error('Error creating asset types:', assetTypeError)
        return
    }

    console.log('Created asset types')

    // 3. Create Stores (Example Sample)
    const stores = [
        {
            client_id: client.id,
            name: 'St Pierre’s — Ponsonby',
            region: 'Auckland',
            address: '254 Ponsonby Road, Ponsonby, Auckland 1011',
            lat: -36.853,
            lng: 174.747,
            status: 'active',
        },
        {
            client_id: client.id,
            name: 'St Pierre’s — Sylvia Park',
            region: 'Auckland',
            address: '286 Mount Wellington Highway, Mount Wellington, Auckland 1060',
            lat: -36.915,
            lng: 174.842,
            status: 'active',
            bento_bowl: true,
        },
    ]

    const { data: createdStores, error: storeError } = await supabase
        .from('stores')
        .insert(stores)
        .select()

    if (storeError) {
        console.error('Error creating stores:', storeError)
        return
    }

    console.log('Created stores')

    console.log('Seeding completed successfully!')
}

seed()
