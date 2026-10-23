package httpserver

import "github.com/danielgtaylor/huma/v2"

// Framework validation can echo the entire malformed request body. Operations
// carrying secrets opt out of these details while retaining their stable code.
func redactSensitiveInputErrors(ctx huma.Context, _ string, value any) (any, error) {
	if ctx.Operation().Metadata["sensitive-input"] != true {
		return value, nil
	}
	if original, ok := value.(*APIError); ok && len(original.Errors) > 0 {
		redacted := *original
		redacted.Errors = nil
		redacted.Detail = "invalid request"
		return &redacted, nil
	}
	return value, nil
}
