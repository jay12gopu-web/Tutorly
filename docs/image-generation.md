# Tutorly study-image generation

## Implementation

The existing single semantic routing/answer call may select an
`educational_illustration` action. Exact diagrams, geometry, circuits, flows and
charts continue using the existing deterministic renderers. Simple arithmetic
and definitions do not need a generated illustration.

The response carries bounded image-tool parameters, not a fabricated image URL.
The existing chat mounts the image action beside the answer. A fresh explicit
image request starts automatically with the credit cost visible; an optional
suggestion offers a Generate button. The written answer does not depend on the
image request succeeding.

`POST /api/images/generate` validates the existing authenticated Tutorly session,
input lengths, action, labels, aspect ratio and style. OpenAI's Images API is
called server-side, using `gpt-image-1-mini` by default. Model selection is
configurable with `TUTORLY_IMAGE_MODEL`. Returned base64 PNGs are size-limited,
decoded, checked and re-encoded using Pillow before storage. Arbitrary provider
URLs, SVG, HTML and attachment placeholders are not accepted.

Reference: [OpenAI Images API](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Production configuration — required before enabling live images

In **Render → tutorly-api → Environment**, set:

- `OPENAI_IMAGE_API_KEY`: a real OpenAI image-capable API key.
- `TUTORLY_ENV=production`.
- `TUTORLY_CREDIT_SERVICE_URL`: HTTPS origin of the existing Node subscription
  service, without `/internal/credits`.
- `TUTORLY_CREDIT_SERVICE_SECRET`: a random server-only secret of at least 32
  characters. Set the same value on the Node subscription service.

Optional: `TUTORLY_IMAGE_MODEL` (default `gpt-image-1-mini`).

The Node subscription service still uses its existing Mongo configuration.
MongoDB transactions require a replica set/Atlas; the integration fails closed
on standalone MongoDB rather than performing unsafe separate debit writes.

**Identity mapping must be verified before enabling credit-backed images.**
The existing billing system stores browser-generated `mtu_...` user IDs,
whereas login authenticates an internal numeric account ID. They are NOT
interchangeable. An operator must verify ownership and associate each existing
Subscription's new unique `authUserId` with the authenticated account. Never
copy an unverified browser user ID into this field or silently merge accounts.
No production accounts are modified by this change, no additional allowance is
created, and unlinked accounts receive a friendly unavailable response.

Persist **/app/uploads** on the Python deployment so generated images survive
restarts. Multiple Python instances need shared storage at that path and the
same Node credit authority. Existing `/uploads` serves the random opaque PNG
paths; keep these URLs private when sharing sensitive study content.

Redeploy both backend services after configuration. Provider credentials,
verified account mapping and production end-to-end generation have **not**
been verified by the offline test suite.

## Local development

Set `TUTORLY_ENV=development` explicitly. Only then, if the dedicated
`OPENAI_IMAGE_API_KEY` is absent, can an existing backend `OPENAI_API_KEY` be
used. A production environment or known hosting marker blocks fallback even
if another variable says development. An unset environment never enables it.

The local credit-service URL may use HTTP on localhost/127.0.0.1/::1. Remote
services require HTTPS. Keys and shared secrets stay in ignored backend env
files, never HTML, browser JavaScript, Git or Docker build contexts. Examples
contain empty key/secret placeholders.

## Credits, retries and recovery

The price is the existing `CREDIT_COSTS.educationalImage` in
`shared/tutorly-plans.js`: **8 credits**. Python and Node read the same registry.
Ordinary tutoring is not charged.

A signed, operation-bound private bridge uses the existing Subscription
`premiumCreditsRemaining`; it does not create another credit balance. The
`PremiumCreditAction` ledger transaction reserves the cost, binds the
authenticated account + request ID + request hash, and settles once. Failed
generations release the hold. Expired abandoned holds are recovered without
adding old billing-cycle credits to a new cycle.

The frontend retains the same request ID on retry and in chat history. An
already-saved image can finish interrupted settlement without calling OpenAI
again. Completed requests return the cached image without charging again.
Missing stored images do not silently trigger another debit. A reservation
with an uncertain network outcome may remain held until reconciliation/retry;
the UI does not promise an immediate refund when the server cannot confirm it.

Legacy unauthenticated trial/cancellation operations cannot reset a mapped
account's paid credit balance. Existing unmapped billing behavior remains as
before. Secure billing management for linked accounts requires the existing
operator-supported flow; do not grant it based on localStorage.

Stopping/switching chats aborts the frontend wait and prevents stale display.
A provider operation already accepted by the backend may finish; reopening
and retrying uses the same ID to retrieve it, not create a duplicate.

## Test commands

- `python tests/image_generation_smoke.py`: real request serialization with
  mock HTTP responses; dedicated-key isolation, PNG validation, provider
  failures, auth boundary, input validation, rate limit, credit failure,
  refund/retry, and ambiguous settlement recovery.
- `python tests/image_semantic_smoke.py`: semantic fixture selection for
  photosynthesis, volcano, arithmetic and follow-ups; single AI-call invariant,
  rich text/SSE preservation and malformed optional metadata.
- `node tests/image-credit-service-check.js`: isolated ledger/signature tests;
  no production database is used.
- Existing auth, secret isolation, rich-renderer, account/billing and responsive
  navigation regression suites remain applicable.

Tests using mocked providers verify integration behavior, not a live generated
image's educational accuracy or production billing credentials.
