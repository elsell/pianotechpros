-- Only current banner bytes are retained. Replacement/removal is transactional
-- with the dealer revision and audit; inventory publication media is unaffected.
CREATE TABLE dealer_banner_assets (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128 AND btrim(id)=id),
 dealer_id text NOT NULL UNIQUE REFERENCES dealer_models(id),
 jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 1 AND 20971520),
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 width integer NOT NULL CHECK (width BETWEEN 1 AND 10000),
 height integer NOT NULL CHECK (height BETWEEN 1 AND 10000),
 created_at timestamptz NOT NULL,
 CHECK (width::bigint*height::bigint <= 25000000)
);
GRANT SELECT,INSERT,DELETE ON dealer_banner_assets TO app;
REVOKE UPDATE,TRUNCATE ON dealer_banner_assets FROM app;
