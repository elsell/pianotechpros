package spicedb

import (
	"strings"
	"testing"
)

func TestRequiredSchemaComparisonRejectsDrift(t *testing.T) {
	if !schemaCurrent(RequiredSchema) {
		t.Fatal("required schema rejected itself")
	}
	if !schemaCurrent(strings.Join(strings.Fields(RequiredSchema), " ")) {
		t.Fatal("equivalent provider formatting rejected")
	}
	definitions := strings.Split(RequiredSchema, "definition ")[1:]
	var reordered string
	for i := len(definitions) - 1; i >= 0; i-- {
		reordered += "definition " + definitions[i] + "\n"
	}
	if !schemaCurrent(reordered) {
		t.Fatal("equivalent provider ordering rejected")
	}
	if schemaCurrent(strings.ReplaceAll(RequiredSchema, "permission manage_profile = owner", "permission manage_profile = owner + editor")) {
		t.Fatal("expanded profile permissions accepted")
	}
	if schemaCurrent("definition user {}") {
		t.Fatal("incomplete schema accepted")
	}
	if schemaCurrent(RequiredSchema + "\ndefinition attacker {}") {
		t.Fatal("unexpected schema expansion accepted")
	}
}
