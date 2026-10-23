CREATE TABLE inventory_records (
 id text PRIMARY KEY,
 dealer_id text NOT NULL REFERENCES dealer_models(id),
 stock_number text NOT NULL CHECK (length(btrim(stock_number)) BETWEEN 1 AND 80),
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 status text NOT NULL CHECK (status IN ('draft','available','reserved','in_service','sold','archived')),
 attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes)='object'),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
 UNIQUE (id,dealer_id),
 UNIQUE (dealer_id,stock_number)
);
CREATE TABLE inventory_history (
 record_id text NOT NULL,
 dealer_id text NOT NULL,
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 actor_user_id text NOT NULL REFERENCES user_models(id),
 source text NOT NULL CHECK (source IN ('manual','voice')),
 kind text NOT NULL CHECK (kind IN ('created','attributes','lifecycle','publish','unpublish')),
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
 audit_id text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(record_id,revision),
 FOREIGN KEY(record_id,dealer_id) REFERENCES inventory_records(id,dealer_id)
);
ALTER TABLE inventory_records ADD CONSTRAINT inventory_current_history
 FOREIGN KEY(id,revision) REFERENCES inventory_history(record_id,revision) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION protect_inventory_history() RETURNS trigger AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'inventory history is append-only'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM audit_event_models a JOIN dealer_models d ON d.id=NEW.dealer_id
  WHERE a.id=NEW.audit_id AND a.actor_user_id=NEW.actor_user_id
   AND a.owner_user_id=d.owner_user_id AND a.target_type='inventory'
   AND a.target_id=NEW.record_id AND a.outcome='succeeded'
   AND a.occurred_at=NEW.created_at
   AND a.action=CASE WHEN NEW.kind='created' THEN 'resource.created' ELSE 'resource.updated' END
 ) THEN RAISE EXCEPTION 'inventory history requires matching audit'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_history_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_history
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_history();
CREATE INDEX inventory_records_dealer_page ON inventory_records(dealer_id,created_at,id);
GRANT SELECT,INSERT,UPDATE ON inventory_records TO app;
GRANT SELECT,INSERT ON inventory_history TO app;
REVOKE DELETE,TRUNCATE ON inventory_records FROM app;
REVOKE UPDATE,DELETE,TRUNCATE ON inventory_history FROM app;
