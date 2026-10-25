package inventory

import "testing"

func TestHistoryWindowBounds(t *testing.T) {
	for _, query := range []HistoryQuery{{Limit: 1}, {Limit: 50, UpperRevision: 9007199254740991}, {Limit: 20, UpperRevision: 50, BeforeRevision: 1}} {
		if err := query.Validate(); err != nil {
			t.Fatal(query, err)
		}
	}
	for _, query := range []HistoryQuery{{}, {Limit: 51}, {Limit: -1}, {Limit: 1, UpperRevision: -1}, {Limit: 1, UpperRevision: 9007199254740992}, {Limit: 1, BeforeRevision: 1}, {Limit: 1, UpperRevision: 2, BeforeRevision: 3}, {Limit: 1, BeforeRevision: -1}} {
		if err := query.Validate(); err == nil {
			t.Fatal("unbounded or inconsistent query accepted", query)
		}
	}
}
