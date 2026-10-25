package mapper

import (
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver/inventory/dto"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/voice"
)

func VoiceProposal(result voice.ExtractionResult) dto.VoiceProposal {
	out := dto.VoiceProposal{Revision: result.Revision, Transcript: result.Proposal.Transcript(), Candidates: []dto.VoiceCandidate{}}
	for _, c := range result.Proposal.Candidates() {
		v := dto.VoiceValue{Text: c.Value.Text, Boolean: c.Value.Boolean}
		if c.Value.Money != nil {
			v.Money = &dto.Money{MinorUnits: c.Value.Money.MinorUnits, Currency: c.Value.Money.Currency}
		}
		if c.Value.Date != nil {
			v.Date = &dto.ManufacturingDate{Year: c.Value.Date.Year, Month: c.Value.Date.Month, Day: c.Value.Date.Day}
		}
		out.Candidates = append(out.Candidates, dto.VoiceCandidate{Field: c.Field, Value: v, Confidence: string(c.Confidence), Evidence: c.Evidence})
	}
	return out
}
