# Browser runtime

Node/CLI-first Windows runtime for a visible installed Chrome or Edge. It always uses a dedicated, non-default user-data directory and Chrome's dynamic loopback CDP endpoint. The companion control listener also binds only to `127.0.0.1` and requires a fresh 256-bit capability for each launch or reconnect.

```powershell
npm --prefix packages/browser-runtime run build
node packages/browser-runtime/dist/cli.js discover
node packages/browser-runtime/dist/cli.js launch --browser chrome --url "https://example.invalid/"
node packages/browser-runtime/dist/cli.js status
node packages/browser-runtime/dist/cli.js reconnect
node packages/browser-runtime/dist/cli.js stop
```

`launch` and `reconnect` stay resident as the control process. Run `status` and `stop` from another terminal. Session metadata is local and contains the control capability, process/port metadata, normalized page identity, and no page values, cookies, credentials, raw HTML, raw CDP, query string, or fragment.

The public API deliberately has no cookie, credential, selector, arbitrary JavaScript, raw CDP, upload, save, delete, consent, or submit operation. Page-field inspection and typed actions belong to the later browser-kernel package.
