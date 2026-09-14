# Tutorly login-page refresh

Scope was narrowed to the login page. No backend, database, role, teacher-workspace,
or academic-onboarding changes are included. Existing email-code, password, OAuth,
session and `info.html` onboarding endpoints remain in use. `sign_up.html` is a
compatibility redirect to the same entry, preserving OAuth query parameters.

The email-first screen sends a real request to the existing OTP endpoint; it never
looks up whether an email exists. Existing-password login is available in the next
step regardless of the address. Provider buttons use the server's enabled flags;
unconfigured buttons explain that email can be used instead. Backend credentials
were neither inspected nor changed in this refresh.

## Original artwork

`assets/auth-study-ai.png` was created with the built-in image-generation tool,
not web/stock-image search. It is decorative and hidden on phones.

Final generation prompt:

> Use case: illustration-story. Asset type: original illustration for the left panel of Tutorly's desktop login page, not a screenshot or full web page. Primary request: a premium, calm editorial illustration of one Indian teenage student sitting at a simple desk, thoughtfully studying an open book with a notebook and a small laptop, approachable and natural. Composition: centered medium-wide scene, uncluttered, generous soft negative space around the person and desk, all objects fully contained. Style: sophisticated contemporary editorial illustration with soft hand-painted texture and clean shapes, believable proportions, not childish, not photoreal stock photography, not 3D plastic. Palette: restrained blue and indigo clothing and books, warm natural skin tone, very pale cool lavender background exactly close to #edf0fb, subtle shadows, no giant gradients. Mood: curiosity and focus, a slight relaxed smile. No words, no letters, no logo, no watermark, no icons, no UI, no equations. Landscape 3:2 composition. This is a fresh AI-created project illustration, do not reference any existing artwork.

## Verification

- Start isolated test harness: `python tests/auth_entry_server.py` (loopback only,
  temporary DB, captured SMTP; not imported by production).
- Run `node tests/auth-entry-browser-check.js`; set `TUTORLY_PLAYWRIGHT_PATH` if
  Playwright is supplied by the local tool runtime rather than installed locally.
- Browser checks use the real local auth routes and real rendered pages at
  1440, 1024, 768, and 390 pixels. Cover new email-code login, existing password
  login, invalid input/code/password, signup alias, cancelled/expired OAuth,
  unavailable provider, offline retry/back, and reduced motion.
- Existing backend auth, social-auth backend, OIDC validation, site consistency,
  social UI, and responsive-navigation checks are also retained.

These checks do not establish live SMTP delivery or production Google/Microsoft/
Apple configuration. No live provider sign-in is claimed.
