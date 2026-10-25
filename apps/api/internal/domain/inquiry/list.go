package inquiry

import "time"

type ListQuery struct {
	Limit                  int
	Snapshot, AfterCreated time.Time
	AfterID                string
}
type Page struct {
	Inquiries []Inquiry
	HasMore   bool
}

func ValidateListQuery(q ListQuery) (ListQuery, error) {
	if q.Limit < 1 || q.Limit > 100 || q.Snapshot.IsZero() || q.Snapshot.Year() < 1 || q.Snapshot.Year() > 9999 {
		return ListQuery{}, ErrInvalid
	}
	if (q.AfterID == "") != q.AfterCreated.IsZero() {
		return ListQuery{}, ErrInvalid
	}
	if q.AfterID != "" && (!identifier(q.AfterID) || q.AfterCreated.Year() < 1 || q.AfterCreated.Year() > 9999 || q.AfterCreated.After(q.Snapshot)) {
		return ListQuery{}, ErrInvalid
	}
	q.Snapshot = q.Snapshot.UTC()
	q.AfterCreated = q.AfterCreated.UTC()
	return q, nil
}
