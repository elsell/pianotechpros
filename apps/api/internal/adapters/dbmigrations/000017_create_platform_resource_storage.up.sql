CREATE TABLE resource_models (
    id text PRIMARY KEY,
    domain text NOT NULL DEFAULT 'example',
    owner_user_id text NOT NULL REFERENCES user_models(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX resource_models_domain_idx ON resource_models(domain);
CREATE INDEX resource_models_owner_user_id_idx ON resource_models(owner_user_id);
CREATE INDEX resource_models_owner_domain_created_id_idx ON resource_models(owner_user_id, domain, created_at, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON resource_models TO app;
