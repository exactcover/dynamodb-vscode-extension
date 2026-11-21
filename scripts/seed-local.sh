#!/usr/bin/env bash
# Creates a Users table in DynamoDB Local and writes sample users.
# Start the database first:
#   bun run db:start
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun scripts/seed-local.ts
