CREATE TABLE technician_models (
 id text PRIMARY KEY,
 owner_user_id text NOT NULL UNIQUE REFERENCES user_models(id),
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 attributes jsonb NOT NULL CHECK (jsonb_typeof(attributes)='object'),
 last_audit_id text NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
 CHECK (octet_length(attributes::text) <= 4194304)
);
CREATE FUNCTION protect_technician_profile() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'technician profile deletion is not supported'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 OR NEW.created_at<>NEW.updated_at THEN
   RAISE EXCEPTION 'technician creation requires initial revision and timestamps';
  END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.owner_user_id<>OLD.owner_user_id OR NEW.created_at<>OLD.created_at
   OR NEW.revision<>OLD.revision+1 OR NEW.updated_at<OLD.updated_at OR NEW.last_audit_id=OLD.last_audit_id THEN
   RAISE EXCEPTION 'technician update requires stable identity and next audited revision';
  END IF;
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.audit_event_models a
  WHERE a.id=NEW.last_audit_id AND a.owner_user_id=NEW.owner_user_id
   AND a.actor_user_id=NEW.owner_user_id AND a.target_type='technician'
   AND a.target_id=NEW.id AND a.outcome='succeeded' AND a.occurred_at=NEW.updated_at
   AND a.xmin=pg_current_xact_id()::xid
   AND a.action=CASE WHEN TG_OP='INSERT' THEN 'resource.created' ELSE 'resource.updated' END
 ) THEN RAISE EXCEPTION 'technician mutation requires matching audit'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public;
CREATE TRIGGER technician_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON technician_models
 FOR EACH ROW EXECUTE FUNCTION protect_technician_profile();
GRANT SELECT, INSERT, UPDATE ON technician_models TO app;
REVOKE DELETE, TRUNCATE ON technician_models FROM app;
