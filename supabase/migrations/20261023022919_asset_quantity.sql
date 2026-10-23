-- A site asset can represent multiple identical items. Existing records and
-- older clients that omit this field retain the previous meaning of one item.
ALTER TABLE public.assets
    ADD COLUMN quantity integer NOT NULL DEFAULT 1
    CONSTRAINT assets_quantity_positive CHECK (quantity >= 1);

NOTIFY pgrst, 'reload schema';
