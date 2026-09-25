-- Separate product/service catalog classification.
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'service';
ALTER TABLE public.services DROP CONSTRAINT IF EXISTS services_item_type_check;
ALTER TABLE public.services ADD CONSTRAINT services_item_type_check CHECK (item_type IN ('service', 'product'));
