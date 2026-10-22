DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM dealer_memberships WHERE dealer_id='grant-migration-confirmed' AND granted_revision=1 AND pending_authorization_change_id IS NULL AND pending_authorization_revision IS NULL) THEN
  RAISE EXCEPTION 'completed grant was not preserved';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM dealer_memberships WHERE dealer_id='grant-migration-pending' AND granted_revision=0 AND pending_authorization_change_id='grant-migration-event-pending' AND pending_authorization_revision=1) THEN
  RAISE EXCEPTION 'pending grant was not retained for recovery';
 END IF;
 IF (SELECT count(*) FROM dealer_memberships WHERE dealer_id IN ('grant-migration-deleted','grant-migration-unknown','grant-migration-mismatch') AND granted_revision=0 AND pending_authorization_change_id IS NULL AND pending_authorization_revision IS NULL) <> 3 THEN
  RAISE EXCEPTION 'unverified grant gained access';
 END IF;
END $$;
