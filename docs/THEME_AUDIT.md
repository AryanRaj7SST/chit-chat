# Theme audit

## Before the redesign

Read all 25 client source files before editing. The original hard-coded color inventory was:

| File | Color utilities / variables |
| --- | --- |
| src/components/AuthLayout.jsx | `bg-indigo-600`, `bg-slate-50`, `bg-white`, `border-slate-200`, `border-slate-300`, `dark:bg-slate-900`, `dark:bg-slate-950`, `dark:border-slate-700`, `dark:border-slate-800`, `dark:focus:ring-indigo-950`, `dark:text-slate-100`, `dark:text-slate-300`, `dark:text-slate-400`, `focus:border-indigo-500`, `focus:ring-indigo-100`, `text-slate-500`, `text-slate-700`, `text-slate-900`, `text-white` |
| src/components/Avatar.jsx | `bg-emerald-500`, `bg-slate-300`, `border-white`, `dark:bg-slate-600`, `dark:border-slate-900`, `text-white` |
| src/components/ChatWindow.jsx | `bg-indigo-600`, `bg-slate-200`, `bg-slate-400`, `bg-slate-50`, `bg-white`, `border-slate-200`, `dark:bg-slate-700`, `dark:bg-slate-900`, `dark:bg-slate-950`, `dark:border-slate-700`, `dark:border-slate-800`, `dark:hover:bg-slate-800`, `dark:text-indigo-400`, `dark:text-rose-400`, `dark:text-slate-100`, `dark:text-slate-300`, `dark:text-slate-400`, `hover:bg-indigo-700`, `hover:bg-slate-100`, `text-emerald-600`, `text-indigo-600`, `text-rose-600`, `text-slate-400`, `text-slate-500`, `text-slate-600`, `text-slate-900`, `text-white` |
| src/components/MessageBubble.jsx | `bg-indigo-600`, `bg-white`, `border-slate-200`, `dark:bg-slate-900`, `dark:border-slate-800`, `dark:text-slate-200`, `text-indigo-200`, `text-rose-200`, `text-slate-400`, `text-slate-800`, `text-white` |
| src/components/MessageInput.jsx | `bg-indigo-600`, `bg-slate-50`, `bg-white`, `border-slate-200`, `border-slate-300`, `dark:bg-slate-900`, `dark:bg-slate-950`, `dark:border-slate-700`, `dark:border-slate-800`, `dark:disabled:bg-slate-700`, `dark:disabled:text-slate-500`, `dark:focus:bg-slate-900`, `dark:focus:ring-indigo-950`, `disabled:bg-slate-300`, `focus:bg-white`, `focus:border-indigo-500`, `focus:ring-indigo-100`, `hover:bg-indigo-700`, `text-white` |
| src/components/RouteGuards.jsx | `bg-slate-50`, `dark:bg-slate-950`, `dark:text-indigo-400`, `text-indigo-600` |
| src/components/Sidebar.jsx | `bg-indigo-100`, `bg-indigo-50`, `bg-indigo-600`, `bg-rose-600`, `bg-slate-50`, `bg-white`, `border-indigo-600`, `border-slate-100`, `border-slate-200`, `dark:bg-indigo-950`, `dark:bg-slate-900`, `dark:bg-slate-950`, `dark:border-slate-700`, `dark:border-slate-800`, `dark:focus:ring-indigo-950`, `dark:hover:bg-slate-800`, `dark:hover:text-slate-200`, `dark:text-indigo-300`, `dark:text-indigo-400`, `dark:text-rose-400`, `dark:text-slate-100`, `dark:text-slate-200`, `dark:text-slate-400`, `focus:border-indigo-500`, `focus:ring-indigo-100`, `hover:bg-indigo-50`, `hover:bg-slate-100`, `hover:bg-slate-50`, `hover:text-slate-600`, `text-indigo-600`, `text-indigo-700`, `text-rose-600`, `text-slate-400`, `text-slate-500`, `text-slate-800`, `text-slate-900`, `text-white` |
| src/components/Skeletons.jsx | `bg-indigo-100`, `bg-slate-100`, `bg-slate-200`, `dark:bg-indigo-950`, `dark:bg-slate-700`, `dark:bg-slate-800` |
| src/index.css | `var(--color-indigo-100)`, `var(--color-indigo-500)`, `var(--color-indigo-950)`, `var(--color-slate-100)`, `var(--color-slate-900)`, `var(--color-white)` |
| src/pages/ChatPage.jsx | `bg-amber-100`, `bg-indigo-100`, `bg-slate-50`, `bg-white`, `dark:bg-amber-950`, `dark:bg-indigo-950`, `dark:bg-slate-900`, `dark:bg-slate-950`, `dark:text-amber-200`, `dark:text-indigo-400`, `dark:text-slate-200`, `dark:text-slate-400`, `text-amber-800`, `text-indigo-600`, `text-slate-500`, `text-slate-800` |
| src/pages/Login.jsx | `bg-indigo-600`, `bg-rose-50`, `dark:bg-rose-950`, `dark:text-indigo-400`, `dark:text-rose-300`, `hover:bg-indigo-700`, `text-indigo-600`, `text-rose-700`, `text-white` |
| src/pages/Register.jsx | `bg-indigo-600`, `bg-rose-50`, `dark:bg-rose-950`, `dark:text-indigo-400`, `dark:text-rose-300`, `hover:bg-indigo-700`, `text-indigo-600`, `text-rose-700`, `text-white` |
| src/utils/format.js | `bg-amber-500`, `bg-emerald-500`, `bg-indigo-500`, `bg-pink-500`, `bg-rose-500`, `bg-sky-500`, `bg-teal-500`, `bg-violet-500` |

The original theme logic lived in Sidebar and main.jsx. AuthContext, SocketContext, hooks and API/socket services contain no presentation colors.

## Palette, accessibility decisions, and verification

The ten requested light/dark palette variables are preserved exactly in src/index.css. Tailwind's inline theme maps them to semantic utilities. Normal component colors use no dark overrides. Input and received-bubble tokens resolve to white in light mode and surface-2 in dark mode.

Contrast corrections (the original palette values remain available for accents):

- White on dark primary was 4.35:1; white on dark primary-hover was 3.57:1. Brand buttons, avatars and sent bubbles now use a darker derived violet gradient, with on-primary text. Both endpoints and hovered fills pass the appropriate text/icon thresholds.
- Dark primary on its surface was 4.13:1, insufficient for small links. The derived primary-ink token is lighter in dark mode and darker in light mode, including on active/header tints.
- Light online green on white was 3.30:1: sufficient for the status dot, but not small text. Online labels use a darker online-ink token; the dot retains the exact requested online color.
- Sent timestamps use a near-white semantic sent-muted token rather than a low-opacity white. Received timestamps use muted. Error text and the red requests badge use separate danger-ink/danger-fill tokens to preserve body-text contrast.
- Disabled buttons use muted on surface-2, never white on a pale disabled fill. Decorative borders and skeletons retain the supplied subtle palette; they are not body text.

ThemeProvider supports light, dark and system, defaults to the OS preference, and catches theme-storage errors. Its OS listener is installed only in system mode. The shared auth/sidebar button toggles explicit light/dark; removing chat_theme or saving system and reloading restores OS-following. A head script sets the class/color-scheme before React loads.

Verification actually run:

- Client build: "? built in 1.43s".
- Server API verification: "All checks passed", including "PASS - Buddy recognizes hii instead of the generic fallback".
- Browser messaging regression suite: "All browser checks passed".
- Theme/contrast/screenshot check: "All theme checks passed" and 64 measured color pairs passed. Eight client and three server unit tests also passed.
- Authentication context, socket context, API/socket services, server socket handlers and existing chat/page action logic were compared with HEAD and are unchanged. Only the requested Buddy greeting regex and its checks changed server behavior.
- No call, video, attachment, emoji, or nonfunctional chat-search controls were present. The working Unfriend menu remains for humans and stays hidden for Buddy.

Source scan: no actual slate/indigo/gray, bg-white or text-black color utilities remain. A broad literal slate- grep finds only two existing -translate-y-1/2 transform utilities in Sidebar; these are positioning, not colors. No presentation animations remain beyond 150ms hover/focus transitions; existing message-scroll behavior was preserved.

Run the theme check from client while both local servers are running:

    E2E_BASE_URL=http://localhost:5174 node scripts/theme-test.mjs

PowerShell: set $env:E2E_BASE_URL = 'http://localhost:5174', then run node scripts/theme-test.mjs. It registers disposable test accounts and leaves them in the configured development database.

See [all ten screenshots](screenshots/README.md) and [raw contrast results](screenshots/contrast-results.json). Screenshots contain only generated test identities. No reference screenshot was supplied, so visual work follows the written design rather than a verified pixel match.

Check by eye on real devices: keyboard focus and menus, native scrollbar/form appearance, mobile keyboard/composer sizing, full-bleed versus floating panels, theme transitions, and text readability. Chromium color measurements are not a complete WCAG conformance certification; Safari/Firefox, real devices and hosted deployment were not verified.

## Rendered contrast measurements

Calculated from Chromium's computed foreground/background colors using sRGB relative luminance. Transparent layers are composited; gradient surfaces are checked at both endpoint colors, including hovered buttons. Body text and placeholders require 4.5:1; large text, SVG icons, online dots and focus indicators require 3:1. Decorative borders/skeletons are not text. This section is regenerated by the theme check.

| Theme | Foreground | Background | Ratio | Required | State |
| --- | --- | --- | --- | --- | --- |
| dark | #7c5cff | #1f1f2b | 3.75:1 | 3:1 | login |
| dark | #ffffff | #ba5555 | 4.65:1 | 4.5:1 | notification-toast |
| dark | #f4f0ff | #6a55c2 | 5.08:1 | 4.5:1 | buddy |
| dark | #f4f0ff | #6a55c2 | 5.08:1 | 3:1 | buddy |
| dark | #f4f0ff | #684dd6 | 5.18:1 | 4.5:1 | buddy |
| dark | #f4f0ff | #684dd6 | 5.18:1 | 3:1 | buddy |
| dark | #aa95ff | #2e2754 | 5.52:1 | 4.5:1 | buddy |
| dark | #9a9ab0 | #252141 | 5.55:1 | 4.5:1 | buddy |
| dark | #f87171 | #2d2028 | 5.64:1 | 4.5:1 | login-error |
| dark | #ffffff | #6a55c2 | 5.69:1 | 3:1 | login |
| dark | #ffffff | #6a55c2 | 5.69:1 | 4.5:1 | login |
| dark | #ffffff | #684dd6 | 5.80:1 | 3:1 | login |
| dark | #ffffff | #684dd6 | 5.80:1 | 4.5:1 | login |
| dark | #9a9ab0 | #1f1f2b | 5.91:1 | 4.5:1 | login |
| dark | #9a9ab0 | #1f1f2b | 5.91:1 | 3:1 | buddy |
| dark | #9a9ab0 | #1a1a25 | 6.25:1 | 4.5:1 | history-error |
| dark | #aa95ff | #25203b | 6.25:1 | 4.5:1 | history-error |
| dark | #9a9ab0 | #1a1928 | 6.28:1 | 3:1 | buddy |
| dark | #9a9ab0 | #1a1928 | 6.28:1 | 4.5:1 | buddy |
| dark | #f87171 | #16161f | 6.50:1 | 4.5:1 | history-error |
| dark | #9a9ab0 | #16161f | 6.52:1 | 4.5:1 | login |
| dark | #9a9ab0 | #16161f | 6.52:1 | 3:1 | buddy |
| dark | #aa95ff | #1a1928 | 6.96:1 | 4.5:1 | buddy |
| dark | #aa95ff | #16161f | 7.23:1 | 4.5:1 | login |
| dark | #16161f | #aa95ff | 7.23:1 | 4.5:1 | login |
| dark | #22c55e | #1a1928 | 7.59:1 | 4.5:1 | buddy |
| dark | #22c55e | #16161f | 7.89:1 | 3:1 | login |
| dark | #f3f3f8 | #252141 | 13.83:1 | 4.5:1 | buddy |
| dark | #f3f3f8 | #1f1f2b | 14.73:1 | 3:1 | login |
| dark | #f3f3f8 | #1f1f2b | 14.73:1 | 4.5:1 | login |
| dark | #f3f3f8 | #1a1a25 | 15.56:1 | 4.5:1 | history-error |
| dark | #f3f3f8 | #1a1928 | 15.64:1 | 4.5:1 | buddy |
| dark | #f3f3f8 | #16161f | 16.25:1 | 3:1 | login |
| dark | #f3f3f8 | #16161f | 16.25:1 | 4.5:1 | login |
| light | #16a34a | #ffffff | 3.30:1 | 3:1 | login |
| light | #6a6780 | #efedf8 | 4.69:1 | 4.5:1 | buddy |
| light | #6a6780 | #efedf8 | 4.69:1 | 3:1 | buddy |
| light | #6a6780 | #f0edff | 4.73:1 | 4.5:1 | buddy |
| light | #c62222 | #fbe9e9 | 4.91:1 | 4.5:1 | login-error |
| light | #5d3fd9 | #e3ddff | 5.04:1 | 4.5:1 | buddy |
| light | #6a6780 | #f9f8ff | 5.15:1 | 3:1 | buddy |
| light | #6a6780 | #f9f8ff | 5.15:1 | 4.5:1 | buddy |
| light | #6d4aff | #ffffff | 5.15:1 | 3:1 | login |
| light | #6a6780 | #ffffff | 5.43:1 | 4.5:1 | login |
| light | #6a6780 | #ffffff | 5.43:1 | 3:1 | register |
| light | #0f7234 | #f9f8ff | 5.72:1 | 4.5:1 | buddy |
| light | #c62222 | #ffffff | 5.75:1 | 4.5:1 | history-error |
| light | #f4f0ff | #5c3ed6 | 6.02:1 | 4.5:1 | buddy |
| light | #f4f0ff | #5c3ed6 | 6.02:1 | 3:1 | buddy |
| light | #5d3fd9 | #f9f8ff | 6.26:1 | 4.5:1 | buddy |
| light | #5d3fd9 | #ffffff | 6.61:1 | 4.5:1 | login |
| light | #ffffff | #5d3fd9 | 6.61:1 | 4.5:1 | login |
| light | #ffffff | #5c3ed6 | 6.74:1 | 3:1 | login |
| light | #ffffff | #5c3ed6 | 6.74:1 | 4.5:1 | login |
| light | #ffffff | #a51d1d | 7.52:1 | 4.5:1 | requests |
| light | #f4f0ff | #452bb0 | 8.43:1 | 4.5:1 | buddy |
| light | #f4f0ff | #452bb0 | 8.43:1 | 3:1 | buddy |
| light | #ffffff | #452bb0 | 9.44:1 | 3:1 | login |
| light | #ffffff | #452bb0 | 9.44:1 | 4.5:1 | login |
| light | #17151f | #efedf8 | 15.59:1 | 3:1 | login |
| light | #17151f | #f0edff | 15.70:1 | 4.5:1 | buddy |
| light | #17151f | #f9f8ff | 17.10:1 | 4.5:1 | buddy |
| light | #17151f | #ffffff | 18.05:1 | 3:1 | login |
| light | #17151f | #ffffff | 18.05:1 | 4.5:1 | login |
