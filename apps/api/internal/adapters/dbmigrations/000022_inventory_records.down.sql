ALTER TABLE inventory_records DROP CONSTRAINT inventory_current_history;
DROP TABLE inventory_history;
DROP FUNCTION protect_inventory_history();
DROP TABLE inventory_records;
