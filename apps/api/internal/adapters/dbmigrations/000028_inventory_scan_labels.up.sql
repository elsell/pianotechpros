CREATE TABLE inventory_scan_labels (
 record_id text PRIMARY KEY,
 dealer_id text NOT NULL,
 token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' AND token<>repeat('A',43)),
 created_by text NOT NULL REFERENCES user_models(id),
 created_at timestamptz NOT NULL CHECK (created_at>'0001-01-01 00:00:00+00' AND created_at<'10000-01-01 00:00:00+00'),
 audit_id text NOT NULL UNIQUE,
 FOREIGN KEY(record_id,dealer_id) REFERENCES inventory_records(id,dealer_id)
);
CREATE FUNCTION protect_inventory_scan_label() RETURNS trigger AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'inventory scan labels are immutable'; END IF;
 PERFORM 1 FROM authorization_resource_lock_models WHERE resource_type='dealer' AND resource_id=NEW.dealer_id FOR UPDATE;
 PERFORM 1 FROM dealer_models WHERE id=NEW.dealer_id FOR UPDATE;
 PERFORM 1 FROM dealer_memberships WHERE dealer_id=NEW.dealer_id AND user_id=NEW.created_by FOR UPDATE;
 PERFORM 1 FROM user_models WHERE id=NEW.created_by AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'scan label requires active authority'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM dealer_models d JOIN dealer_memberships m ON m.dealer_id=d.id
  JOIN inventory_records r ON r.dealer_id=d.id JOIN audit_event_models a ON a.id=NEW.audit_id
  WHERE d.id=NEW.dealer_id AND r.id=NEW.record_id AND NEW.created_at>=r.created_at
  AND m.user_id=NEW.created_by AND m.active AND m.granted_revision=m.revision
  AND m.role IN ('owner','editor','viewer') AND (m.role='owner')=(d.owner_user_id=m.user_id)
  AND a.actor_user_id=m.user_id AND a.owner_user_id=d.owner_user_id
  AND a.target_type='inventory_scan' AND a.target_id=r.id AND a.action='resource.created'
  AND a.outcome='succeeded' AND a.occurred_at=NEW.created_at
  AND a.xmin=pg_current_xact_id()::xid
 ) THEN RAISE EXCEPTION 'scan label requires matching authority and audit'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_scan_label_guard BEFORE INSERT OR UPDATE OR DELETE ON inventory_scan_labels
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_scan_label();
CREATE TRIGGER inventory_scan_label_no_truncate BEFORE TRUNCATE ON inventory_scan_labels
 FOR EACH STATEMENT EXECUTE FUNCTION protect_inventory_scan_label();
GRANT SELECT,INSERT ON inventory_scan_labels TO app;
REVOKE UPDATE,DELETE,TRUNCATE ON inventory_scan_labels FROM app;
