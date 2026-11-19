# StudyBridge 1.1.0

A Windows desktop study companion built with Electron, TypeScript and React. Choose material, approve sharing, and receive numbered suggested answers locally or on an approved phone. The app never fills or submits website answers and never controls an external browser.

## Recipient installation

Open `release/1.1.0/StudyBridge-1.1.0-Setup.exe`. The installer bundles the runtime, provides a Start-menu entry, an optional desktop shortcut and a Windows uninstall entry. The portable alternative is `StudyBridge-1.1.0-Portable.exe`. Recipients need no developer tools.

**Both builds are unsigned.** No signing identity was available. Windows may display publisher or reputation warnings. This project does not recommend bypassing Windows security warnings; obtain a signed release from a trusted maintainer if required by your policy.

Launch StudyBridge, complete the welcome screen, and add your own OpenAI API key in Settings. The suggested model is `gpt-5.4-mini`; it is configurable. A ChatGPT subscription does not itself supply API credits. Set request and spending limits to suit your account.

Choose a screen/window from the visual picker, import images or a PDF, or paste text. Review the source preview and consent notice. For a screen/window, click Enable phone scans, then tap Scan now on your approved phone for each snapshot. Nothing is captured on a timer. Imported material and pasted text still use Start. Pause stops captures and queue dispatch; in-flight work may finish. Stop cancels in-flight work and prevents late results from being accepted. The top bar always has Stop. Start a new session to reset its request and spending counters.

## Phone pairing

The existing viewer is https://studybridge-eczn.onrender.com. Upgrade both desktop and hosted source to 1.1.0 for the phone scan button. Desktop-only imported material does not depend on hosting.

A maintainer must deploy the included relay/viewer once, following [DEPLOYMENT.md](DEPLOYMENT.md). Managed hosting can supply an HTTPS address without buying a domain. Put the actual deployed origin in Settings; no production address is invented or hardcoded.

Click Connect phone. Scan the QR, or open that hosted address on a phone and type the ten-character join code. Enter a phone name. Compare the verification number on both screens and approve on the desktop. The code is valid for five minutes and consumed on the first join attempt. Use New join code for each additional device. Sessions expire after two hours. Use Revoke or Disconnect all phones to remove access.

The viewer includes stable ordering, search, bookmarks, needs-review filtering, previous/next, optional follow-newest, plain answers, code blocks, equations and source images. Bookmarks are temporary UI state. Pairing credentials live in phone tab session storage; no AI key is transmitted. Reconnects replace the current versioned snapshot rather than appending duplicate answers. A relay restart expires all sessions and requires pairing again.

## Privacy and limits

- API calls run only in the desktop main process. Keys and optional latest-session history use Electron's Windows-backed asynchronous encryption. No plaintext fallback. The saved key is never returned to the renderer or phone. The user necessarily types a new key into the app's password field.
- Renderer sandboxing, context isolation, no Node integration, sender-validated IPC, no popups/webviews, navigation restrictions and a content security policy are enabled. Captured data is plain study content, not executable instructions. No provider tools are enabled.
- Local history is off by default; when enabled, only the latest session is saved. Delete history clears the saved file and current session. Relay contents are in process memory, not a database. TLS terminates at the host, which can access shared material; this is not end-to-end encryption. Providers and hosts have their own retention policies.
- Windows encryption protects data at rest from other Windows users; it is not protection against malicious software running as the same user.
- A request reservation uses UTF-8 text bytes, a generous schema allowance, 65,536 input-token allowance per image and the 8,192 output-token cap. Reservations are retained even on cancellation/failure and are counted before concurrent dispatch. Usage-based estimates use provider-returned tokens and your configured rates. Neither is an invoice or guaranteed hard billing cap, particularly with different models/prices. Configure provider account limits too.
- Automatic billable retries are disabled. Individual retry is explicit and warns about possible previous charges. This avoids silently duplicating uncertain billable requests. Network reconnection of the phone does not retry AI requests.
- PDFs are rasterized with their visual content intact, up to 20 pages per file. All pages of one PDF are extracted together to support shared passages across pages. Answer requests include the extracted question/passage and relevant referenced pages. Input files are limited to 20 MB each, 30 material batches per Start, and 24 MB total submitted material per Start. Images are scaled to at most 2,400 pixels; selected screen/window snapshots use up to 1,920×1,080. Unreadable details require review.
- Maximum 100 input batches per session; extraction allows up to 100 questions per batch. Relay snapshots allow up to 500 questions and 30 MB per request. Large sessions may hit transfer or budget limits before those maxima. Shared image assets are sent once per snapshot and unchanged snapshots are not retransmitted by the desktop.
- The model can still omit, misread, or misinterpret questions and diagrams. Extraction warnings and missing-context flags are shown. Question deduplication uses normalized extracted wording, choices, fields, passage and visual description; changed extraction wording can evade it. It cannot read material outside the selected source, unseen questions or unloaded pages.
- No automatic scrolling, website injection, submission, or stealth functionality is implemented.

## Screen-capture protection

“Protect app window from screen capture” calls Electron's supported `BrowserWindow.setContentProtection` for every application BrowserWindow. It asks Windows to exclude those windows from supported capture paths. Capture indicators remain visible.

**Observed limitation:** on Windows 11 build 22631 (`10.0.22631`), Electron 45.3.4 reported protection enabled, but its `desktopCapturer` window-thumbnail path still listed the app and returned a non-black thumbnail, just as with protection off. This check did **not** demonstrate capture exclusion. Other capture tools and Windows versions are unverified. See `test-results/capture-protection.json`.

This is not invisibility. It does not prevent cameras, malicious software, unsupported capture methods, or a website from gathering other information. It does not protect unrelated windows or revoke any website's screen-sharing permission. No recording indicators are hidden and no monitoring software is bypassed.

## Maintainer development

Requires Node 24 and npm on the build machine only:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm start
npm run smoke
node scripts/pdf-smoke.mjs
node scripts/phone-smoke.mjs
node scripts/protection-check.mjs
npm run package
```

`src/main.ts` owns credentials, capture, settings and validated IPC. `src/engine.ts` owns extraction/answer scheduling, generation-based cancellation, deduplication and reservations. `src/provider.ts` is the provider adapter. `relay/server.ts` is the authenticated, in-memory relay. `src/ui` supplies both the desktop UI and the browser viewer. Production code does not log credentials or captured material.

The lockfile pins actual dependency versions. The installer includes runtime dependencies. Updating Electron, PDF.js, KaTeX or the OpenAI SDK requires rerunning the checks. `npm audit` was clean at verification time; this is not a future security guarantee.

For a signed build, obtain a real signing identity, configure electron-builder's signing support and enable `build.win.signExecutable`. No certificate or publisher identity is fabricated here.

## Verification status

See [VERIFICATION.md](VERIFICATION.md). Automated fixtures are not live AI accuracy tests. Browser viewport emulation is not a physical phone. Launching the packaged executable on this development Windows machine is not a clean-machine installation test.

## Official documentation consulted

- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [GPT-5.4 mini capabilities and token prices](https://developers.openai.com/api/docs/models/gpt-5.4-mini): configurable default rates of $0.75 input and $4.50 output per million tokens, checked November 18, 2026
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage), [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer), and [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
