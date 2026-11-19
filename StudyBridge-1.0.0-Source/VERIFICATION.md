# Verification record — StudyBridge 1.0.0

Date: November 18, 2026. Host: Windows 11, build `10.0.22631`; Electron `45.3.4`; x64. This record distinguishes local evidence from external checks that still require resources.

## Automated checks completed

`npm run typecheck` passes. `npm test` passes **29 tests**:

- Structured fixtures cover single and multiple choice, true/false, multiple blanks, separate matching/dropdown rows, ordering, signed numerical answers with units, short answers and programming questions.
- Missing visual references, absent context and low confidence force review. Invalid choice indices, mismatched choice text, exchanged dropdown labels and unavailable dropdown options are rejected.
- Repeated input is not extracted again. Repeated extracted questions are not answered again, including when unrelated screenshot pixels change. Order stays fixed when parallel answers finish out of order.
- Concurrency remains bounded. Request and spending reservations stop additional dispatch. Stop aborts active work; late results cannot enter a replacement session. Individual cancellation discards its late result. Pause holds queued work.
- Extraction errors and answer errors are separate.
- Expiring, single-use pairing codes; desktop approval; unauthorized device rejection; guessing rate limits; socket revocation; versioned reconnect snapshots; oversized WebSocket frame handling; and clearing expired desktop sessions.
- A fake key sentinel added as an unexpected snapshot field is stripped and never delivered to the viewer. Shared image payloads are included only once per snapshot.

These tests use controlled fixtures/mocks. They do not establish live AI accuracy, paid usage, real provider failures, or broad security certification.

## Automated local Windows and browser checks

Recorded JSON reports and screenshots are under `test-results`:

| Check | Evidence and scope |
|---|---|
| Desktop launch and first-run flow | `desktop-smoke.json`; wizard, Settings and Study interface render without renderer exceptions |
| Credential encryption | Synthetic key round-tripped through Windows-backed safeStorage; encrypted file did not contain plaintext; init response exposed only key presence |
| Consent guard | Resume before first Start is rejected; starting without a key gives a clear error |
| Source selection | Windows screen/window picker returns sources |
| Complete capture-to-answer path | `capture-smoke.json`; selected fixture window → actual capture → main-process OpenAI SDK → mocked structured extraction/answer response → desktop answer |
| Capture stability and source loss | Same captured fixture produced only one extraction and one answer request; closing the fixture automatically paused capture |
| PDF import | `pdf-smoke.json`; native dialog result, local PDF read, worker loading in sandbox, rasterization of text/vector content, and page preview all passed |
| Phone viewer | `phone-smoke.json`; local relay, Edge at 390px mobile viewport, join/approval, authenticated result, math, bookmark filtering, reload/reconnect without duplicates, revoke and clearing content passed |
| Visual review | Desktop, phone and PDF screenshots were generated; desktop and phone layouts were inspected, with no horizontal phone overflow |
| Dependency audit | `dependency-audit.json`; no known vulnerabilities reported at the time of the final audit |

The capture-to-answer test explicitly replaces the network request with a mock. It uses no real API key and incurs no provider charges. The phone test uses local HTTP/WS strictly within the development machine; public desktop configuration requires HTTPS. Edge viewport emulation is not a real phone.

## Capture-protection finding

The automated check toggled protection off → on → off for the app window and inspected the same window through Electron desktopCapturer. Windows/Electron reported the requested API setting correctly. In all three samples the window remained listed, its thumbnail width was 640 pixels, and the test counted 270,720 non-black pixels.

This method **did not demonstrate exclusion** on this host. The app and user guide explicitly disclose that result. No claim is made that the application is undetectable or invisible. Snipping Tool, browser screen sharing, OBS and other capture paths were not separately verified. Cameras and hostile software are outside the protection guarantee.

## Release checks

The NSIS installer and portable Windows x64 executable are generated using electron-builder. The normal installer is configured for selectable install location, Start-menu shortcut, optional desktop shortcut and uninstall entry. Both releases bundle Electron and application dependencies. Both are unsigned; no signing identity was supplied.

The packaged executable successfully launched in an isolated fresh profile on this host. Its wizard, settings, source picker, consent guard and Windows encryption checks passed without renderer exceptions; see `test-results/packaged-smoke.json`. Windows Authenticode inspection reported `NotSigned` for the installer, as expected. A launch check on this existing development machine does not establish clean-machine installation/uninstall behavior.

## Unverified external requirements — do not mark these passed

1. **Live OpenAI API:** enter a real key in desktop Settings and test representative material for every question type, graphs, images, tables, equations, shared passages and code. Confirm model access, billing, actual errors and output accuracy. No credentials were supplied to this build session.
2. **Public HTTPS hosting:** the user confirmed they do not have a host. Follow DEPLOYMENT.md to deploy a single relay/viewer instance, configure its real origin and verify TLS/WSS. The Docker/Compose deployment has not been run on a hosting server.
3. **Physical phone:** pair from an actual iOS/Android browser, preferably on mobile data, receive a live result, lose/recover network, and verify immediate revocation. No physical phone was available.
4. **Clean Windows machine:** install, launch from shortcuts, test imports/capture, then uninstall on a separate supported Windows machine without Node or developer tools. This environment is not a clean machine.
5. **Code signing:** obtain a genuine identity, sign the release and verify signatures and publisher display. Do not advise disabling Windows security warnings.
6. **Capture compatibility:** verify any specific capture method the recipient intends to use. The tested thumbnail method did not exclude the protected window.

## Known functional boundaries

Answers are suggestions and may be wrong. AI extraction may miss a question or produce inconsistent wording, affecting deduplication. Imported PDFs are rasterized and capped at 20 pages; very fine details may require smaller source regions or higher-quality input. Budgets use configurable estimates and cannot replace provider-side billing controls. History retains only the latest session when enabled. Bookmarks are not persisted across viewer reloads. Server restart/expiration requires fresh pairing. The in-memory relay is intended for a small single-instance deployment, not a high-availability public service.
