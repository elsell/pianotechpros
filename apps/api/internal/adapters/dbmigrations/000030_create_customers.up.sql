CREATE TABLE customer_models (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL REFERENCES user_models(id),
    "name" text NOT NULL,
    "is_business" boolean NOT NULL,
    "business_name" text NOT NULL,
    "email" text NOT NULL,
    "phone" text NOT NULL,

    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX customer_models_owner_page_idx ON customer_models(owner_user_id, created_at, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_models TO app;
