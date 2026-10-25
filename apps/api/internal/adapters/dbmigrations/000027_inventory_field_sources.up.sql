ALTER TABLE inventory_history ADD COLUMN field_sources jsonb;
ALTER TABLE inventory_history DROP CONSTRAINT inventory_history_source_check;
ALTER TABLE inventory_history ADD CONSTRAINT inventory_history_source_check CHECK (source IN ('manual','voice','mixed'));
CREATE FUNCTION protect_inventory_field_sources() RETURNS trigger AS $$
DECLARE
 previous_record jsonb;
 current_attributes jsonb;
 field_name text;
 attribute_name text;
 source_value text;
 actual_count integer := 0;
 voice_count integer := 0;
BEGIN
 IF NEW.kind <> 'attributes' THEN
  IF NEW.field_sources IS NOT NULL OR NEW.source='mixed' THEN RAISE EXCEPTION 'field sources require attribute history'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.field_sources IS NULL OR jsonb_typeof(NEW.field_sources)<>'object' THEN RAISE EXCEPTION 'attribute history requires field sources'; END IF;
 SELECT r.attributes INTO current_attributes FROM inventory_records r
 WHERE r.id=NEW.record_id AND r.dealer_id=NEW.dealer_id AND r.revision=NEW.revision
  AND NEW.snapshot->>'ID'=r.id AND NEW.snapshot->>'DealerID'=r.dealer_id
  AND NEW.snapshot->>'Revision'=r.revision::text AND NEW.snapshot->>'Status'=r.status;
 IF current_attributes IS NULL OR (NEW.snapshot - ARRAY['ID','DealerID','Revision','Status','CreatedAt','UpdatedAt']) IS DISTINCT FROM current_attributes THEN
  RAISE EXCEPTION 'attribute history must match inventory revision';
 END IF;
 SELECT COALESCE(h.snapshot->'Record',h.snapshot) INTO previous_record FROM inventory_history h
 WHERE h.record_id=NEW.record_id AND h.dealer_id=NEW.dealer_id AND h.revision=NEW.revision-1;
 IF previous_record IS NULL THEN RAISE EXCEPTION 'attribute history requires preceding snapshot'; END IF;
 FOR field_name,attribute_name IN SELECT * FROM (VALUES
 ('stock_number','StockNumber'),('title','Title'),('featured','Featured'),('form','Form'),
 ('player_system','PlayerSystem'),('condition','Condition'),('make','Make'),('model','Model'),
 ('serial','Serial'),('manufactured','Manufactured'),('size','Size'),('finish','Finish'),
 ('asking_price','AskingPrice'),('price_visible','PriceVisible'),('location','Location'),
 ('description','Description'),('acquisition_cost','AcquisitionCost'),('private_notes','PrivateNotes')) AS fields(name,attribute)
 LOOP
  IF previous_record->attribute_name IS DISTINCT FROM current_attributes->attribute_name THEN
   actual_count:=actual_count+1;
   source_value:=NEW.field_sources->>field_name;
   IF source_value IS NULL OR source_value NOT IN ('manual','voice') OR jsonb_typeof(NEW.field_sources->field_name)<>'string' THEN
    RAISE EXCEPTION 'invalid field source';
   END IF;
   IF source_value='voice' THEN voice_count:=voice_count+1; END IF;
  ELSIF NEW.field_sources ? field_name THEN RAISE EXCEPTION 'unchanged field source';
  END IF;
 END LOOP;
 IF actual_count=0 OR (SELECT count(*) FROM jsonb_object_keys(NEW.field_sources))<>actual_count THEN RAISE EXCEPTION 'field sources must match changed attributes'; END IF;
 IF NEW.source<>(CASE WHEN voice_count=0 THEN 'manual' WHEN voice_count=actual_count THEN 'voice' ELSE 'mixed' END) THEN
  RAISE EXCEPTION 'aggregate source does not match fields';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_history_provenance_guard BEFORE INSERT ON inventory_history
 FOR EACH ROW EXECUTE FUNCTION protect_inventory_field_sources();
