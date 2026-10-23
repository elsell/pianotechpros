CREATE TABLE inventory_publication_snapshots (
 record_id text NOT NULL,
 dealer_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision BETWEEN 2 AND 9007199254740991),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 PRIMARY KEY(record_id,revision),
 UNIQUE(record_id,dealer_id,revision),
 FOREIGN KEY(record_id,dealer_id) REFERENCES inventory_records(id,dealer_id),
 FOREIGN KEY(record_id,revision) REFERENCES inventory_history(record_id,revision)
);
CREATE TABLE inventory_publication_photos (
 record_id text NOT NULL,
 dealer_id text NOT NULL,
 publication_revision bigint NOT NULL,
 photo_id text NOT NULL,
 PRIMARY KEY(record_id,publication_revision,photo_id),
 FOREIGN KEY(record_id,dealer_id,publication_revision) REFERENCES inventory_publication_snapshots(record_id,dealer_id,revision),
 FOREIGN KEY(photo_id,record_id,dealer_id) REFERENCES inventory_photo_assets(id,record_id,dealer_id)
);
CREATE FUNCTION validate_inventory_publication_insert() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM inventory_history h JOIN inventory_records r
  ON r.id=h.record_id AND r.dealer_id=h.dealer_id AND r.revision=h.revision
  WHERE h.record_id=NEW.record_id AND h.dealer_id=NEW.dealer_id
   AND h.revision=NEW.revision AND h.kind='publish'
 ) OR NEW.snapshot->>'ID' IS DISTINCT FROM NEW.record_id
   OR NEW.snapshot->>'DealerID' IS DISTINCT FROM NEW.dealer_id
   OR NEW.snapshot->>'PublicationRevision' IS DISTINCT FROM NEW.revision::text
   OR jsonb_typeof(NEW.snapshot->'Photos') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'snapshot requires matching current publication history';
 END IF;
 IF jsonb_array_length(NEW.snapshot->'Photos') NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'snapshot requires bounded photos';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_publication_insert_guard BEFORE INSERT ON inventory_publication_snapshots
 FOR EACH ROW EXECUTE FUNCTION validate_inventory_publication_insert();
CREATE FUNCTION validate_inventory_publication_photo_insert() RETURNS trigger AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM inventory_publication_snapshots s JOIN inventory_records r
   ON r.id=s.record_id AND r.dealer_id=s.dealer_id AND r.revision=s.revision
  WHERE s.record_id=NEW.record_id AND s.dealer_id=NEW.dealer_id
   AND s.revision=NEW.publication_revision
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.snapshot->'Photos') p WHERE p->>'ID'=NEW.photo_id)
 ) THEN RAISE EXCEPTION 'photo references belong to the current immutable snapshot'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_publication_photo_insert_guard BEFORE INSERT ON inventory_publication_photos
 FOR EACH ROW EXECUTE FUNCTION validate_inventory_publication_photo_insert();
CREATE FUNCTION verify_inventory_publication_photos() RETURNS trigger AS $$
BEGIN
 IF (SELECT count(*) FROM inventory_publication_photos p WHERE p.record_id=NEW.record_id AND p.publication_revision=NEW.revision)
   <> jsonb_array_length(NEW.snapshot->'Photos') THEN
  RAISE EXCEPTION 'snapshot requires all retained photo references';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER inventory_publication_photo_completeness AFTER INSERT ON inventory_publication_snapshots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_inventory_publication_photos();
CREATE FUNCTION protect_inventory_publication_snapshot() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'inventory publication snapshots and references are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_publication_snapshot_guard BEFORE UPDATE OR DELETE ON inventory_publication_snapshots
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_publication_snapshot();
CREATE TRIGGER inventory_publication_photo_guard BEFORE UPDATE OR DELETE ON inventory_publication_photos
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_publication_snapshot();
CREATE TRIGGER inventory_publication_snapshot_truncate_guard BEFORE TRUNCATE ON inventory_publication_snapshots
 FOR EACH STATEMENT EXECUTE FUNCTION protect_inventory_publication_snapshot();
CREATE TRIGGER inventory_publication_photo_truncate_guard BEFORE TRUNCATE ON inventory_publication_photos
 FOR EACH STATEMENT EXECUTE FUNCTION protect_inventory_publication_snapshot();
CREATE TABLE inventory_publications (
 record_id text PRIMARY KEY,
 dealer_id text NOT NULL,
 publication_revision bigint NOT NULL,
 applied_revision bigint NOT NULL CHECK (applied_revision BETWEEN publication_revision AND 9007199254740991),
 visible boolean NOT NULL,
 status text NOT NULL CHECK (status IN ('draft','available','reserved','in_service','sold','archived')),
 CHECK (NOT visible OR status IN ('available','reserved','sold')),
 FOREIGN KEY(record_id,dealer_id,publication_revision) REFERENCES inventory_publication_snapshots(record_id,dealer_id,revision),
 FOREIGN KEY(record_id,applied_revision) REFERENCES inventory_history(record_id,revision)
);
CREATE FUNCTION protect_inventory_publication_pointer() RETURNS trigger AS $$
DECLARE command_kind text;
BEGIN
 SELECT h.kind INTO command_kind FROM inventory_history h JOIN inventory_records r
 ON r.id=h.record_id AND r.dealer_id=h.dealer_id AND r.revision=h.revision
 WHERE h.record_id=NEW.record_id AND h.dealer_id=NEW.dealer_id
 AND h.revision=NEW.applied_revision AND r.status=NEW.status;
 IF command_kind IS NULL OR command_kind NOT IN ('publish','unpublish','lifecycle') THEN
  RAISE EXCEPTION 'publication pointer requires current audited command history';
 END IF;
 IF TG_OP='INSERT' THEN
  IF command_kind<>'publish' OR NOT NEW.visible OR NEW.publication_revision<>NEW.applied_revision THEN
   RAISE EXCEPTION 'initial publication requires explicit publish';
  END IF;
 ELSE
  IF NEW.record_id<>OLD.record_id OR NEW.dealer_id<>OLD.dealer_id OR NEW.applied_revision<=OLD.applied_revision THEN
   RAISE EXCEPTION 'publication pointer requires a newer scoped revision';
  END IF;
  IF command_kind<>'publish' AND (NEW.publication_revision<>OLD.publication_revision OR (NEW.visible AND NOT OLD.visible)) THEN
   RAISE EXCEPTION 'only publish can replace or reveal a snapshot';
  END IF;
 END IF;
 IF command_kind='publish' AND (NOT NEW.visible OR NEW.publication_revision<>NEW.applied_revision) THEN
  RAISE EXCEPTION 'publish must select its new visible snapshot';
 END IF;
 IF command_kind='unpublish' AND NEW.visible THEN RAISE EXCEPTION 'unpublish must hide'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_publication_pointer_guard BEFORE INSERT OR UPDATE ON inventory_publications
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_publication_pointer();
GRANT SELECT,INSERT ON inventory_publication_snapshots,inventory_publication_photos TO app;
REVOKE UPDATE,DELETE,TRUNCATE ON inventory_publication_snapshots,inventory_publication_photos FROM app;
GRANT SELECT,INSERT,UPDATE ON inventory_publications TO app;
REVOKE DELETE,TRUNCATE ON inventory_publications FROM app;
