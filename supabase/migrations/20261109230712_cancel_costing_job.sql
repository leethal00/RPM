-- costing_status already includes cancelled. Preserve all BOMs and invoice links.
ALTER TABLE public.costing_jobs
  ADD COLUMN cancelled_at timestamptz,
  ADD COLUMN cancelled_by uuid REFERENCES public.users(id),
  ADD COLUMN cancellation_reason text CHECK (length(cancellation_reason) <= 2000);

CREATE OR REPLACE FUNCTION public.guard_costing_job_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status::text = 'cancelled' THEN
      RAISE EXCEPTION 'Cancelled jobs must be retained as history';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status::text = 'cancelled' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
      OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
      OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason THEN
      RAISE EXCEPTION 'Cancelled jobs cannot be reopened or their cancellation history changed';
    END IF;
  ELSIF NEW.status::text = 'cancelled' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Create an active job before cancelling it';
    END IF;
    IF OLD.status::text <> 'in_progress' OR OLD.is_template THEN
      RAISE EXCEPTION 'Only active jobs can be cancelled';
    END IF;
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text IN ('super_admin', 'rodier_admin')
    ) THEN
      RAISE EXCEPTION 'Only Rodier admins can cancel jobs' USING ERRCODE = '42501';
    END IF;
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
    NEW.cancellation_reason := nullif(btrim(NEW.cancellation_reason), '');
    NEW.updated_at := now();
  ELSIF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Cancellation history requires a cancelled job';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_costing_job_cancellation() FROM PUBLIC;
CREATE TRIGGER guard_costing_job_cancellation
BEFORE INSERT OR UPDATE OR DELETE ON public.costing_jobs
FOR EACH ROW EXECUTE FUNCTION public.guard_costing_job_cancellation();
