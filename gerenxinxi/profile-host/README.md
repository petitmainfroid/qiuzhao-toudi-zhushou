# Capability-bound profile editor host

This package exposes the existing `ProfileEditor` through a dynamically bound
`127.0.0.1` HTTP listener. The only unauthenticated document is a minimal
bootstrap shell. Its launcher capability is carried in a URL fragment, removed
from browser history before being exchanged once for an HttpOnly,
`SameSite=Strict` session cookie. Authenticated mutations additionally require
an exact loopback Origin, CSRF capability, and current opaque ETag.

The UI build aliases the extension-only default repositories. The rendered
editor always receives `HttpProfileRepository`; the built JavaScript audit
rejects `chrome.storage`, `chrome.runtime`, `localStorage`, and `sessionStorage`.
PDF originals selected in the editor are saved by the host as a single
CurrentUser-DPAPI-protected local attachment. The authenticated UI receives only
metadata on reload; raw bytes stay behind the host boundary and can be cleared
independently. PDF/DOCX text extraction remains a separate browser-side pipeline
and needs its own real-document regression evidence.

`FileProfileHostStore` adapts the existing versioned profile-service repository.
`startLocalProfileEditor` accepts a trusted, absolute application-data directory,
derives the fixed `profile/profile.json` path, verifies realpath containment and
rejects discovered links/reparse entries. The trusted application root itself is
selected by the application, not by an HTTP request or end user. The at-rest
protector remains injected so this package does not create a second encryption
implementation.

The host connects the shared editor to profile-service export and two-phase
preview/confirm/rollback. Preview is read-only and omits internal source/summary
digests; confirm and rollback require the current ETag in addition to session,
Origin and CSRF capabilities.

Verification:

```powershell
npm --prefix gerenxinxi/profile-host run typecheck
npm --prefix gerenxinxi/profile-host test
```
