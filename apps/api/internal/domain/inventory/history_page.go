package inventory

// HistoryQuery is a private revision window. Zero upper bound starts a sequence.
type HistoryQuery struct {
	Limit                         int
	UpperRevision, BeforeRevision int64
}
type HistoryPage struct {
	Entries       []History
	UpperRevision int64
	HasMore       bool
}

func (q HistoryQuery) Validate() error {
	if q.Limit < 1 || q.Limit > 50 || q.UpperRevision < 0 || q.UpperRevision > 9007199254740991 || q.BeforeRevision < 0 || q.BeforeRevision > q.UpperRevision {
		return ErrInvalidFields
	}
	return nil
}
