DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM buyer_inquiries) THEN
  RAISE EXCEPTION 'cannot roll back retained buyer inquiries';
 END IF;
END;
$$;
DROP TABLE buyer_inquiries;
DROP FUNCTION validate_buyer_inquiry_insert();
DROP FUNCTION protect_buyer_inquiry();
