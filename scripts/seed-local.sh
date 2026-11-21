#!/usr/bin/env bash
# Creates a Users table in DynamoDB Local and writes two items.
# Start the database first:
#   docker run --rm -p 8000:8000 amazon/dynamodb-local
set -euo pipefail
cd "$(dirname "$0")/.."
exec bun scripts/seed-local.ts
