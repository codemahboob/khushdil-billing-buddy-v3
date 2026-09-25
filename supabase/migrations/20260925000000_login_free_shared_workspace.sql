-- Login-free shared workspace for Khushdil Billing Buddy.
-- This intentionally exposes the app's single workspace to the public anon key.
-- Do NOT use this model for sensitive/private multi-user data.

DO $$
DECLARE
  workspace UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Remove auth-user foreign keys so the workspace can exist without an account.
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_user_id_fkey;
  ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_user_id_fkey;
  ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_user_id_fkey;
  ALTER TABLE public.event_items DROP CONSTRAINT IF EXISTS event_items_user_id_fkey;
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;

  -- Collapse any existing profile rows into the shared profile.
  DELETE FROM public.profiles WHERE id <> workspace;
  INSERT INTO public.profiles (id)
  VALUES (workspace)
  ON CONFLICT (id) DO NOTHING;

  -- Existing business data is moved to the shared workspace.
  UPDATE public.customers SET user_id = '00000000-0000-0000-0000-000000000001';
  UPDATE public.services SET user_id = '00000000-0000-0000-0000-000000000001';
  UPDATE public.events SET user_id = '00000000-0000-0000-0000-000000000001';
  UPDATE public.event_items SET user_id = '00000000-0000-0000-0000-000000000001';
  UPDATE public.invoices SET user_id = '00000000-0000-0000-0000-000000000001';

  -- Replace auth-only RLS policies with anon-access policies for this one workspace.
  DROP POLICY IF EXISTS "own profile select" ON public.profiles;
  DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
  DROP POLICY IF EXISTS "own profile update" ON public.profiles;
  DROP POLICY IF EXISTS "own customers" ON public.customers;
  DROP POLICY IF EXISTS "own services" ON public.services;
  DROP POLICY IF EXISTS "own events" ON public.events;
  DROP POLICY IF EXISTS "own event_items" ON public.event_items;
  DROP POLICY IF EXISTS "own invoices" ON public.invoices;

  CREATE POLICY "public workspace profile" ON public.profiles
    FOR ALL TO anon, authenticated
    USING (id = '00000000-0000-0000-0000-000000000001') WITH CHECK (id = '00000000-0000-0000-0000-000000000001');

  CREATE POLICY "public workspace customers" ON public.customers
    FOR ALL TO anon, authenticated
    USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

  CREATE POLICY "public workspace services" ON public.services
    FOR ALL TO anon, authenticated
    USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

  CREATE POLICY "public workspace events" ON public.events
    FOR ALL TO anon, authenticated
    USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

  CREATE POLICY "public workspace event_items" ON public.event_items
    FOR ALL TO anon, authenticated
    USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');

  CREATE POLICY "public workspace invoices" ON public.invoices
    FOR ALL TO anon, authenticated
    USING (user_id = '00000000-0000-0000-0000-000000000001') WITH CHECK (user_id = '00000000-0000-0000-0000-000000000001');
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO anon;

-- Public invoice-number allocator.
CREATE OR REPLACE FUNCTION public.allocate_invoice_number()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO public.profiles (id) VALUES ('00000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET next_invoice_no = next_invoice_no + 1
  WHERE id = '00000000-0000-0000-0000-000000000001'
  RETURNING next_invoice_no - 1 INTO n;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_invoice_number() TO anon, authenticated;
