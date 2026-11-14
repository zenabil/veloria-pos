---
name: veloria-electron
description: "Secure and maintain Veloria's Electron desktop boundary, including main/preload/renderer separation, IPC contracts, filesystem access, window security, native services, and packaged-runtime behavior."
---

# Veloria Electron — process boundaries and desktop security

## Mission

Keep privileged desktop capabilities in the main process, expose only narrow typed operations to the renderer, and ensure the application behaves safely both in development and when packaged.

## Inspect the actual Electron setup

Before editing, inspect Electron version, main/preload entry points, window creation, context isolation, sandbox settings, CSP, IPC registries, permission handlers, filesystem services, native modules, updater, and packager configuration. Do not copy old file paths or version assumptions from source notes.

## Security baseline

- Keep `contextIsolation` enabled and Node integration disabled in the renderer unless a documented exception has been threat-modeled and approved.
- Prefer sandboxed renderer processes where compatible with the application.
- Expose a minimal `contextBridge` API. Never expose raw `ipcRenderer`, `fs`, SQLite handles, arbitrary command execution, or a generic SQL runner.
- Define each IPC channel explicitly with a request schema, response schema, authorization check, sender/window validation, and bounded payload size.
- Validate untrusted data again in the main process. Renderer validation is a usability layer, not a security boundary.
- Verify the sender frame belongs to the expected application origin/window before processing privileged requests.
- Restrict navigation, new windows, external protocol handlers, and webview usage. Open external URLs only through a controlled allowlist/confirmation policy.
- Protect filesystem operations against traversal, symlink surprises, invalid extensions, unsafe overwrite, and writes outside approved directories.
- Do not expose secrets, private keys, license signing material, or database credentials to the renderer or logs.
- Keep business validation and database writes in trusted layers.

## IPC design

A channel must have:

1. Stable, namespaced name.
2. Explicit input/output schema.
3. Authorization/feature-license policy where applicable.
4. Sender validation.
5. Size/time bounds.
6. Sanitized error contract.
7. Audit/logging behavior that avoids secrets and personal data.
8. Unit/integration tests for valid, invalid, unauthorized, malformed, and wrong-sender calls.

Avoid broad IPC APIs such as `invoke(channel, ...args)` exposed to arbitrary renderer code.

## Main-process reliability

- Handle unhandled promise rejections and uncaught exceptions with a deliberate safe-shutdown/recovery policy.
- Serialize database initialization, migrations, backup, and shutdown.
- Do not block the UI thread with long-running CPU or filesystem work; use a worker/utility process only when justified and secured.
- Ensure native modules are built for the exact Electron runtime ABI and target architecture.
- Verify preload and main files are actually present in packaged artifacts.

## Verification workflow

1. Inspect all affected IPC declarations, handlers, validators, preload exports, and renderer callers.
2. Trace data from user input to main-process write.
3. Test invalid payloads, forged sender, oversized payload, missing license/permission, and I/O failure.
4. Test packaged build behavior, not only a development launch.
5. Review dependency/native module ABI and package allow/deny lists.
6. Inspect logs for accidental data/secret leakage.

## References

- `references/main-process-security.md`
