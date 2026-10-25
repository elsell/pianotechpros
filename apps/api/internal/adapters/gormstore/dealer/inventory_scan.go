package dealerstore

import (
	"context"
	"errors"
	application "github.com/elsell/pianotechpros/apps/api/internal/app/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/audit"
	dealer "github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	domain "github.com/elsell/pianotechpros/apps/api/internal/domain/inventory"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"gorm.io/gorm"
	"time"
)

var _ application.ScanRepository = (*Repository)(nil)

type inventoryScanLabelModel struct {
	RecordID, DealerID, Token, CreatedBy string
	CreatedAt                            time.Time
	AuditID                              string
}

func (inventoryScanLabelModel) TableName() string { return "inventory_scan_labels" }
func scanFromRow(row inventoryScanLabelModel) (domain.ScanLabel, error) {
	token, err := domain.ParseScanToken(row.Token)
	if err != nil {
		return domain.ScanLabel{}, ports.ErrInvalidArgument
	}
	label, err := domain.NewScanLabel(row.DealerID, row.RecordID, row.CreatedBy, token, row.CreatedAt)
	if err != nil {
		return domain.ScanLabel{}, ports.ErrInvalidArgument
	}
	return label, nil
}
func scanEventValid(event audit.Event, actor, id string, action audit.Action) bool {
	return actor != "" && id != "" && event.Valid() && event.ActorUserID == actor && event.TargetType == "inventory_scan" && event.TargetID == id && event.Action == action && event.Outcome == audit.Succeeded
}
func scanError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, gorm.ErrRecordNotFound), errors.Is(err, ports.ErrNotFound):
		return ports.ErrNotFound
	case errors.Is(err, ports.ErrInvalidArgument):
		return ports.ErrInvalidArgument
	default:
		return application.ErrScanUnavailable
	}
}
func (r *Repository) EnsureScanLabel(ctx context.Context, actor string, candidate domain.ScanLabel, event audit.Event) (domain.ScanLabel, bool, error) {
	checked, err := domain.NewScanLabel(candidate.DealerID, candidate.RecordID, candidate.CreatedBy, candidate.Token, candidate.CreatedAt)
	if err != nil || checked != candidate || candidate.CreatedBy != actor || !scanEventValid(event, actor, candidate.RecordID, audit.ResourceCreated) || !event.OccurredAt.Equal(candidate.CreatedAt) {
		return domain.ScanLabel{}, false, ports.ErrInvalidArgument
	}
	var result domain.ScanLabel
	reused := false
	err = r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, candidate.DealerID, dealer.View)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		record, err := inventoryRead(tx, candidate.DealerID, candidate.RecordID)
		if err != nil {
			return err
		}
		if candidate.CreatedAt.Before(record.CreatedAt) {
			return ports.ErrInvalidArgument
		}
		var row inventoryScanLabelModel
		err = tx.Where("dealer_id=? AND record_id=?", candidate.DealerID, candidate.RecordID).Take(&row).Error
		if err == nil {
			result, err = scanFromRow(row)
			if err != nil {
				return err
			}
			reused = true
			event.Action = audit.ResourceViewed
			return tx.Create(fromAudit(event)).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err := tx.Create(fromAudit(event)).Error; err != nil {
			return err
		}
		row = inventoryScanLabelModel{RecordID: candidate.RecordID, DealerID: candidate.DealerID, Token: candidate.Token.Encoded(), CreatedBy: actor, CreatedAt: candidate.CreatedAt, AuditID: event.ID}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		result = candidate
		return nil
	})
	if err != nil {
		return domain.ScanLabel{}, false, scanError(err)
	}
	return result, reused, nil
}
func (r *Repository) ResolveScanLabel(ctx context.Context, actor, dealerID string, token domain.ScanToken, event audit.Event) (domain.ScanLabel, error) {
	if !token.Valid() || !scanEventValid(event, actor, dealerID, audit.ResourceViewed) {
		return domain.ScanLabel{}, ports.ErrInvalidArgument
	}
	var result domain.ScanLabel
	err := r.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		owner, err := lockInventoryAuthority(tx, actor, dealerID, dealer.View)
		if err != nil {
			return err
		}
		if event.OwnerUserID != owner {
			return ports.ErrInvalidArgument
		}
		var row inventoryScanLabelModel
		if err := tx.Where("dealer_id=? AND token=?", dealerID, token.Encoded()).Take(&row).Error; err != nil {
			return err
		}
		result, err = scanFromRow(row)
		if err != nil {
			return err
		}
		if _, err := inventoryRead(tx, dealerID, result.RecordID); err != nil {
			return err
		}
		event.TargetID = result.RecordID
		return tx.Create(fromAudit(event)).Error
	})
	if err != nil {
		return domain.ScanLabel{}, scanError(err)
	}
	return result, nil
}
