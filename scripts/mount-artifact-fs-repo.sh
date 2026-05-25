#!/usr/bin/env bash
set -euo pipefail

: "${MOUNT_GIT_REMOTE:?MOUNT_GIT_REMOTE required}"
: "${MOUNT_GIT_BRANCH:=main}"
: "${MOUNT_PATH:?MOUNT_PATH required}"
: "${ARTIFACT_FS_ROOT:=/home/user/.cloudbox/artifact-fs}"
: "${ARTIFACT_FS_DAEMON_LOG:=/tmp/artifact-fs-daemon.log}"
: "${ARTIFACT_FS_DAEMON_PID_FILE:=/tmp/artifact-fs-daemon.pid}"

case "$MOUNT_GIT_REMOTE" in
  https://github.com/*/*.git|https://github.com/*/*|https://gitlab.cfdata.org/*/*.git|https://gitlab.cfdata.org/*/*) ;;
  *) echo "mount_repo: only GitHub or brokered gitlab.cfdata.org HTTPS repositories are supported" >&2; exit 2 ;;
esac
case "$MOUNT_PATH" in
  /home/user/*) ;;
  *) echo "mount_repo: destination must be inside /home/user/" >&2; exit 2 ;;
esac
if [[ "$MOUNT_PATH" == *"/../"* || "$MOUNT_PATH" == */.. ]]; then
  echo "mount_repo: destination must not contain traversal segments" >&2; exit 2
fi

name="$(basename "${MOUNT_GIT_REMOTE%.git}")-$(printf '%s' "$MOUNT_PATH" | sha256sum | cut -c1-10)"
mount_root="$(dirname "$MOUNT_PATH")"
mkdir -p "$ARTIFACT_FS_ROOT" "$mount_root"

if ! artifact-fs status --name "$name" >/dev/null 2>&1; then
  artifact-fs add-repo --name "$name" --remote "$MOUNT_GIT_REMOTE" --branch "$MOUNT_GIT_BRANCH" --mount-root "$mount_root" --mount-path "$MOUNT_PATH"
fi

if [[ ! -f "$ARTIFACT_FS_DAEMON_PID_FILE" ]] || ! kill -0 "$(cat "$ARTIFACT_FS_DAEMON_PID_FILE" 2>/dev/null || echo 0)" 2>/dev/null; then
  nohup artifact-fs daemon --root "$mount_root" >"$ARTIFACT_FS_DAEMON_LOG" 2>&1 </dev/null &
  echo "$!" > "$ARTIFACT_FS_DAEMON_PID_FILE"
fi

for _ in $(seq 1 120); do
  if git -C "$MOUNT_PATH" rev-parse HEAD >/dev/null 2>&1; then
    echo "mount_path=$MOUNT_PATH"
    git -C "$MOUNT_PATH" rev-parse HEAD | sed 's/^/head=/'
    artifact-fs status --name "$name"
    exit 0
  fi
  sleep .5
done

echo "mount_repo: timed out waiting for ArtifactFS mount" >&2
cat "$ARTIFACT_FS_DAEMON_LOG" >&2 || true
exit 1
