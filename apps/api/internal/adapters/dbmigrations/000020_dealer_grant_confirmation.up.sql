ALTER TABLE dealer_memberships
 ADD COLUMN granted_revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN pending_authorization_change_id text REFERENCES authorization_outbox_models(id),
 ADD COLUMN pending_authorization_revision bigint,
 ADD CONSTRAINT dealer_membership_pending_revision CHECK (
  (pending_authorization_change_id IS NULL AND pending_authorization_revision IS NULL) OR
  (pending_authorization_change_id IS NOT NULL AND pending_authorization_revision IS NOT NULL AND pending_authorization_revision > 0 AND pending_authorization_revision <= revision)),
 ADD CONSTRAINT dealer_membership_grant_revision CHECK (granted_revision >= 0 AND granted_revision <= revision);
CREATE UNIQUE INDEX dealer_membership_pending_grant_unique
 ON dealer_memberships(pending_authorization_change_id)
 WHERE pending_authorization_change_id IS NOT NULL;
WITH latest AS (
 SELECT DISTINCT ON (m.dealer_id,m.user_id) m.dealer_id,m.user_id,m.role,
        o.id,o.operation,o.relation,o.completed_at
 FROM dealer_memberships m
 JOIN authorization_outbox_models o ON o.resource_type='dealer'
  AND o.resource_id=m.dealer_id AND o.subject_type='user' AND o.subject_id=m.user_id
 ORDER BY m.dealer_id,m.user_id,o.created_at DESC,o.id DESC
)
UPDATE dealer_memberships m
SET granted_revision=CASE WHEN l.operation='touch' AND l.relation=m.role AND l.completed_at IS NOT NULL THEN m.revision ELSE 0 END,
    pending_authorization_change_id=CASE WHEN l.operation='touch' AND l.relation=m.role AND l.completed_at IS NULL THEN l.id ELSE NULL END,
    pending_authorization_revision=CASE WHEN l.operation='touch' AND l.relation=m.role AND l.completed_at IS NULL THEN m.revision ELSE NULL END
FROM latest l WHERE l.dealer_id=m.dealer_id AND l.user_id=m.user_id;
