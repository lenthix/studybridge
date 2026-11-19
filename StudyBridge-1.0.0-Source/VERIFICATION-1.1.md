# StudyBridge 1.1.0 verification

Windows 11 build 22631; Electron 45.3.4. November 18, 2026.

- TypeScript check and 31 automated tests pass.
- Actual Windows fixture capture, local relay, and mobile-sized Edge viewer: no capture or AI request after enabling and waiting; one phone tap captures and returns a plain answer through the OpenAI adapter with mocked responses.
- Waiting again makes no automatic AI requests. Repeating an unchanged scan reuses existing answers.
- Pause/Resume disable/enable the phone button. Stop disables it. A closed source is detected on the next requested scan.
- Scan authentication, explicit desktop consent token, session binding, expiry, replay prevention, and queued revocation are tested.
- Answer schema has no explanation field; phone layout fits 390px.
- Desktop launch, Windows key encryption, phone join/reconnect/revoke, math rendering, and PDF import checks pass.

Reports are in test-results. Live AI accuracy, physical-phone behavior and a separate clean Windows machine were not tested.
