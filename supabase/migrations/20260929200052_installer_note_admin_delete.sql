-- Match the super-admin delete controls on the desktop job page.
grant delete on public.installer_job_notes to authenticated;

create policy installer_job_notes_super_admin_delete
  on public.installer_job_notes for delete to authenticated
  using (rpm_private.current_role() = 'super_admin');
