#!/usr/bin/env bash
# Hits the Truvora cron endpoints that Vercel used to call for us.
#
# Usage:
#   TRUVORA_BASE_URL=https://app.example.com CRON_SECRET=... \
#     ./deploy/trigger-cron.sh [all|subscription-renewals|subscriptionsTC|account-deletions]
#
# When run from crontab there is no interactive shell env, so put both
# variables in a root-only file instead (chmod 600):
#   /etc/truvora/cron.env  ->  TRUVORA_BASE_URL=...  CRON_SECRET=...
set -euo pipefail

ENV_FILE="${TRUVORA_ENV_FILE:-/etc/truvora/cron.env}"
if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
fi

: "${TRUVORA_BASE_URL:?set TRUVORA_BASE_URL (e.g. https://app.example.com)}"
: "${CRON_SECRET:?set CRON_SECRET (same value as on the app host)}"

target="${1:-all}"
case "$target" in
    # Order matters: renewals advance nextDate before reminders read it.
    all)                 endpoints=(/api/crons/subscription-renewals /api/crons/subscriptionsTC /api/crons/account-deletions) ;;
    subscription-renewals|subscriptionsTC|account-deletions) endpoints=("/api/crons/$target") ;;
    *) echo "unknown target: $target (want all|subscription-renewals|subscriptionsTC|account-deletions)" >&2; exit 2 ;;
esac

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

status=0
for path in "${endpoints[@]}"; do
    url="${TRUVORA_BASE_URL%/}$path"
    http_code="000"
    if ! http_code="$(curl -sS -o "$body_file" -w '%{http_code}' \
        -H "Authorization: Bearer ${CRON_SECRET}" "$url")"; then
        http_code="000"
    fi
    body="$(head -c 500 "$body_file" 2>/dev/null || true)"
    printf '%s -> HTTP %s %s\n' "$url" "$http_code" "$body"
    [ "$http_code" = "200" ] || status=1
done
exit $status
