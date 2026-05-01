# Security Best Practices Report

## Executive Summary

The codebase has a reasonable baseline in a few areas: it uses UUIDs for externally visible identifiers, parameterized SQLite queries rather than string-built SQL, bcrypt for password hashing, and `HttpOnly` session cookies. The main weaknesses are in deployment/bootstrap defaults and in browser-facing controls around file handling and session security.

The most serious issues are:

1. Predictable default credentials and a fallback session secret that allow full account compromise in any environment launched without explicit secret configuration.
2. Unrestricted file uploads that are then served back from the same origin, creating a stored XSS path.
3. Cookie-authenticated APIs with no CSRF defense, combined with credentialed CORS that reflects arbitrary origins.

These should be addressed before treating the app as safe for multi-user or internet-exposed deployment.

## Critical

### SBP-001: Predictable bootstrap credentials and fallback session secret

- Rule ID: EXPRESS-AUTH-BOOTSTRAP-001
- Severity: Critical
- Location:
  - `server/src/index.ts:7-9`
  - `server/src/db/seed.ts:10-24`
- Evidence:
  - `const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';`
  - `const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';`
  - `const PA_PASSWORD = process.env.PA_PASSWORD ?? 'pa123';`
  - On first startup, `seedUsers()` creates the `admin` and `pa` accounts from those values.
- Impact:
  - Any deployment started without explicit environment overrides has publicly guessable credentials and a predictable session-signing secret. That allows trivial login as seeded users and makes session integrity dependent on a well-known default.
- Fix:
  - Fail fast at startup if `SESSION_SECRET`, `ADMIN_PASSWORD`, or `PA_PASSWORD` are unset in non-test environments.
  - Remove default fallback credentials entirely.
  - Prefer a first-run bootstrap flow or one-time setup token rather than persistent seeded defaults.
- Mitigation:
  - At minimum, rotate all passwords and the session secret before any shared deployment.
- False positive notes:
  - If this app is only ever run locally for one developer, the practical risk is lower, but the current code will still ship unsafe defaults into any accidental shared environment.

## High

### SBP-002: Arbitrary uploaded files are served from the application origin

- Rule ID: EXPRESS-FILE-001
- Severity: High
- Location:
  - `server/src/routes/attachments.ts:16-29`
  - `server/src/app.ts:32`
  - `client/src/components/AttachmentsSection.tsx:23-28`
  - `client/src/components/AttachmentsSection.tsx:52-56`
- Evidence:
  - The upload handler preserves the original extension and applies no MIME-type or extension allowlist.
  - Uploaded files are exposed directly through `app.use('/uploads', express.static(...))`.
  - The UI explicitly treats `.svg` as an image type and links directly to `/uploads/<filename>`.
- Impact:
  - Any authenticated user can upload active content such as `.html` or script-bearing `.svg`, then load it from the same origin. That creates a stored XSS path capable of issuing authenticated same-origin requests and acting on behalf of another logged-in user if they are induced to open the file.
- Fix:
  - Restrict uploads to a tight allowlist of safe file types.
  - Serve attachments from a separate cookieless origin or a download endpoint that forces `Content-Disposition: attachment` and a safe `Content-Type`.
  - Reject or sanitize SVG rather than treating it as a normal image.
- Mitigation:
  - As a short-term containment step, block `.html`, `.svg`, and other active content types immediately.
- False positive notes:
  - This does not require guessing filenames if the attacker is already authenticated; the API returns the stored filename after upload.

### SBP-003: No brute-force protection on login

- Rule ID: EXPRESS-AUTH-ABUSE-001
- Severity: High
- Location:
  - `server/src/routes/auth.ts:17-42`
  - `server/src/app.ts:22-43`
- Evidence:
  - The login route performs credential checks but there is no rate limiting, lockout, backoff, or abuse throttling anywhere in the middleware stack.
- Impact:
  - Attackers can attempt passwords indefinitely against the known usernames `admin` and `pa`. This is especially serious when combined with the seeded default credentials.
- Fix:
  - Add route-level rate limiting and short-term lockout/backoff for `/api/auth/login`.
  - Log failed login bursts and consider IP plus username-based throttling.
- Mitigation:
  - Strong unique passwords reduce the risk, but do not replace server-side throttling.
- False positive notes:
  - If a reverse proxy already enforces rate limits, verify that explicitly. No such protection is visible in this repo.

## Medium

### SBP-004: Cookie-authenticated API has no CSRF defense and reflects arbitrary origins with credentials

- Rule ID: EXPRESS-CSRF-001
- Severity: Medium
- Location:
  - `server/src/app.ts:24-31`
  - `client/src/lib/api.ts:16-58`
- Evidence:
  - The server enables `cors({ origin: true, credentials: true })`, which reflects request origins while allowing cookies.
  - The session cookie is only configured with `httpOnly` and `maxAge`; it does not set `sameSite` or `secure`.
  - The frontend uses `credentials: 'include'` for authenticated API requests.
  - There is no CSRF token validation or Origin/Referer enforcement on state-changing routes.
- Impact:
  - The application relies on browser defaults for CSRF resistance. In environments where cookies are sent cross-site, or across related subdomains, cross-origin pages could trigger authenticated state changes. Because CORS is fully reflective, those origins may also be able to read responses when the browser includes the cookie.
- Fix:
  - Add explicit CSRF protection for cookie-authenticated routes.
  - Replace `origin: true` with a strict allowlist.
  - Set explicit cookie attributes such as `sameSite` and `secure` based on environment.
- Mitigation:
  - If you must defer full CSRF tokens, at least enforce an Origin allowlist on unsafe HTTP methods.
- False positive notes:
  - Modern browsers often default unspecified cookies to `SameSite=Lax`, which reduces some cross-site request scenarios, but the current code should not rely on that as its primary defense.

## Low

### SBP-005: Missing baseline HTTP hardening in the Express bootstrap

- Rule ID: EXPRESS-HEADERS-001
- Severity: Low
- Location:
  - `server/src/app.ts:22-43`
  - `client/index.html:1-10`
- Evidence:
  - No `helmet()` or equivalent security-header middleware is configured.
  - `app.disable('x-powered-by')` is not present.
  - No CSP is visible in app code or in the HTML entry point.
  - No custom 404/error handler is present in the bootstrap.
- Impact:
  - These omissions increase the blast radius of any XSS or content-type confusion issue and leave default framework fingerprinting in place.
- Fix:
  - Add `helmet()` early in the middleware stack.
  - Disable `x-powered-by`.
  - Add explicit 404 and production error handlers.
  - Set CSP and related headers in app code or at the edge.
- Mitigation:
  - If headers are already injected by a reverse proxy or hosting layer, document that and verify them at runtime.
- False positive notes:
  - This is partly deployment-dependent; the repo alone cannot prove whether an edge proxy adds the missing headers.

## Open Questions

### OQ-001: Are `admin` and `pa` meant to have different privileges?

- `role` is stored in the session and schema, but protected routes only enforce `requireAuth`, not role-specific authorization.
- If those roles are intended to have different access, there is currently no server-side authorization boundary enforcing that separation.

## Recommended Remediation Order

1. Remove bootstrap defaults and require explicit secrets/passwords at startup.
2. Lock down file uploads and stop serving active content from the app origin.
3. Add login throttling and CSRF/origin protections.
4. Add baseline headers and error-handling hardening.
