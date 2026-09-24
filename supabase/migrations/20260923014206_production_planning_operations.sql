BEGIN;

-- An operation is a distinct piece of work. A job can revisit the same department.
-- Codes intentionally match the factory-workspace department catalogue without
-- depending on that separately developed feature's tables or role migration.
CREATE TABLE public.production_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.costing_jobs(id) ON DELETE CASCADE,
    department_code text NOT NULL CHECK (department_code IN
        ('cnc','design','metalwork','finishing','assembly','installation')),
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    sequence integer NOT NULL DEFAULT 0 CHECK (sequence BETWEEN 0 AND 9999),
    status text NOT NULL DEFAULT 'not_ready' CHECK (status IN
        ('not_ready','ready','scheduled','in_progress','paused','complete')),
    estimated_hours numeric(8,2) CHECK (estimated_hours BETWEEN 0 AND 999999),
    due_date date,
    progress_percent integer CHECK (progress_percent BETWEEN 0 AND 100),
    blocker_reason text CHECK (length(blocker_reason) <= 1000),
    created_by uuid DEFAULT auth.uid() REFERENCES public.users(id),
    updated_by uuid DEFAULT auth.uid() REFERENCES public.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, job_id),
    CHECK ((status = 'complete' AND progress_percent IS NOT DISTINCT FROM 100)
        OR (status <> 'complete' AND (progress_percent IS NULL OR progress_percent < 100)))
);
CREATE INDEX production_operations_department_queue ON public.production_operations(department_code, status, due_date);
CREATE INDEX production_operations_job ON public.production_operations(job_id, sequence);

-- Existing job-level actuals stay unassigned: attributing them to every stage
-- would double count. Future factory entry selects an operation explicitly.
ALTER TABLE public.costing_time_entries ADD COLUMN production_operation_id uuid;
ALTER TABLE public.costing_material_actuals ADD COLUMN production_operation_id uuid;
ALTER TABLE public.costing_time_entries ADD CONSTRAINT time_production_operation_job_fk
    FOREIGN KEY (production_operation_id, job_id) REFERENCES public.production_operations(id, job_id);
ALTER TABLE public.costing_material_actuals ADD CONSTRAINT material_production_operation_job_fk
    FOREIGN KEY (production_operation_id, job_id) REFERENCES public.production_operations(id, job_id);
CREATE INDEX time_production_operation ON public.costing_time_entries(production_operation_id)
    WHERE production_operation_id IS NOT NULL;
CREATE INDEX material_production_operation ON public.costing_material_actuals(production_operation_id)
    WHERE production_operation_id IS NOT NULL;

ALTER TABLE public.production_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_operations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.production_operations TO authenticated;
CREATE POLICY production_operations_admin ON public.production_operations FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid())
        AND role::text IN ('super_admin','rodier_admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = (SELECT auth.uid())
        AND role::text IN ('super_admin','rodier_admin')));

CREATE FUNCTION public.validate_production_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()
        AND role::text IN ('super_admin','rodier_admin')) THEN
        RAISE EXCEPTION 'Production planning access denied' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.job_id <> OLD.job_id OR NEW.department_code <> OLD.department_code) THEN
        RAISE EXCEPTION 'An existing operation cannot move to another job or department';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.costing_jobs j WHERE j.id = NEW.job_id
        AND j.status::text IN ('approved','in_progress','complete','invoiced')
        AND NOT j.is_template) THEN
        RAISE EXCEPTION 'Select an approved production job, not a quote or template';
    END IF;
    IF NEW.status = 'complete' THEN NEW.progress_percent := 100; END IF;
    NEW.updated_at := clock_timestamp();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_production_operation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER production_operations_validate BEFORE INSERT OR UPDATE ON public.production_operations
    FOR EACH ROW EXECUTE FUNCTION public.validate_production_operation();

-- Invoker security preserves RLS on operations, jobs, clients and time entries.
-- No costs, sell prices or quote lines are included in this projection.
CREATE VIEW public.production_planning WITH (security_invoker = true) AS
SELECT o.*, j.job_number,
    coalesce(nullif(to_jsonb(j)->>'production_title',''), j.title) AS job_title,
    j.status::text AS job_status, j.client_id, c.name AS client_name,
    coalesce(o.due_date, nullif(to_jsonb(j)->>'due_date','')::date,
        nullif(to_jsonb(j)->>'completion_date','')::date) AS effective_due_date,
    t.actual_hours
FROM public.production_operations o
JOIN public.costing_jobs j ON j.id = o.job_id
LEFT JOIN public.clients c ON c.id = j.client_id
LEFT JOIN LATERAL (
    SELECT sum(e.hours) AS actual_hours FROM public.costing_time_entries e
    WHERE e.production_operation_id = o.id AND e.job_id = o.job_id
) t ON true;
REVOKE ALL ON public.production_planning FROM anon, authenticated;
GRANT SELECT ON public.production_planning TO authenticated;

COMMENT ON TABLE public.production_operations IS
    'Department operations; explicit completion independent of consumed labour. Future capacity allocations reference operation id.';
COMMENT ON COLUMN public.production_operations.progress_percent IS
    'Manually assessed physical completion. NULL means not assessed; complete status always means 100.';
COMMIT;
