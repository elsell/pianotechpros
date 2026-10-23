CREATE TABLE dealer_staff_invitations (
 id text PRIMARY KEY,
 dealer_id text NOT NULL REFERENCES dealer_models(id),
 owner_user_id text NOT NULL REFERENCES user_models(id),
 role text NOT NULL CHECK (role IN ('editor','viewer')),
 token_digest bytea NOT NULL UNIQUE CHECK (
  octet_length(token_digest)=32 AND token_digest <> decode(repeat('00',32),'hex')),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_by text REFERENCES user_models(id),
 consumed_at timestamptz,
 revoked_at timestamptz,
 CHECK (expires_at >= created_at + INTERVAL '1 hour' AND expires_at <= created_at + INTERVAL '168 hours'),
 CHECK ((consumed_by IS NULL AND consumed_at IS NULL) OR
        (consumed_by IS NOT NULL AND consumed_at IS NOT NULL AND consumed_by <> owner_user_id
         AND consumed_at >= created_at AND consumed_at < expires_at AND revoked_at IS NULL)),
 CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX dealer_staff_invitations_owner_idx ON dealer_staff_invitations(dealer_id,owner_user_id,created_at,id);
GRANT SELECT, INSERT, UPDATE ON dealer_staff_invitations TO app;
-- Baseline default privileges include DELETE: explicitly remove that inherited
-- capability for retained membership and invitation history.
REVOKE DELETE, TRUNCATE ON dealer_staff_invitations, dealer_memberships FROM app;
