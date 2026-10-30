import { supabase } from './supabase';
import { SwmsBody } from './health-safety-form';

export type HsSummary = { id: string; kind: 'swms' | 'toolbox'; title: string; status: string; work_date: string; date_tbc?: boolean; revision: number; job_id: string | null; job_reference: string | null; site: string | null };
export type HsRecord = HsSummary & { body: SwmsBody; updated_at: string; can_edit: boolean; template_id: string | null };
export type SiteHealthSafety = {
  site: { id: string; name: string; address: string | null; client_name: string };
  can_create: boolean; records: HsSummary[]; record: HsRecord | null;
  attendees: { id: string; name: string; signed_at: string | null }[];
  attachments: { id: string; file_name: string; storage_path: string }[];
  jobs: { id: string; title: string; job_number: string | null }[];
  templates: { id: string; title: string; version: number; body: SwmsBody }[];
};
export async function siteHealthSafety(siteId: string, recordId?: string): Promise<SiteHealthSafety> {
  const { data, error } = await supabase.rpc('mobile_site_health_safety', { p_site_id: siteId, p_record_id: recordId ?? null });
  if (error) throw error;
  return data as SiteHealthSafety;
}
export async function saveSwmsDraft(input: { siteId: string; id: string; title: string; date: string | null; body: SwmsBody; jobId: string | null; attendees: string[]; updatedAt: string | null; templateId: string | null }): Promise<{ id: string; updated_at: string }> {
  const { data, error } = await supabase.rpc('mobile_save_swms_draft', {
    p_site_id: input.siteId, p_record_id: input.id, p_title: input.title, p_work_date: input.date,
    p_body: input.body, p_job_id: input.jobId, p_attendees: input.attendees,
    p_expected_updated_at: input.updatedAt, p_template_id: input.templateId,
  });
  if (error) throw error;
  return data;
}
export async function hsAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('health-safety').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
