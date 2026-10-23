DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM inventory_publication_snapshots) THEN
  RAISE EXCEPTION 'cannot roll back retained publication snapshots';
 END IF;
END;
$$;
DROP TABLE inventory_publications;
DROP FUNCTION protect_inventory_publication_pointer();
DROP TABLE inventory_publication_photos;
DROP TABLE inventory_publication_snapshots;
DROP FUNCTION protect_inventory_publication_snapshot();
DROP FUNCTION validate_inventory_publication_insert();
DROP FUNCTION validate_inventory_publication_photo_insert();
DROP FUNCTION verify_inventory_publication_photos();
