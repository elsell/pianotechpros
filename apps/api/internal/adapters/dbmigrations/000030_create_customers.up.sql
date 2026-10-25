CREATE TABLE customer_models (
 id text PRIMARY KEY,
 owner_user_id text NOT NULL UNIQUE REFERENCES user_models(id),
 name text NOT NULL,
 is_business boolean NOT NULL,
 business_name text NOT NULL,
 email text NOT NULL,
 phone text NOT NULL,
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 locations jsonb NOT NULL CHECK (jsonb_typeof(locations)='array' AND jsonb_array_length(locations) BETWEEN 1 AND 50),
 pianos jsonb NOT NULL CHECK (jsonb_typeof(pianos)='array' AND jsonb_array_length(pianos) BETWEEN 0 AND 200),
 last_audit_id text NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
 CHECK (octet_length(locations::text)+octet_length(pianos::text) <= 4194304)
);
CREATE FUNCTION protect_customer_profile() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer profile deletion is not supported'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.created_at<>NEW.updated_at THEN
   RAISE EXCEPTION 'customer creation requires initial revision and timestamps';
  END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.owner_user_id<>OLD.owner_user_id OR NEW.created_at<>OLD.created_at
   OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR NEW.last_audit_id=OLD.last_audit_id THEN
   RAISE EXCEPTION 'customer update requires stable identity and next audited revision';
  END IF;
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.audit_event_models a
  WHERE a.id=NEW.last_audit_id AND a.owner_user_id=NEW.owner_user_id
   AND a.actor_user_id=NEW.owner_user_id AND a.target_type='customer'
   AND a.target_id=NEW.id AND a.outcome='succeeded' AND a.occurred_at=NEW.updated_at
   AND a.xmin=pg_current_xact_id()::xid
   AND a.action=CASE WHEN TG_OP='INSERT' THEN 'resource.created' ELSE 'resource.updated' END
 ) THEN RAISE EXCEPTION 'customer mutation requires matching audit'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public;
CREATE TRIGGER customer_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON customer_models
 FOR EACH ROW EXECUTE FUNCTION protect_customer_profile();
GRANT SELECT, INSERT, UPDATE ON customer_models TO app;
REVOKE DELETE, TRUNCATE ON customer_models FROM app;
