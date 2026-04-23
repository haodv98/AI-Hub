#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP="$(date +%F-%H%M%S)"
RAW_FILE="$(mktemp /tmp/aihub_${TIMESTAMP}_XXXXXX.dump)"
ENC_FILE="${RAW_FILE}.enc"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required (e.g. s3://bucket/path)}"

trap 'rm -f "${RAW_FILE}" "${ENC_FILE}"' EXIT
chmod 600 "${RAW_FILE}"

pg_dump "${DATABASE_URL}" -Fc -f "${RAW_FILE}"
openssl enc -aes-256-cbc -salt -pbkdf2 -in "${RAW_FILE}" -out "${ENC_FILE}" -pass env:BACKUP_ENCRYPTION_KEY
pg_restore --list "${RAW_FILE}" >/dev/null
aws s3 cp "${ENC_FILE}" "${BACKUP_DESTINATION}/$(basename "${ENC_FILE}")"

echo "Backup completed: ${ENC_FILE}"
