package ws

import "testing"

func TestParseDeviceName_NativeApp(t *testing.T) {
	cases := map[string]string{
		"WuzzChat-Mobile/1.32.0 (Android; Mobile; React-Native)":                      "Aplikasi WuzzChat di Android",
		"WuzzChat-Mobile/1.32.0 (iOS; Mobile; React-Native)":                          "Aplikasi WuzzChat di iOS",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari": "Chrome on Android",
		"": "Web Client",
	}
	for ua, want := range cases {
		if got := parseDeviceName(ua); got != want {
			t.Errorf("parseDeviceName(%q) = %q, want %q", ua, got, want)
		}
	}
}
