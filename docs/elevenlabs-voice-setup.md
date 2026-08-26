# Tutorly ElevenLabs Voice Chat setup

Tutorly uses its existing full-screen Voice Chat interface with the official `@elevenlabs/client` SDK. The browser connects over WebRTC using a short-lived conversation token issued by Tutorly's backend.

## Render environment variables

Add these to the `tutorly-api` Render web service, then save and redeploy:

```text
ELEVENLABS_API_KEY=<your ElevenLabs server API key>
ELEVENLABS_AGENT_ID=agent_0201m0wydx9bft0tn09q0ex0ghm0
ELEVENLABS_ENVIRONMENT=production
```

Never add the API key to frontend JavaScript, HTML, GitHub, or a public environment variable. Tutorly sends it only from the backend to ElevenLabs' token endpoint. The frontend receives only a short-lived conversation token.

## ElevenLabs dashboard

1. Open **My Agent** in ElevenLabs.
2. Confirm the Agent ID is `agent_0201m0wydx9bft0tn09q0ex0ghm0`.
3. Enable the client events used by Tutorly: user transcript, agent response, interruption, and conversation metadata.
4. Configure the agent's Tutorly tutoring prompt, language support, voice, and turn-taking in ElevenLabs.
5. Restrict the agent to Tutorly's production domain in the agent Security allowlist where applicable.

## Runtime flow

```text
Tutorly headset button
  -> POST /api/voice/session with the existing Tutorly session
  -> Tutorly backend requests a WebRTC token from ElevenLabs
  -> @elevenlabs/client starts the voice conversation
  -> transcript and agent replies update the existing Tutorly overlay and chat history
```

If ElevenLabs is not configured or temporarily unavailable, Tutorly keeps the existing Groq-transcription/browser-speech voice path available as a graceful fallback.

The requested agent is also configured as the public-agent fallback. When the backend token route is unavailable, the official SDK starts `agent_0201m0wydx9bft0tn09q0ex0ghm0` directly. Keep that agent public and restrict its allowed domains to Tutorly until the private server-token setup is deployed.

## Verification

Run:

```text
npm run check:voice
```

Production verification still requires the real Render environment variables, a microphone-enabled HTTPS browser, and an enabled ElevenLabs agent.

Official references:

- https://elevenlabs.io/docs/eleven-agents/libraries/java-script
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token
- https://elevenlabs.io/docs/eleven-agents/customization/authentication
