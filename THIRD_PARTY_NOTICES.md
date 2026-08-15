# Third-party notices

## OpenCLI

Portions of `src/bridge/opencliCdp.ts` are modified from the extension-side CDP transport in [jackwener/OpenCLI](https://github.com/jackwener/OpenCLI), version 1.8.6, commit `399c0de2a76eb979aee3a3836cf2d24fd247780f`.

Copyright 2025 jackwener.

OpenCLI is licensed under the Apache License, Version 2.0. A copy is included at `third_party/opencli/LICENSE`.

The modified port removes the OpenCLI CLI, local daemon, WebSocket bridge, raw JavaScript evaluation, Cookie access, network capture, downloads, tab containers, and arbitrary filesystem-path upload. It adds an extension-local, user-gesture-created HTTPS session, privacy-safe structural status, Origin pinning, expiration, and recruitment-specific safety boundaries.
