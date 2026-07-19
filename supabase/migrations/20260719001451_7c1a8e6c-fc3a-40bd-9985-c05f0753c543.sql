
ALTER TABLE public.beverage_catalog
  ADD COLUMN IF NOT EXISTS cloudbeds_item_id text;

CREATE UNIQUE INDEX IF NOT EXISTS beverage_catalog_property_cloudbeds_item_id_key
  ON public.beverage_catalog (property, cloudbeds_item_id)
  WHERE cloudbeds_item_id IS NOT NULL;
