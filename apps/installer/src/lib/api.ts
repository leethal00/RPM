import { supabase } from './supabase';

export type Job = { id: string; job_number: string | null; title: string; status: string; store_id: string | null; site_name: string | null; address: string | null; client_name: string | null; installation_notes?: string | null; lat?: number | null; lng?: number | null };
export type Site = { id: string; name: string; address: string | null; lat: number | null; lng: number | null; manager_name: string | null; manager_phone: string | null; client_name: string };
export type Timer = { id: string; job_id: string; kind: 'travel' | 'work'; started_at: string; stopped_at?: string | null };
export type Document = { id: string; title: string; name: string; path: string };
export type Photo = { id: string; path: string; caption: string | null; captured_at: string };
export type SitePhoto = { id: string; url: string; caption: string | null };
export type Workspace = { jobs: Job[]; sites: Site[]; job: Job | null; documents: Document[]; photos: Photo[]; site_photos: SitePhoto[]; timer: Timer | null };

export async function workspace(jobId?: string, siteSearch?: string): Promise<Workspace> {
  const { data, error } = await supabase.rpc('installer_workspace', { p_job_id: jobId ?? null, p_site_search: siteSearch ?? null });
  if (error) throw error;
  return data as Workspace;
}

export async function timerAction(jobId: string, kind: 'travel' | 'work', action: 'start' | 'stop') {
  const { data, error } = await supabase.rpc('installer_timer', { p_job_id: jobId, p_kind: kind, p_action: action });
  if (error) throw error;
  return data as Timer;
}

export async function documentUrl(path: string) {
  const { data, error } = await supabase.storage.from('construction-drawings').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function photoUrl(path: string) {
  const { data, error } = await supabase.storage.from('installer-photos').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
