package technician

import (
	"sort"
	"strings"
	"time"
)

type TimezoneCatalog interface{ Contains(string) bool }

// WeeklyRule stores local wall-clock intent, never a UTC appointment instant.
type WeeklyRule struct {
	Key, Kind, Recurrence        string
	Weekday                      int
	Start, End, Timezone         string
	EffectiveStart, EffectiveEnd string
}

// NormalizeAvailability validates and copies rules in canonical weekday order.
func NormalizeAvailability(input []WeeklyRule, zones TimezoneCatalog) ([]WeeklyRule, error) {
	if zones == nil || len(input) > 7 {
		return nil, ErrInvalidFields
	}
	result := append([]WeeklyRule(nil), input...)
	keys := map[string]bool{}
	days := map[int]bool{}
	for _, r := range result {
		if !ruleKey(r.Key) || keys[r.Key] || days[r.Weekday] || r.Weekday < 0 || r.Weekday > 6 ||
			(r.Kind != "available" && r.Kind != "unavailable") || r.Recurrence != "weekly" ||
			!localTime(r.Start) || !localTime(r.End) || r.Start >= r.End ||
			!timezoneName(r.Timezone) || !zones.Contains(r.Timezone) ||
			!effectiveDate(r.EffectiveStart) || !effectiveDate(r.EffectiveEnd) ||
			(r.EffectiveStart != "" && r.EffectiveEnd != "" && r.EffectiveStart > r.EffectiveEnd) {
			return nil, ErrInvalidFields
		}
		keys[r.Key] = true
		days[r.Weekday] = true
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Weekday < result[j].Weekday })
	return result, nil
}
func ruleKey(s string) bool {
	if len(s) < 1 || len(s) > 50 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}
func localTime(s string) bool {
	if len(s) != 5 || s[2] != ':' {
		return false
	}
	for _, i := range []int{0, 1, 3, 4} {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s[:2] < "24" && s[3:] < "60"
}
func effectiveDate(s string) bool {
	if s == "" {
		return true
	}
	if len(s) != 10 || s[:4] == "0000" {
		return false
	}
	date, err := time.Parse("2006-01-02", s)
	return err == nil && date.Format("2006-01-02") == s
}
func timezoneName(s string) bool {
	if len(s) < 1 || len(s) > 64 || s == "Local" || s == "localtime" {
		return false
	}
	for _, part := range strings.Split(s, "/") {
		if part == "" {
			return false
		}
		for _, c := range part {
			if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-' || c == '+') {
				return false
			}
		}
	}
	return true
}
