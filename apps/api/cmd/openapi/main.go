package main

import (
	"encoding/json"
	"github.com/elsell/pianotechpros/apps/api/internal/adapters/httpserver"
	"github.com/elsell/pianotechpros/apps/api/internal/app"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/inventoryphotos"
	"github.com/elsell/pianotechpros/apps/api/internal/bootstrap/showroom"
	"github.com/elsell/pianotechpros/apps/api/internal/generated"
	"os"
)

func main() {
	_, api := httpserver.New(app.App{}, generated.Domains, httpserver.Options{OIDCIssuer: "https://id.example.invalid", OIDCAuthorizationURL: "https://id.example.invalid/authorize", OIDCTokenURL: "https://id.example.invalid/token", OIDCDocsClientID: "pianotechpros-docs", OIDCDocsRedirectURI: "https://api.example.invalid/docs", PublicBaseURL: "https://api.example.invalid", DomainRegistrations: append(generated.Registrations(generated.Dependencies{}), inventoryphotos.Registration(generated.Dependencies{}, nil), showroom.Registration(nil, nil, nil))})
	if err := json.NewEncoder(os.Stdout).Encode(api.OpenAPI()); err != nil {
		panic(err)
	}
}
