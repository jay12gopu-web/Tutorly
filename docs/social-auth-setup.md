# Tutorly social authentication setup

Tutorly implements backend authorization-code/OpenID Connect flows for Google,
Microsoft, and Apple. A provider is shown on Login and Sign Up only after every
required server-side setting for that provider is present.

## Production URLs

- Frontend origin: `https://mytutor.co.in`
- Backend origin: `https://tutorly-api.onrender.com`
- Google callback: `https://tutorly-api.onrender.com/api/auth/oauth/google/callback`
- Microsoft callback: `https://tutorly-api.onrender.com/api/auth/oauth/microsoft/callback`
- Apple return URL: `https://tutorly-api.onrender.com/api/auth/oauth/apple/callback`

The callback values must match the provider registrations and the Render
environment variables exactly. Do not add callback credentials to frontend
JavaScript or GitHub.

## Render environment variables

Set these in **Render → tutorly-api → Environment**:

```text
TUTORLY_FRONTEND_ORIGIN=https://mytutor.co.in

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://tutorly-api.onrender.com/api/auth/oauth/google/callback

MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_REDIRECT_URI=https://tutorly-api.onrender.com/api/auth/oauth/microsoft/callback
MICROSOFT_TENANT=common

APPLE_CLIENT_ID=...
APPLE_TEAM_ID=...
APPLE_KEY_ID=...
APPLE_PRIVATE_KEY=...
APPLE_REDIRECT_URI=https://tutorly-api.onrender.com/api/auth/oauth/apple/callback
```

`MICROSOFT_TENANT=common` allows both personal Microsoft accounts and work or
school accounts when the Microsoft app registration is configured for those
account types.

For `APPLE_PRIVATE_KEY`, paste the complete `.p8` signing key into a Render
secret. Multiline values are supported; a value containing literal `\n`
sequences is also normalized by the backend. Never commit the `.p8` file.

## Provider consoles

### Google

1. Create an OAuth 2.0 Web application in Google Cloud.
2. Add `https://mytutor.co.in` as an authorized JavaScript origin if required by
   the console configuration.
3. Register the exact Google callback above.
4. Configure the consent screen for only `openid`, `email`, and `profile`.

### Microsoft

1. Create a Microsoft Entra app registration.
2. Select the supported account types Tutorly intends to accept. For both
   personal and school/work accounts, enable the corresponding multitenant plus
   personal-account option.
3. Add the exact Microsoft callback as a Web redirect URI.
4. Create a server-side client secret and request only `openid email profile`.

### Apple

1. Configure Sign in with Apple for the Tutorly App ID and create a Services ID.
2. Configure `mytutor.co.in` as the web domain and register the exact Apple
   return URL above.
3. Create a Sign in with Apple key and record the Team ID and Key ID.
4. Put the Services ID in `APPLE_CLIENT_ID` and the `.p8` value in
   `APPLE_PRIVATE_KEY`.

Apple may provide a name only on the first authorization, so Tutorly stores it
when present. Apple private-relay email addresses are accepted normally.

## Security and account linking

- State is random, stored as a SHA-256 hash, expires after ten minutes, and is
  consumed exactly once.
- Google and Microsoft use PKCE (`S256`); all providers use nonce validation.
- ID-token signatures, issuer, audience, expiry, token times, and nonce are
  validated before any account record is written.
- The callback creates a two-minute, one-time Tutorly result code. The browser
  redeems it for the existing Tutorly session type; session tokens are never put
  in callback URLs.
- Provider access and refresh tokens are not persisted because Tutorly only
  needs verified identity.
- Matching text email addresses are not silently linked. The student must log in
  with the existing method and explicitly connect the provider from Profile.
- A user cannot disconnect their final usable login method.

## Local development

When credentials are absent, `/api/auth/providers` reports that provider as
disabled and the frontend hides its button. Email/password and OTP remain
available. This is intentional; Tutorly never simulates a successful provider
login.

For local provider testing, create separate development credentials and use
explicit localhost callback URIs in the matching environment variables.

## Verification

```text
python tests/auth_backend_smoke.py
python tests/oauth_provider_validation.py
python tests/social_auth_backend_smoke.py
node tests/social-auth-ui-check.js
```

These checks cover the existing email/OTP/password path, signed OIDC validation,
new and returning social users, cancellations, invalid/replayed state, account
conflicts, explicit linking, Apple relay email/name behavior, onboarding,
session restore/logout, responsive UI hooks, keyboard focus, and secret
isolation. Real production authorization still requires provider credentials and
console callback configuration.
