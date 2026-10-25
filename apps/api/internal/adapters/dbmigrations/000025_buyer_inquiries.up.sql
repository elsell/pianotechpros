CREATE TABLE buyer_inquiries (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
 dealer_id text NOT NULL,
 record_id text NOT NULL,
 publication_revision bigint NOT NULL,
 dealer_name text NOT NULL CHECK (length(dealer_name) BETWEEN 1 AND 200),
 dealer_slug text NOT NULL CHECK (length(dealer_slug) BETWEEN 1 AND 80),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 buyer_name text NOT NULL CHECK (length(buyer_name) BETWEEN 1 AND 120),
 email text NOT NULL CHECK (octet_length(email) BETWEEN 1 AND 254),
 phone text NOT NULL CHECK (length(phone)<=40),
 preference text NOT NULL CHECK (preference IN ('email','phone','either')),
 message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL,
 UNIQUE(id,dealer_id),
 FOREIGN KEY(record_id,dealer_id,publication_revision)
  REFERENCES inventory_publication_snapshots(record_id,dealer_id,revision),
 CHECK(preference<>'phone' OR phone<>'')
);
CREATE INDEX buyer_inquiries_inbox ON buyer_inquiries(dealer_id,created_at DESC,id DESC);
CREATE FUNCTION validate_buyer_inquiry_insert() RETURNS trigger AS $$
BEGIN
 -- Match the application's lock order and reject stale/unpublished submissions.
 PERFORM 1 FROM dealer_models WHERE id=NEW.dealer_id AND showroom_published FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inquiry requires a public showroom'; END IF;
 PERFORM 1 FROM inventory_records WHERE id=NEW.record_id AND dealer_id=NEW.dealer_id FOR SHARE;
 IF NOT EXISTS (
  SELECT 1 FROM dealer_models d JOIN inventory_publications p ON p.dealer_id=d.id
   JOIN inventory_publication_snapshots s ON s.record_id=p.record_id
    AND s.dealer_id=p.dealer_id AND s.revision=p.publication_revision
  WHERE d.id=NEW.dealer_id AND d.showroom_published
   AND d.name=NEW.dealer_name AND d.slug=NEW.dealer_slug
   AND p.record_id=NEW.record_id AND p.visible
   AND p.publication_revision=NEW.publication_revision
   AND p.status IN ('available','reserved','sold')
   AND NEW.snapshot=s.snapshot || jsonb_build_object('Status',p.status)
 ) THEN RAISE EXCEPTION 'inquiry requires the current public snapshot'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER buyer_inquiry_insert_guard BEFORE INSERT ON buyer_inquiries
 FOR EACH ROW EXECUTE FUNCTION validate_buyer_inquiry_insert();
CREATE FUNCTION protect_buyer_inquiry() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'buyer inquiry contents are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER buyer_inquiry_immutable BEFORE UPDATE OR DELETE ON buyer_inquiries
 FOR EACH ROW EXECUTE FUNCTION protect_buyer_inquiry();
CREATE TRIGGER buyer_inquiry_truncate_guard BEFORE TRUNCATE ON buyer_inquiries
 FOR EACH STATEMENT EXECUTE FUNCTION protect_buyer_inquiry();
GRANT SELECT,INSERT ON buyer_inquiries TO app;
REVOKE UPDATE,DELETE,TRUNCATE ON buyer_inquiries FROM app;
