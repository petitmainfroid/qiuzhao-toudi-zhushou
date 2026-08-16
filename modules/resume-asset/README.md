# Default resume asset

This module is the only bridge between the encrypted PDF saved by the local
profile editor and the browser upload kernel. It never accepts a caller-supplied
file path. The Agent-facing snapshot contains only availability and MIME type.

For Chrome upload, the encrypted PDF is materialized inside a freshly-created
private temporary directory, passed to a bounded callback, and removed in a
`finally` block. The plaintext path and bytes never enter MCP responses, plans,
logs, or workflow ledgers.

The asset validates the PDF signature, size, media type and SHA-256 immediately
before materialization. Cleanup retries bounded Windows sharing violations and
removes only verified, package-prefixed orphan directories older than one
minute; a recent directory is treated as a concurrent operation and preserved.
Physical secure erasure is not promised on SSDs, so Windows CurrentUser DPAPI
remains the protection for the durable source asset.
