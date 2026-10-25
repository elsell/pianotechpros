package main

import (
	"encoding/json"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/dealerbanner"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inquiry"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inventoryphotos"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inventoryscan"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inventoryvoice"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/config"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"os"
)

func main() {
	inquiries, err := inquiry.Registration(nil, config.Config{}, nil, nil, nil)
	if err != nil {
		panic(err)
	}
	voiceRegistration, err := inventoryvoice.Registration(generated.Dependencies{}, config.Config{})
	if err != nil {
		panic(err)
	}
	_, api := httpserver.New(app.App{}, generated.Domains, httpserver.Options{OIDCIssuer: "https://id.example.invalid", OIDCAuthorizationURL: "https://id.example.invalid/authorize", OIDCTokenURL: "https://id.example.invalid/token", OIDCDocsClientID: "pianotechpros-docs", OIDCDocsRedirectURI: "https://api.example.invalid/docs", PublicBaseURL: "https://api.example.invalid", DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), inventoryphotos.Registration(generated.Dependencies{}, nil), dealerbanner.Registration(generated.Dependencies{}, nil), showroom.Registration(nil, nil, nil), inquiries, inquiry.InboxRegistration(generated.Dependencies{}), voiceRegistration, inventoryscan.Registration(generated.Dependencies{}, nil))})
	if err := json.NewEncoder(os.Stdout).Encode(api.OpenAPI()); err != nil {
		panic(err)
	}
}
