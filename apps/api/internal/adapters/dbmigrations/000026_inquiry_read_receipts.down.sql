DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM buyer_inquiry_reads) THEN
  RAISE EXCEPTION 'cannot roll back retained inquiry acknowledgments';
 END IF;
END;
$$;
DROP TABLE buyer_inquiry_reads;
DROP FUNCTION validate_inquiry_read();
