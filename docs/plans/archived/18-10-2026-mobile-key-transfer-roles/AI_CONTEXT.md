# Active Context & Boundaries

- **Target Workspace**: Mobile Application (`mobile/`)
- **Active Feature**: Universal Contact Sharing & Deep Linking Engine (M-Mobile-14)
- **Active Branch**: `dev`
- **Future Scope (Deferred)**: Web Frontend Landing Page (`frontend/app/u/[username]/page.tsx`) — dicatat dalam dokumentasi masa depan.
- **Constraints**:
  - Zero disruption to existing `?room=` deep link flow in `mobile/App.tsx`.
  - Android Manifest & Expo config must support both custom scheme (`wuzzchat://`) and HTTPS Universal Link (`https://chat.wuzzhub.id/u/*`).
  - Strict privacy compliance: Public accounts allow direct chat creation; Private accounts without accepted connection route to profile view with friend request prompt (`PrivateAccountNoticeModal`).
  - No commit before user explicit confirmation ("selesai").
