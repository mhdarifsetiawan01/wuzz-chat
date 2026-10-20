package store

// SetForumLimitAfterCountHook memasang hook tes pada enforceForumLimit (nil = lepas).
func SetForumLimitAfterCountHook(f func()) { forumLimitAfterCountHook = f }
