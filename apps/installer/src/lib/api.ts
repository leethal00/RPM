import { supabase } from './supabase';

export type Job = { id: string; job_number: string | null; title: string; status: string; store_id: string | null; site_name: string | null; address: string | null; client_name: string | null; installation_notes?: string | null; details?: string | null; production_details?: string | null; notes?: string | null; lat?: number | null; lng?: number | null };
export type Site = { id: string; name: string; address: string | null; lat: number | null; lng: number | null; manager_name: string | null; manager_phone: string | null; client_name: string };
export type Timer = { id: string; job_id: string; kind: 'travel' | 'work'; started_at: string; stopped_at?: string | null };
export type Document = { id: string; title: string; name: string; path: string };
export type PhotoCategory = 'Production' | 'Installation' | 'Site Survey' | 'Delivery';
export type Photo = { id: string; path: string; caption: string | null; category: PhotoCategory; captured_at: string };
export type SitePhoto = { id: string; url: string; caption: string | null };
export type GalleryPhoto = SitePhoto & { album_id: string | null; album_name: string | null; created_at: string | null };
export type SiteGallery = { site: Pick<Site, 'id' | 'name' | 'address' | 'lat' | 'lng' | 'client_name'>; photos: GalleryPhoto[] };
export type InstallerNote = { id: string; body: string; created_at: string; author: string };
export type Material = { id: string; description: string; qty: number; unit: string | null; section: string | null };
export type TimeEntry = { id: string; work_date: string; person_name: string | null; hours: number; description: string | null; labour_type: string | null };
export type Workspace = { jobs: Job[]; sites: Site[]; job: Job | null; documents: Document[]; photos: Photo[]; site_photos: SitePhoto[]; timer: Timer | null; materials?: Material[]; time_entries?: TimeEntry[] };
export type SuperuserPhotoJob = { job_id: string; job_number: string | null; title: string; client_name: string | null; site_name: string | null; photo_count: number; latest_photo_at: string };

export const isAdminRole = (role: string | null) => role === 'mobile_admin' || role === 'rodier_admin' || role === 'super_admin';

async function currentRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in required');
  const { data, error } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (error) throw error;
  return data.role as string;
}

export async function workspace(jobId?: string, siteSearch?: string): Promise<Workspace> {
  const role = await currentRole();
  const { data, error } = await supabase.rpc(isAdminRole(role) ? 'mobile_admin_workspace' : 'installer_workspace', { p_job_id: jobId ?? null, p_site_search: siteSearch ?? null });
  if (error) throw error;
  return data as Workspace;
}

export async function siteGallery(siteId: string): Promise<SiteGallery> {
  const { data, error } = await supabase.rpc('mobile_site_gallery', { p_site_id: siteId });
  if (error) throw error;
  return data as SiteGallery;
}

export async function saveTimeEntry(jobId: string, entry: { id?: string; work_date: string; hours: number; description: string; labour_type: string }) {
  const { data, error } = await supabase.rpc('mobile_admin_save_time_entry', { p_job_id: jobId, p_entry_id: entry.id ?? null, p_work_date: entry.work_date, p_hours: entry.hours, p_description: entry.description, p_labour_type: entry.labour_type });
  if (error) throw error;
  return data as TimeEntry;
}

export async function timerAction(jobId: string, kind: 'travel' | 'work', action: 'start' | 'stop') {
  const { data, error } = await supabase.rpc('installer_timer', { p_job_id: jobId, p_kind: kind, p_action: action });
  if (error) throw error;
  return data as Timer;
}

export async function jobNotes(jobId: string): Promise<InstallerNote[]> {
  const { data, error } = await supabase.rpc('installer_job_notes', { p_job_id: jobId });
  if (error) throw error;
  return data as InstallerNote[];
}

export async function addJobNote(jobId: string, body: string): Promise<InstallerNote> {
  const { data, error } = await supabase.rpc('installer_add_job_note', { p_job_id: jobId, p_body: body });
  if (error) throw error;
  return data as InstallerNote;
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

export async function deletablePhotoIds(jobId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('installer_deletable_photo_ids', { p_job_id: jobId });
  if (error) throw error;
  return data as string[];
}

export async function deleteJobPhoto(photo: Photo, asSuperuser = false): Promise<void> {
  const { error: storageError } = await supabase.storage.from('installer-photos').remove([photo.path]);
  if (storageError) throw storageError;
  if (asSuperuser) {
    const { error } = await supabase.from('installer_photos').delete().eq('id', photo.id).select('id').single();
    if (error) throw error;
  } else {
    const { error } = await supabase.rpc('installer_delete_job_photo', { p_photo_id: photo.id });
    if (error) throw error;
  }
}

export async function superuserPhotoJobs(search: string, offset = 0): Promise<SuperuserPhotoJob[]> {
  const { data, error } = await supabase.rpc('superuser_photo_jobs', { p_search: search, p_offset: offset });
  if (error) throw error;
  return data as SuperuserPhotoJob[];
}
