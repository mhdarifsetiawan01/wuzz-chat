package authz

import "testing"

func TestParseDeviceName_NativeApp(t *testing.T) {
	cases := map[string]string{
		"WuzzChat-Mobile/1.32.0 (Android; Mobile; React-Native)": "Aplikasi WuzzChat di Android",
		"WuzzChat-Mobile/1.32.0 (iOS; Mobile; React-Native)":     "Aplikasi WuzzChat di iOS",
		"okhttp/4.12.0": "Aplikasi WuzzChat di Android",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari": "Chrome on Android",
		"Mozilla/5.0 (Windows NT 10.0; Win64) Gecko/20100101 Firefox/120.0":           "Firefox on Windows",
	}
	for ua, want := range cases {
		if got := parseDeviceName(ua, "android"); got != want {
			t.Errorf("parseDeviceName(%q) = %q, want %q", ua, got, want)
		}
	}
	if got := parseDeviceName("", "android"); got != "Android Device" {
		t.Errorf("UA kosong: got %q", got)
	}
}
