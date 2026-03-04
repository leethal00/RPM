import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setup() {
    console.log('Creating maintenance_schedules table...')

    const sql = `
-- Create maintenance_schedules table
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
    task_name text NOT NULL,
    frequency_days integer NOT NULL,
    last_completed_at timestamp with time zone,
    next_due_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable all for authenticated users" ON public.maintenance_schedules
    FOR ALL USING (auth.role() = 'authenticated');

-- Function to calculated next_due_at automatically could be added later, 
-- but for now we will handle it in the application logic.
    `

    // Note: Since exec_sql is missing, I'll recommend the user run this in the SQL editor.
    // But I'll try to run it via a direct query if possible (not supported for CREATE TABLE via regular client).

    console.log('Please run the following SQL in your Supabase SQL Editor:')
    console.log(sql)
}

setup()
