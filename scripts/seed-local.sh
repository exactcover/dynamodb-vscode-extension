#!/usr/bin/env bash
# Creates a Users table in DynamoDB Local and writes two items.
# Start the database first:
#   docker run --rm -p 8000:8000 amazon/dynamodb-local
set -euo pipefail

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --table-name Users \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

aws dynamodb put-item \
  --endpoint-url "$ENDPOINT" \
  --table-name Users \
  --item '{"pk":{"S":"user"},"sk":{"S":"ada"},"name":{"S":"Ada Lovelace"},"email":{"S":"ada@example.com"},"roles":{"SS":["admin","dev"]}}'

aws dynamodb put-item \
  --endpoint-url "$ENDPOINT" \
  --table-name Users \
  --item '{"pk":{"S":"user"},"sk":{"S":"grace"},"name":{"S":"Grace Hopper"},"email":{"S":"grace@example.com"},"active":{"BOOL":true}}'

echo "Seeded Users at $ENDPOINT"
