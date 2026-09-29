-- Installers may view every photo on a job they can access, regardless of
-- which installer uploaded it. Uploads remain confined to the actor's own
-- path; the separate delete policy still controls removal.
drop policy if exists installer_storage_boundary on storage.objects;
create policy installer_storage_boundary on storage.objects
  as restrictive for all to authenticated
  using (
    coalesce(rpm_private.current_role(), '') not in ('installer', 'mobile_admin')
    or bucket_id in ('health-safety', 'hs-incidents')
    or (bucket_id = 'installer-photos'
      and rpm_private.installer_can_access_job((storage.foldername(name))[1]))
    or (bucket_id = 'construction-drawings'
      and rpm_private.installer_can_access_site((storage.foldername(name))[1]))
  )
  with check (
    coalesce(rpm_private.current_role(), '') not in ('installer', 'mobile_admin')
    or bucket_id = 'hs-incidents'
    or (bucket_id = 'installer-photos'
      and (storage.foldername(name))[2] = auth.uid()::text
      and rpm_private.installer_can_access_job((storage.foldername(name))[1]))
  );

