-- Default privileges on rpm-dev grant anon access to new public tables.
-- RLS already denies rows, but remove anonymous Data API/GraphQL exposure too.
revoke all privileges on table
  public.hs_templates,
  public.hs_records,
  public.hs_attendees,
  public.hs_attachments,
  public.hs_training,
  public.hs_policies,
  public.hs_audit
from anon, public;

revoke all privileges on sequence public.hs_audit_id_seq from anon, public;
