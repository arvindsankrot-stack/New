#!/usr/bin/env bash
# One-time setup of Cleanup on a fresh Ubuntu 24.04 server (e.g. Oracle Always Free Ampere A1).
# Installs Docker + Tailscale, downloads the app, creates .env with fresh secrets,
# and serves the app privately over HTTPS on your Tailscale network only.
#
# Run as the default "ubuntu" user:
#   curl -fsSL https://raw.githubusercontent.com/arvindsankrot-stack/New/claude/personal-data-cleanup-app-4rcec7/cleanup/deploy/oracle-setup.sh -o setup.sh
#   bash setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/arvindsankrot-stack/New.git}"
BRANCH="${BRANCH:-claude/personal-data-cleanup-app-4rcec7}"
APP_DIR="$HOME/New/cleanup"

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }

say "1/6 Installing system updates, git and Docker"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y git docker.io docker-compose-v2 python3
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

say "2/6 Installing Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
if ! tailscale status >/dev/null 2>&1; then
  echo "Open the link below on your iPhone/computer and sign in to Tailscale (same account as the Tailscale app on your iPhone):"
  sudo tailscale up --hostname=cleanup
fi

say "3/6 Downloading the app"
if [ ! -d "$HOME/New/.git" ]; then
  echo "(If the repository is private, enter your GitHub username and a Personal Access Token as the password.)"
  git clone --branch "$BRANCH" "$REPO_URL" "$HOME/New"
else
  git -C "$HOME/New" fetch origin "$BRANCH" && git -C "$HOME/New" checkout "$BRANCH" && git -C "$HOME/New" pull --ff-only
fi
cd "$APP_DIR"

say "4/6 Setting up private HTTPS address with Tailscale"
# Serves http://127.0.0.1:8000 as https://cleanup.<your-tailnet>.ts.net, reachable only by your own devices.
# If it asks you to enable HTTPS for your tailnet, open the link it prints, enable it, then run this script again.
sudo tailscale serve --bg 8000
TS_NAME="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
BASE_URL="https://${TS_NAME}"

say "5/6 Creating .env with new secret keys"
if [ ! -f .env ]; then
  cp .env.example .env
  DB_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  FILE_KEY="$(python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')"
  SESSION_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  sed -i "s|^DB_KEY=.*|DB_KEY=${DB_KEY}|; s|^FILE_KEY=.*|FILE_KEY=${FILE_KEY}|; s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SECRET}|" .env
  chmod 600 .env
fi
sed -i "s|^BASE_URL=.*|BASE_URL=${BASE_URL}|; s|^SECURE_COOKIES=.*|SECURE_COOKIES=true|" .env

say "6/6 Building and starting the app (first build takes a few minutes)"
sudo docker compose up -d --build

cat <<MSG

------------------------------------------------------------
 Cleanup is running.

 Open on your iPhone (Tailscale app must be ON):
     ${BASE_URL}

 IMPORTANT - back up these secret keys somewhere safe (password manager).
 Without them your data cannot be recovered:
     $(grep -E '^(DB_KEY|FILE_KEY)=' .env | tr '\n' ' ')

 Add API keys later with:   nano ${APP_DIR}/.env
 then restart with:         cd ${APP_DIR} && sudo docker compose up -d
 Google OAuth redirect URI: ${BASE_URL}/accounts/gmail/callback
------------------------------------------------------------
MSG
