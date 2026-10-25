package timezones

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"errors"
	"slices"
	"strings"
)

//go:embed zones.txt
var embedded []byte

const catalogSHA256 = "8725722643bf1f4ff4fc4b22268ade98b6fae047a86897219c3a13d4c4ced93d"

var errCatalog = errors.New("timezone catalog integrity failure")

type Catalog struct {
	names   []string
	members map[string]struct{}
}

func New() (*Catalog, error) { return parse(embedded) }
func parse(raw []byte) (*Catalog, error) {
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) != catalogSHA256 {
		return nil, errCatalog
	}
	names := strings.Split(strings.TrimSuffix(string(raw), "\n"), "\n")
	if len(names) < 1 || len(names) > 1000 || !slices.IsSorted(names) {
		return nil, errCatalog
	}
	members := make(map[string]struct{}, len(names))
	for _, name := range names {
		if name == "Local" || name == "localtime" || len(name) > 64 {
			return nil, errCatalog
		}
		for _, part := range strings.Split(name, "/") {
			if part == "" {
				return nil, errCatalog
			}
			for _, c := range part {
				if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '+') {
					return nil, errCatalog
				}
			}
		}
		if _, exists := members[name]; exists {
			return nil, errCatalog
		}
		members[name] = struct{}{}
	}
	if _, exists := members["UTC"]; !exists {
		return nil, errCatalog
	}
	return &Catalog{names: names, members: members}, nil
}
func (c *Catalog) Contains(name string) bool {
	if c == nil {
		return false
	}
	_, exists := c.members[name]
	return exists
}
func (c *Catalog) Names() []string {
	if c == nil {
		return nil
	}
	return append([]string(nil), c.names...)
}
