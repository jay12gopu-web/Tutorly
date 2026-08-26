# Tutorly ElevenLabs Voice Chat

Tutorly Voice Chat uses the eight approved agents in:

`shared/tutorly-voice-agents.json`

That shared registry is the only source for voice order, display metadata, stable voice keys, and ElevenLabs agent IDs. The browser stores only a stable key such as `miles` or `luna` as the student's preference.

## Production configuration

Configure this server-side Render environment variable:

```env
ELEVENLABS_API_KEY=your-server-side-key
```

Do not put the key in HTML, frontend JavaScript, localStorage, or GitHub.

The authenticated browser sends an approved voice key to `POST /api/voice/session`. Tutorly's backend validates that key against the shared registry, resolves the known agent ID, requests a short-lived ElevenLabs conversation token, and returns only that token. The client then starts the session over WebRTC.

## Public-agent fallback

If the server token service is not configured, the frontend can try the selected registry agent directly. This works only when that ElevenLabs agent allows public client connections and the Tutorly domain is allowed. Production should use the backend token flow.

## Preferences

Authenticated users persist:

- `preferred_voice_agent`
- `voice_onboarding_completed`

through `/api/auth/voice-preferences`. Local storage is only the guest/offline fallback.
