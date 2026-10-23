package dealerstore

import (
	"flag"
	"os"
	"os/exec"
	"strings"
	"testing"

	platformstore "github.com/elsell/pianotechpros/apps/api/internal/adapters/gormstore"
)

var sqlLogChild = flag.Bool("sql-log-child", false, "run isolated SQL error logging check")

func TestRuntimeDatabaseDoesNotEchoSensitiveQueryParameters(t *testing.T) {
	if *databaseDSN == "" {
		t.Skip("-database-dsn required")
	}
	const secret = "synthetic-sensitive-invitation-digest"
	if *sqlLogChild {
		store, err := platformstore.Open("postgres", *databaseDSN)
		if err != nil {
			t.Fatal("database open failed")
		}
		pool, _ := store.DB.DB()
		defer pool.Close()
		var result []struct{ ID string }
		err = store.DB.Table("dealer_staff_invitations").Select("deliberately_missing_column").Where("id=?", secret).Find(&result).Error
		if err == nil {
			t.Fatal("expected controlled query failure")
		}
		return
	}
	command := exec.Command(os.Args[0], "-test.run=^TestRuntimeDatabaseDoesNotEchoSensitiveQueryParameters$", "-database-dsn", *databaseDSN, "-sql-log-child")
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatal("isolated SQL logging check failed")
	}
	if strings.Contains(string(output), secret) {
		t.Fatal("database failure echoed a sensitive query parameter")
	}
}
