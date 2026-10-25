DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM inventory_scan_labels) THEN RAISE EXCEPTION 'cannot roll back retained scan labels'; END IF;
END; $$;
DROP TABLE inventory_scan_labels;
DROP FUNCTION protect_inventory_scan_label();
