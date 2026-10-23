ALTER TABLE inventory_history DROP CONSTRAINT inventory_history_kind_check;
ALTER TABLE inventory_history ADD CONSTRAINT inventory_history_kind_check
 CHECK (kind IN ('created','attributes','lifecycle','publish','unpublish','photos'));
CREATE TABLE inventory_photo_assets (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128 AND btrim(id)=id),
 record_id text NOT NULL,
 dealer_id text NOT NULL,
 jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 1 AND 20971520),
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 width integer NOT NULL CHECK (width BETWEEN 1 AND 10000),
 height integer NOT NULL CHECK (height BETWEEN 1 AND 10000),
 created_at timestamptz NOT NULL,
 CHECK (width::bigint*height::bigint <= 25000000),
 FOREIGN KEY(record_id,dealer_id) REFERENCES inventory_records(id,dealer_id),
 UNIQUE(id,record_id,dealer_id)
);
CREATE FUNCTION protect_inventory_photo_asset() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'inventory photo assets are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_photo_asset_guard BEFORE UPDATE OR DELETE ON inventory_photo_assets
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_photo_asset();
CREATE TABLE inventory_photo_references (
 record_id text NOT NULL,
 dealer_id text NOT NULL,
 photo_id text NOT NULL,
 position integer NOT NULL CHECK (position BETWEEN 0 AND 49),
 alt_text text NOT NULL CHECK (length(alt_text)<=240),
 PRIMARY KEY(record_id,photo_id),
 UNIQUE(record_id,position) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(photo_id,record_id,dealer_id) REFERENCES inventory_photo_assets(id,record_id,dealer_id)
);
GRANT SELECT,INSERT ON inventory_photo_assets TO app;
REVOKE UPDATE,DELETE,TRUNCATE ON inventory_photo_assets FROM app;
GRANT SELECT,INSERT,UPDATE,DELETE ON inventory_photo_references TO app;
REVOKE TRUNCATE ON inventory_photo_references FROM app;
