
DROP FUNCTION IF EXISTS public.allocate_invoice_number(UUID);

CREATE OR REPLACE FUNCTION public.allocate_invoice_number() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INTEGER; uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.profiles (id) VALUES (uid) ON CONFLICT (id) DO NOTHING;
  UPDATE public.profiles SET next_invoice_no = next_invoice_no + 1
  WHERE id = uid RETURNING next_invoice_no - 1 INTO n;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_invoice_number() FROM anon;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number() TO authenticated;
