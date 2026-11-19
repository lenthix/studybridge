# One-time hosting setup — maintainer only

Recipients install the Windows app and use the browser viewer. They never need Docker, Node, certificates or port forwarding.

**Existing deployment:** https://studybridge-eczn.onrender.com. The GitHub repository is lenthix/studybridge; Render builds the StudyBridge-1.0.0-Source directory on main. Keep that directory name when updating its contents to 1.1.1. A redeploy resets pairings. Both desktop and relay/viewer must be updated for phone-triggered scans.

## Managed hosting without buying a domain

A host supporting a long-running Node service, WebSockets and managed HTTPS can provide its own subdomain. For example, [Render supports public WebSockets](https://render.com/docs/websocket). This is a deployment option, not an existing deployment.

1. Create your hosting account and put this `studybridge` directory in a private source repository you control, excluding `node_modules`, `test-results`, release executables, profiles, logs and any secrets. Do not commit API keys.
2. Create one Docker web service from that repository using the included Dockerfile. Set the project root to `studybridge` if it sits inside a larger repository. Keep the instance count at **one**. Do not use a static-only host or short-lived serverless functions.
3. The host supplies a public HTTPS URL. Set `PUBLIC_ORIGIN` to its exact origin, with no path or trailing slash. The app's startup deliberately fails until this is set correctly. Set `TRUST_PROXY=1` only when exactly one trusted platform proxy sits in front of the service; otherwise configure the proxy topology correctly before enabling it. The public service must not expose a direct untrusted path around the proxy.
4. The service listens on `PORT` (8080 by default). Use `/health` as the health-check path. The Docker image includes the static viewer and needs no database. The AI key belongs on each desktop, **never in hosting environment variables**.
5. Redeploy/restart after setting the origin. Confirm `/health` returns `{"ok":true}` via HTTPS and the origin displays the join page. Configure the host to require TLS and support WSS upgrades. Do not enable request-body or Authorization-header logging.
6. Enter that exact origin in desktop Settings, save, and connect a phone. Test a physical phone on mobile data: scan QR, connect directly, receive an answer, disconnect/reconnect the network, and revoke access. Record results before claiming public pairing works.

Hosting is an external cost. The bill may include the web-service instance, bandwidth (including image snapshots and WebSocket messages), and workspace charges; OpenAI API usage is separate. A custom domain is optional. Check the provider's current quote before purchasing: [Render pricing](https://render.com/pricing). No fixed monthly price is asserted here because plan prices and allowances vary. Free/sleeping instances can lose every in-memory pairing session on suspension or restart, and are unsuitable for a reliable standing service.

## Self-hosted HTTPS alternative

The supplied `compose.yaml` runs the relay behind Caddy. A maintainer needs a Linux host with Docker Compose, a DNS name pointing to it, and inbound ports 80/443. This applies only to the hosting server; desktop recipients need no inbound ports.

Create a `.env` file with `STUDYBRIDGE_HOST` set to your actual DNS name. Then, on that server:

```sh
docker compose up -d --build
```

Caddy handles HTTPS and WSS. Its certificate volumes persist. Port 8080 is internal only; the relay is not directly exposed. Keep exactly one reverse proxy hop. Review host firewall and DNS setup. This deployment path has not been executed in the current environment.

## Retention, authentication and operations

- Owner and device tokens have 256 bits of randomness. The relay stores their hashes. WebSockets authenticate in their first message, never a URL query. QR fragments contain only the expiring pairing code, not an API key or owner token.
- Pairing codes have 40 bits of randomness, expire after five minutes, and are single-use. Possession of the one-use code authorizes immediate pairing. Keep it private. There is no separate laptop approval step.
- Five join attempts per IP per minute, plus a general API limit of 180 requests per IP per minute. The proxy setting matters: forged forwarding headers must not control the rate-limit key. Add platform abuse controls before exposing a widely advertised public service.
- Maximum eight devices per session, twenty simultaneous sessions, 200 open sockets, and 64 MB of retained snapshot data across the relay. Session TTL is two hours, including active sessions. Restart loses all state; the phone must pair again. Do not horizontally scale without implementing shared session state and coordinated revocation.
- Shared study data and pending joins reside only in process memory. Expiration is checked on reads and swept every ten seconds; sockets close at expiration/revocation. Hosting infrastructure may have independent access, logging or memory retention. Do not enable memory dumps or request-body logs containing study data.
- Desktop revocation closes authenticated device sockets and removes their tokens. If the desktop cannot reach the relay, it reports the failure; access is not falsely reported as revoked. In that case access expires at the original session deadline. Already saved screenshots or copies cannot be recalled.
- The viewer caches credentials only in the current tab's session storage. No service worker or persistent study cache is installed. Closing/forgetting the viewer removes its local UI state; use desktop Revoke to invalidate its server authorization.
- The relay is authenticated transport, not end-to-end encryption. The host can read data. Use a host you trust and disclose it to recipients.
- Patch the runtime and dependencies; rebuild/redeploy intentionally. A deploy disconnects current sessions. Run the included security tests before releases.

## Signing and clean-machine release checks

Use a genuine signing identity to sign the Windows executables before broad distribution. Then test installation, shortcut launch, credential storage, file import, screen/window capture, pairing and uninstall on a separate supported Windows machine without developer tools. Do not tell recipients to disable Windows security checks.
