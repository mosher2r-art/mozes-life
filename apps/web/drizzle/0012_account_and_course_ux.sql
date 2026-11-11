-- Additive preferences and reversible course trash. No content, enrollments or files are deleted.
ALTER TABLE public."user" ADD COLUMN password_setup_dismissed_at timestamptz;
ALTER TABLE public.course ADD COLUMN archived_at timestamptz;
ALTER TABLE public.course ADD COLUMN archived_by text REFERENCES public."user"(id) ON DELETE SET NULL;
ALTER TABLE public.course ADD COLUMN archived_previous_status text CHECK(archived_previous_status IN ('draft','published'));
CREATE INDEX course_active_updated_idx ON public.course(updated_at DESC) WHERE status <> 'archived';
