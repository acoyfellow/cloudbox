# Box feature-parity first pass

Date: 2026-05-25

Cloudbox is moving from bounded proof runs toward Box-like interactive remote computers without giving up receipts, diffs, artifacts, and grading.

## Confirmed platform boundary

Cloudflare Containers supports operator troubleshooting through Wrangler SSH, but customer-facing access to a deployed Cloudbox computer must travel through Worker-proxied HTTP/WebSockets. Cloudbox therefore models:

- `shell` as an authenticated browser terminal (`shellinabox` in the Debian prototype; PTY/WebSocket terminal may replace it later)
- `desktop` as an authenticated browser desktop (Xvfb + fluxbox + x11vnc + noVNC)
- normal app previews through the existing live preview proxy

## First-pass lifecycle surface

A live run is the current computer identity. New endpoints:

```txt
POST   /api/runs/:id/stop
POST   /api/runs/:id/resume
POST   /api/runs/:id/fork
DELETE /api/runs/:id
```

Inputs now support:

```ts
{ live: true, ttlSeconds?: number, desktop?: boolean }
```

Rules:

- `ttlSeconds` requires `live: true`, default is one hour, maximum is 30 days.
- `desktop: true` requires `live: true`.
- stopped/deleted runs cannot accept exec/read/write/dev/preview traffic.
- stop takes a compressed workspace snapshot from the runner and writes it into R2.
- resume loads the R2 snapshot and restores it into the runner.
- fork saves the source snapshot and restores its bytes into a new child live run.

## Desktop/shell runner prototype

The desktop image configuration is in `runner/supervisord-desktop.conf`. It boots:

```txt
runner server           :8080
Xvfb display            :99
fluxbox
x11vnc                  localhost:5900
noVNC/websockify        localhost:6080
shellinabox browser shell localhost:7681
Chromium                 DISPLAY=:99
```

Named preview suffixes route through the existing authenticated proxy:

```txt
/api/runs/:id/preview/shell/*    -> localhost:7681/*
/api/runs/:id/preview/desktop/*  -> localhost:6080/*
/api/runs/:id/preview/*          -> existing per-run dev process
```

## Local desktop-image proof

The first Docker build found that `ttyd` is not available from Debian bookworm-slim's apt repositories, so the prototype uses `shellinabox` for an installable browser terminal. A local Docker build/run then proved the supervisor stack boots successfully:

```txt
runner API healthy on :8080
Xvfb, fluxbox, x11vnc, websockify/noVNC running
shellinabox running on :7681
Chromium running on DISPLAY=:99
```

Observed local Docker display size was approximately **2.6 GB** while the exported image layer size recorded by the smoke script was **701,793,008 bytes (~669 MiB)**. Accordingly, the first pass now keeps the command/proof runner at `runner/Dockerfile` and places the heavy workstation image in `runner-desktop/Dockerfile`. `desktop: true` routes work to the separate `CLOUDBOX_DESKTOP_RUNNER` binding; normal proof runs remain on the lighter `CLOUDBOX_RUNNER` binding. The default desktop deployment requests `standard-2` in production (`standard-1` for direct Wrangler/local configuration), while the lightweight proof runner remains independently configurable.

## Limitations before deployment

- Desktop packages enlarge the local runner image to approximately 2.6 GB; split into a desktop-specific image/config before treating ordinary proof runs as production-efficient.
- R2 snapshot exchange currently passes base64 snapshot bytes through the Worker/runner response. This is correct for a bounded first pass, but large workspace snapshots need streaming or direct durable upload/download before calling it production scalable.
- TTL is enforced at access time; automatic expiration cleanup still needs a scheduled or alarm-backed reaper.
- Desktop and shell routes need a deployed proof against actual Cloudflare Container WebSocket behavior and resource size.

## Acceptance checks

```txt
create live run -> write file -> stop -> resume -> read same file
create live run -> write file -> fork -> read same file in child
create desktop live run -> open shell URL -> obtain prompt
create desktop live run -> open noVNC URL -> see Chromium desktop
create live run -> start dev process -> preview still works
```
