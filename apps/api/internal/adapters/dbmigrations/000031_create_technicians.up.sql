CREATE TABLE technician_models (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL REFERENCES user_models(id),
    "name" text NOT NULL,
    "business_name" text NOT NULL,
    "email" text NOT NULL,
    "phone" text NOT NULL,
    "biography" text NOT NULL,
    "searchable" boolean NOT NULL,
    "accepts_requests_without_availability" boolean NOT NULL,

    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX technician_models_owner_page_idx ON technician_models(owner_user_id, created_at, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON technician_models TO app;
