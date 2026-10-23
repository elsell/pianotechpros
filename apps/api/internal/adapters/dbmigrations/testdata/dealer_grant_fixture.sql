INSERT INTO user_models(id,created_at,updated_at) VALUES('grant-migration-owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT INTO dealer_models(id,owner_user_id,name,slug,email,phone,website_url,tagline,description,street_address_1,street_address_2,city,region,postal_code,appointment_note,delivery_note,warranty_note,service_note,banner_alt_text,accent_color,showroom_published,created_at,updated_at)
 SELECT 'grant-migration-'||kind,'grant-migration-owner',kind,'grant-migration-'||kind,'shop@example.com','','','','','','','','','','','','','','','#123456',false,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
 FROM unnest(ARRAY['confirmed','pending','deleted','unknown','mismatch']) kind;
INSERT INTO dealer_memberships(dealer_id,user_id,role,active,revision,created_at,updated_at)
 SELECT id,owner_user_id,'owner',true,1,created_at,updated_at FROM dealer_models WHERE owner_user_id='grant-migration-owner';
INSERT INTO authorization_outbox_models(id,resource_type,resource_id,relation,subject_type,subject_id,operation,owner_user_id,actor_user_id,created_at,completed_at)
 SELECT 'grant-migration-event-'||kind,'dealer','grant-migration-'||kind,
 CASE WHEN kind='mismatch' THEN 'editor' ELSE 'owner' END,'user','grant-migration-owner',
 CASE WHEN kind='deleted' THEN 'delete' ELSE 'touch' END,'grant-migration-owner','grant-migration-owner',CURRENT_TIMESTAMP,
 CASE WHEN kind='pending' THEN NULL ELSE CURRENT_TIMESTAMP END
 FROM unnest(ARRAY['confirmed','pending','deleted','mismatch']) kind;
