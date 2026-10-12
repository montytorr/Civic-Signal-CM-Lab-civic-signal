#!/usr/bin/env bash
# Install and register CivicSignal's self-hosted GitHub Actions runner on
# clawdius, idempotently. Run with sudo from a checkout of this repository:
#
#   sudo scripts/host/install-runner.sh
#
# Runner civicsignal-runner, label civicsignal (the deploy workflow runs on
# [self-hosted, civicsignal]), in /home/runner/civicsignal-runner as user
# runner (docker group), under systemd as civicsignal-runner.service — the same
# shape as kdp-runner and pod-runner.
#
# Before the service starts, queued Deploy runs are cancelled, so a run queued
# while no runner existed never executes an older deploy script.
#
# Optional environment:
#   RUNNER_TOKEN     registration token; otherwise fetched with gh as $SUDO_USER
#   CIVICSIGNAL_REPO owner/name; otherwise `gh repo view` from this checkout
#   RUNNER_TARBALL   actions-runner tarball; otherwise the newest in /home/runner,
#                    else the latest release is downloaded
set -euo pipefail

RUNNER_NAME=civicsignal-runner
RUNNER_LABELS=civicsignal
RUNNER_USER=runner
RUNNER_DIR=/home/runner/civicsignal-runner
SERVICE=civicsignal-runner.service
UNIT=/etc/systemd/system/$SERVICE
WORKFLOW=deploy.yml

if [ "$(id -u)" != 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi
REPO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

# gh runs as the user who invoked sudo: root has no GitHub login.
gh_user() {
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
    (cd "$REPO_DIR" && sudo -u "$SUDO_USER" -H gh "$@")
  else
    (cd "$REPO_DIR" && gh "$@")
  fi
}
as_runner() {
  sudo -u "$RUNNER_USER" -H "$@"
}

REPO=${CIVICSIGNAL_REPO:-$(gh_user repo view --json nameWithOwner --jq .nameWithOwner)}
echo "repository $REPO"

# 1. Runner files.
install -d -m 755 -o "$RUNNER_USER" -g "$RUNNER_USER" "$RUNNER_DIR"
if [ ! -x "$RUNNER_DIR/config.sh" ]; then
  tarball=${RUNNER_TARBALL:-$(ls -1 /home/runner/actions-runner-linux-x64-*.tar.gz 2>/dev/null | sort -V | tail -1 || true)}
  if [ -z "$tarball" ]; then
    version=$(gh_user api repos/actions/runner/releases/latest --jq .tag_name | sed 's/^v//')
    tarball=$(mktemp --suffix=.tar.gz)
    curl -fsSL -o "$tarball" \
      "https://github.com/actions/runner/releases/download/v${version}/actions-runner-linux-x64-${version}.tar.gz"
    chmod 644 "$tarball"
  fi
  echo "unpacking $(basename "$tarball")"
  as_runner tar -xzf "$tarball" -C "$RUNNER_DIR"
fi

# 2. Registration (config.sh refuses root, so it runs as the runner user).
if [ ! -f "$RUNNER_DIR/.runner" ]; then
  token=${RUNNER_TOKEN:-$(gh_user api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)}
  (cd "$RUNNER_DIR" && as_runner ./config.sh --unattended --replace \
    --url "https://github.com/$REPO" --token "$token" \
    --name "$RUNNER_NAME" --labels "$RUNNER_LABELS" --work _work)
  unset token
  echo "registered $RUNNER_NAME"
else
  echo "$RUNNER_NAME already configured"
fi

# 3. systemd unit, the kdp-runner/pod-runner shape.
unit_body=$(cat <<UNIT
[Unit]
Description=GitHub Actions Runner (civicsignal)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$RUNNER_USER
WorkingDirectory=$RUNNER_DIR
ExecStart=$RUNNER_DIR/run.sh
Restart=always
RestartSec=10
KillMode=control-group
KillSignal=SIGTERM
TimeoutStopSec=5min

[Install]
WantedBy=multi-user.target
UNIT
)
if [ ! -f "$UNIT" ] || [ "$(cat "$UNIT")" != "$unit_body" ]; then
  printf '%s\n' "$unit_body" > "$UNIT"
  chmod 644 "$UNIT"
  systemctl daemon-reload
  echo "wrote $UNIT"
fi
systemctl enable "$SERVICE" >/dev/null 2>&1

# 4. Cancel queued Deploy runs before the runner can pick one up.
cancel_queued() {
  local ids
  for status in queued pending waiting requested; do
    ids=$(gh_user run list --repo "$REPO" --workflow "$WORKFLOW" --status "$status" \
      --limit 100 --json databaseId --jq '.[].databaseId' 2>/dev/null || true)
    for id in $ids; do
      gh_user run cancel --repo "$REPO" "$id" >/dev/null && echo "cancelled $status run $id"
    done
  done
}
if ! systemctl is-active --quiet "$SERVICE"; then
  cancel_queued
  systemctl start "$SERVICE"
  echo "started $SERVICE"
else
  echo "$SERVICE already active (not restarted)"
fi

# 5. Wait for GitHub to see it online.
for _ in $(seq 1 30); do
  status=$(gh_user api "repos/$REPO/actions/runners" \
    --jq ".runners[] | select(.name == \"$RUNNER_NAME\") | .status" 2>/dev/null || true)
  if [ "$status" = online ]; then
    labels=$(gh_user api "repos/$REPO/actions/runners" \
      --jq "[.runners[] | select(.name == \"$RUNNER_NAME\") | .labels[].name] | join(\",\")")
    echo "$RUNNER_NAME online for $REPO (labels: $labels)"
    exit 0
  fi
  sleep 2
done
echo "$RUNNER_NAME is not online in GitHub; see journalctl -u $SERVICE" >&2
exit 1
