DROP TABLE inventory_photo_references;
DROP TABLE inventory_photo_assets;
DROP FUNCTION protect_inventory_photo_asset();
-- Photo history is append-only. Rollback with photo history present fails closed.
ALTER TABLE inventory_history DROP CONSTRAINT inventory_history_kind_check;
ALTER TABLE inventory_history ADD CONSTRAINT inventory_history_kind_check
 CHECK (kind IN ('created','attributes','lifecycle','publish','unpublish'));
