DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM inventory_history WHERE field_sources IS NOT NULL OR source='mixed') THEN
  RAISE EXCEPTION 'cannot downgrade recorded inventory provenance';
 END IF;
END $$;
DROP TRIGGER inventory_history_provenance_guard ON inventory_history;
DROP FUNCTION protect_inventory_field_sources();
ALTER TABLE inventory_history DROP CONSTRAINT inventory_history_source_check;
ALTER TABLE inventory_history ADD CONSTRAINT inventory_history_source_check CHECK (source IN ('manual','voice'));
ALTER TABLE inventory_history DROP COLUMN field_sources;
