CREATE TABLE dealer_models (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL REFERENCES user_models(id),
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "email" text NOT NULL,
    "phone" text NOT NULL,
    "website_url" text NOT NULL,
    "tagline" text NOT NULL,
    "description" text NOT NULL,
    "street_address_1" text NOT NULL,
    "street_address_2" text NOT NULL,
    "city" text NOT NULL,
    "region" text NOT NULL,
    "postal_code" text NOT NULL,
    "appointment_note" text NOT NULL,
    "delivery_note" text NOT NULL,
    "warranty_note" text NOT NULL,
    "service_note" text NOT NULL,
    "banner_alt_text" text NOT NULL,
    "accent_color" text NOT NULL,
    "showroom_published" boolean NOT NULL,

    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);
CREATE INDEX dealer_models_owner_page_idx ON dealer_models(owner_user_id, created_at, id);
GRANT SELECT, INSERT, UPDATE, DELETE ON dealer_models TO app;
