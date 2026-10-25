CREATE TABLE buyer_inquiry_reads (
 inquiry_id text PRIMARY KEY,
 dealer_id text NOT NULL,
 actor_user_id text NOT NULL REFERENCES user_models(id),
 read_at timestamptz NOT NULL,
 audit_id text NOT NULL UNIQUE,
 FOREIGN KEY(inquiry_id,dealer_id) REFERENCES buyer_inquiries(id,dealer_id)
);
CREATE FUNCTION validate_inquiry_read() RETURNS trigger AS $$
BEGIN
 PERFORM 1 FROM authorization_resource_lock_models
  WHERE resource_type='dealer' AND resource_id=NEW.dealer_id FOR UPDATE;
 PERFORM 1 FROM dealer_models WHERE id=NEW.dealer_id FOR UPDATE;
 PERFORM 1 FROM dealer_memberships WHERE dealer_id=NEW.dealer_id AND user_id=NEW.actor_user_id FOR UPDATE;
 PERFORM 1 FROM user_models WHERE id=NEW.actor_user_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'inquiry acknowledgment requires active authority'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM dealer_models d JOIN dealer_memberships m ON m.dealer_id=d.id
   JOIN buyer_inquiries i ON i.dealer_id=d.id
   JOIN audit_event_models a ON a.id=NEW.audit_id
  WHERE d.id=NEW.dealer_id AND i.id=NEW.inquiry_id AND NEW.read_at>=i.created_at
   AND m.user_id=NEW.actor_user_id AND m.active AND m.granted_revision=m.revision
   AND m.role IN ('owner','editor') AND (m.role='owner')=(d.owner_user_id=m.user_id)
   AND a.actor_user_id=m.user_id AND a.owner_user_id=d.owner_user_id
   AND a.target_type='inquiry' AND a.target_id=i.id AND a.action='resource.updated'
   AND a.outcome='succeeded' AND a.occurred_at=NEW.read_at
   AND a.xmin=pg_current_xact_id()::xid
 ) THEN RAISE EXCEPTION 'inquiry acknowledgment requires matching authority and audit'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inquiry_read_insert_guard BEFORE INSERT ON buyer_inquiry_reads
 FOR EACH ROW EXECUTE FUNCTION validate_inquiry_read();
CREATE TRIGGER inquiry_read_immutable BEFORE UPDATE OR DELETE ON buyer_inquiry_reads
 FOR EACH ROW EXECUTE FUNCTION protect_buyer_inquiry();
CREATE TRIGGER inquiry_read_no_truncate BEFORE TRUNCATE ON buyer_inquiry_reads
 FOR EACH STATEMENT EXECUTE FUNCTION protect_buyer_inquiry();
GRANT SELECT,INSERT ON buyer_inquiry_reads TO app;
REVOKE UPDATE,DELETE,TRUNCATE ON buyer_inquiry_reads FROM app;
