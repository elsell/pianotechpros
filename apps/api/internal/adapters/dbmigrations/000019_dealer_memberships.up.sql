ALTER TABLE dealer_models ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
CREATE UNIQUE INDEX dealer_models_slug_unique ON dealer_models(slug);
CREATE TABLE dealer_memberships (
 dealer_id text NOT NULL REFERENCES dealer_models(id),
 user_id text NOT NULL REFERENCES user_models(id),
 role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
 active boolean NOT NULL,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(dealer_id,user_id)
);
CREATE INDEX dealer_memberships_actor_idx ON dealer_memberships(user_id,dealer_id) WHERE active;
INSERT INTO dealer_memberships(dealer_id,user_id,role,active,created_at,updated_at)
 SELECT id,owner_user_id,'owner',true,created_at,updated_at FROM dealer_models;
GRANT SELECT, INSERT, UPDATE ON dealer_memberships TO app;
REVOKE DELETE ON dealer_models FROM app;
