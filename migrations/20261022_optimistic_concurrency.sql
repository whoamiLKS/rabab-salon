-- STAGED MIGRATION: apply only with coordinated frontend rollout.
-- Does not delete or replace existing salon data.
BEGIN;
ALTER TABLE public.salon_data ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.save_salon_state_if_current(
  p_expected_revision bigint, p_state jsonb
) RETURNS TABLE(saved boolean, current_revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_revision bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object'
     OR jsonb_typeof(p_state->'clients') <> 'array'
     OR jsonb_typeof(p_state->'invoices') <> 'array' THEN
    RAISE EXCEPTION 'Invalid salon state';
  END IF;
  UPDATE public.salon_data
  SET state_json = p_state, revision = revision + 1, updated_at = clock_timestamp()
  WHERE id = 'main_salon' AND revision = p_expected_revision
  RETURNING revision INTO v_revision;
  IF FOUND THEN
    RETURN QUERY SELECT true, v_revision;
  ELSE
    RETURN QUERY SELECT false, s.revision
    FROM public.salon_data s WHERE s.id = 'main_salon';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_salon_state_if_current(bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_salon_state_if_current(bigint,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_salon_state_if_current(bigint,jsonb) TO authenticated;
COMMIT;

-- IMPORTANT: Only AFTER verified frontend rollout, revoke direct writes:
-- REVOKE INSERT, UPDATE ON public.salon_data FROM authenticated;
-- Existing clients using upsert will then fail instead of bypassing revision control.
