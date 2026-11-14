# Mobile fixes: navigation bar overlap, clipped buttons, in-app Paystack payment

Reported by the owner from a real Android phone (screenshot: Employees screen). All decisions below are final. Implement them.

## 1. Bottom tab bar sits under the Android system navigation bar
Symptom: the tab labels/icons (Overview, Employees, Payroll, Wallet, More) are drawn underneath the 3-button / gesture navigation bar, so they are overlapped and hard to tap. Cause to confirm: `mobile/app.json` has `android.edgeToEdgeEnabled: true` and `mobile/app/(app)/_layout.tsx` gives the tab bar a fixed `height: 64` with fixed padding and does not use the bottom safe-area inset.
Required:
- The tab bar must grow by the bottom safe-area inset (react-native-safe-area-context is installed) so every tab is fully above the system navigation bar on gesture navigation, 3-button navigation, and on devices with no inset. Keep the visual design (white bar, orange active tint).
- Audit every screen and stack screen (including modal screens such as employee/new and payroll/new, and the ScrollView `Screen` wrapper in `mobile/src/components/ui.tsx`) for content that can end up under the status bar or the navigation bar, and fix with safe-area insets, not magic numbers.
- Make sure the root `<StatusBar>` / system bars look correct on Android with edge-to-edge (no black or transparent overlap).

## 2. Header action buttons are clipped / overflow the screen
Symptom: on Employees the orange "Add employee" button is cut off at the right edge ("Add emp...") because it sits in a row next to the description text. The same pattern may exist on Payroll ("New payroll") and elsewhere.
Required: fix the layout so the description wraps and the action button is always fully visible with a 44px+ touch target at 360dp width and at larger font scales (system font size "large"). Audit every screen for a row that puts text and a button side by side (`grep` for `flexDirection: 'row'` with a Pressable/Button) and fix all of them consistently (for example: stack the button under the text on narrow widths, or let the text flex and shrink while the button never shrinks).

## 3. Paystack wallet funding must stay in the app and return to the app
Current behaviour (confirmed in code): `mobile/app/(app)/wallet.tsx` calls `Linking.openURL(authorizationUrl)`, which opens the phone's external browser. Paystack's `callback_url` is set in `backend/src/controllers/wallet.controller.ts` to `config.frontendUrls[0]` (the website), so after paying, the user lands on the website and stays there. Nothing brings them back to the app, the app does not verify the payment, and the wallet only updates after a manual refresh.

Required behaviour:
1. Payment opens in an in-app browser (Android Chrome Custom Tab / iOS SFSafariViewController) using `expo-web-browser` `openAuthSessionAsync(authorizationUrl, 'remit://wallet')` (expo-web-browser is already installed; the app scheme `remit` is already set in app.json). Do not add react-native-webview.
2. When the user finishes paying, Paystack redirects to the callback URL, which must redirect on to the app deep link `remit://wallet?reference=<reference>` so the in-app browser closes by itself and the user is back in the app automatically. Paystack requires an https callback URL, so add a small server-side return endpoint, for example `GET /api/v1/wallet/paystack-return` that validates and sanitises `reference` (alphanumerics, `_`, `-` only, max 100 chars) and answers HTTP 302 to `remit://wallet?reference=...`. It must never redirect anywhere else (no open redirect), and it must not credit the wallet. Crediting stays with the existing verify endpoint and the webhook.
3. `initializeDeposit` must choose the callback URL by client: requests from the mobile app (the app already sends header `X-Client: mobile`) use the new return endpoint; web requests keep the current web callback unchanged. The return endpoint needs the API's public base URL: use a new optional env var `API_PUBLIC_URL`, falling back to a URL derived from the request (honour `trust proxy` so it is `https://api.apexleger.com` on Render). Document the env var in `ENV_TEMPLATE.txt`. Mock Paystack mode (`USE_PAYSTACK_MOCK=true`) must keep working locally for both web and mobile.
4. After the in-app browser closes for ANY reason (success redirect, user dismissed, cancelled), the app calls the existing `verifyDeposit(reference)` API, polls for up to about 20 seconds (every 2 seconds) while the result is still pending (the webhook can lag), then refreshes wallet, transactions, dashboard and notifications queries. Show clear states: "Payment confirmed, wallet updated", "Payment is still processing, we will update your wallet shortly", or "Payment was not completed". No manual pull-to-refresh required.
5. Safety net: when the app returns to the foreground (`AppState` becomes active) or the Wallet screen regains focus, refetch the wallet and transactions, and if a funding attempt reference is pending in memory, verify it.
6. Find any other place in the mobile app that opens an external browser for payment (`grep -rn "Linking.openURL\|openBrowserAsync"`) and handle it the same way.
7. The web app's own funding flow must not change behaviour.

## 4. Verification and delivery
- Backend: add unit tests for callback URL selection (mobile vs web), the return endpoint (valid reference redirects to the exact deep link; invalid or malicious `reference` is rejected or sanitised; no other redirect target is possible), and API_PUBLIC_URL fallback. `cd backend && pnpm build && pnpm test` must pass (currently 13 tests on main; do not weaken existing ones).
- Frontend: `cd frontend && pnpm build` passes (no web behaviour change).
- Mobile: `cd mobile && bun run typecheck && bun run lint` pass.
- Verify what you can locally against the local test Postgres (127.0.0.1:55434, remit_test) with mock Paystack: the return endpoint redirect, and the verify polling logic. You cannot test Android system bars in a browser; explain in your summary exactly how each safe-area change works so a reviewer can check it on a phone.
- Work on branch `fix/mobile-nav-and-payments` (a git worktree at ../REMIT-mobile-fixes). Commit on the branch. Do not push, do not touch main, do not touch any non-local database or the live site.
- Finish with a summary: files changed, endpoints/env vars added, tests added, commands run with results, and any deviations.
