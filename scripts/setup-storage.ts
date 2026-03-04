import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setup() {
    const sql = `
-- Create job-attachments bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('job-attachments', 'job-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'job-attachments');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Upload' AND tablename = 'objects' AND schemaname = 'storage') THEN
        CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'job-attachments');
    END IF;
END $$;

-- Update jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}';
    `

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('Error executing SQL:', error)
    } else {
        console.log('SQL executed successfully:', data)
    }
}

setup()
