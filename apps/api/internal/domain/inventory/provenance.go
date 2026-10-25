package inventory

import "time"

// ReviseAttributed labels only actual attribute changes. Input-method metadata
// is not evidence that the value is correct or permission to change the record.
func (r Record) ReviseAttributed(input Attributes, expected int64, actor string, voiceFields []string, at time.Time) (Record, History, error) {
	next, event, err := r.Revise(input, expected, actor, Manual, at)
	if err != nil {
		return Record{}, History{}, err
	}
	if len(voiceFields) > 18 {
		return Record{}, History{}, ErrInvalidFields
	}
	for _, field := range voiceFields {
		source, changed := event.FieldSources[field]
		if !changed || source == Voice {
			return Record{}, History{}, ErrInvalidFields
		}
		event.FieldSources[field] = Voice
	}
	if len(voiceFields) == len(event.Fields) {
		event.Source = Voice
	} else if len(voiceFields) > 0 {
		event.Source = Mixed
	}
	return next, event, nil
}
