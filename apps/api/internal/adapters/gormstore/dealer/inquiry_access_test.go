package dealerstore

import (
	"context"
	"errors"
	"github.com/elsell/pianotechpros/apps/api/internal/domain/dealer"
	"github.com/elsell/pianotechpros/apps/api/internal/ports"
	"testing"
)

func TestInquiryAccessIsActorAndDealerScoped(t *testing.T) {
	repository, _, profile, _, event := publicFixture(t)
	access, err := repository.InquiryAccess(context.Background(), event.ActorUserID, string(profile.ID))
	if err != nil || access.OwnerUserID != event.ActorUserID || !access.UserActive || !access.Membership.Allows(dealer.ManageInquiries) {
		t.Fatal("owner preflight", err)
	}
	for _, scope := range [][2]string{{"other-user", string(profile.ID)}, {event.ActorUserID, "other-dealer"}} {
		if _, err := repository.InquiryAccess(context.Background(), scope[0], scope[1]); !errors.Is(err, ports.ErrNotFound) {
			t.Fatal("cross-scope preflight", err)
		}
	}
}
