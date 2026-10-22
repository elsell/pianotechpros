DROP TABLE dealer_memberships;
DROP INDEX dealer_models_slug_unique;
ALTER TABLE dealer_models DROP COLUMN revision;
GRANT DELETE ON dealer_models TO app;
