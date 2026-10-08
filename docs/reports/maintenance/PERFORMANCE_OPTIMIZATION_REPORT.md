# PERFORMANCE_OPTIMIZATION_REPORT.md (2026-10-03)

## Diagnosis (evidence-based)

1. **RAM exhaustion is the bottleneck.** 2 GB total, ~170 MB free at idle-ish audit with Chrome + OpenCode running. Any build (Vite, tsc, electron-builder) will page and crawl.
2. **Background consumers:** IObit DriverBooster/UninstallMonitor, IDMan, multiple Chrome renderers. These are the only trimmable items — all else is OS + dev tools.
3. **CPU i3-2100 (2011, 2C/4T):** rebuilds (`electron-rebuild`, `tsc -b`) will take minutes, not seconds. No setting changes physics.
4. **Disk is fine:** 72 GB free, NTFS, no action needed.

## Applied optimizations

**None yet.** No evidence-based, safe change with demonstrable benefit was available without authorization:

- Startup list is already minimal (2 entries).
- No service qualifies for a safe change (see WINDOWS_SERVICES_AUDIT.md).
- Temp data is 12 MB — cleaning it changes no metric.
- Security protections were not (and will not be) weakened for benchmarks.

## Honest expectations (no fabricated percentages)

- Removing IObit/IDM background processes: expected modest idle-RAM recovery (hundreds of MB at most, measured after).
- Toolchain install + `npm ci` with correct Node 22: makes builds _possible_, not _fast_.
- This hardware cannot meet "maximum performance" in any absolute sense; the practical goal is a **working, stable build path**. Android Emulator is excluded (2 GB RAM).
