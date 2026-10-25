package dealerstore

import (
	"context"
	"encoding/json"
	"time"

	app "github.com/elsell/pianotechpros/apps/api/internal/app/inquiry"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
)

var _ app.Repository = (*Repository)(nil)

type inquiryModel struct {
	ID                                           string `gorm:"primaryKey"`
	DealerID, RecordID                           string
	PublicationRevision                          int64
	DealerName, DealerSlug                       string
	Snapshot                                     json.RawMessage `gorm:"type:jsonb"`
	BuyerName, Email, Phone, Preference, Message string
	CreatedAt                                    time.Time
}

func (inquiryModel) TableName() string { return "buyer_inquiries" }
func (r *Repository) CreatePublicInquiry(ctx context.Context, in app.Submission) error {
	if !publicLookup(in.Slug, 80) || !publicLookup(in.PianoID, 128) || !publicLookup(in.ID, 128) {
		return ports.ErrInvalidArgument
	}
	canonical, err := domain.ValidateContact(in.Contact)
	if err != nil || canonical != in.Contact {
		return ports.ErrInvalidArgument
	}
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		showroom, err := lockPublicShowroom(tx, in.Slug)
		if err != nil {
			return err
		}
		publication, err := readPublicPublication(tx, showroom, in.PianoID)
		if err != nil {
			return err
		}
		inquiry, err := domain.New(in.ID, showroom, publication, in.Contact, in.At)
		if err != nil {
			return err
		}
		state := inquiry.State()
		snapshot, err := json.Marshal(state.Piano)
		if err != nil {
			return err
		}
		return tx.Create(&inquiryModel{ID: state.ID, DealerID: state.Piano.DealerID, RecordID: state.Piano.ID, PublicationRevision: state.Piano.PublicationRevision, DealerName: state.DealerName, DealerSlug: state.DealerSlug, Snapshot: snapshot, BuyerName: state.Contact.Name, Email: state.Contact.Email, Phone: state.Contact.Phone, Preference: string(state.Contact.Preference), Message: state.Contact.Message, CreatedAt: state.CreatedAt}).Error
	})
	return publicReadError(err)
}
