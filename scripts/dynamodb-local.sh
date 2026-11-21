#!/usr/bin/env bash
# Start, stop, and inspect the local DynamoDB container.
# Data is stored in the dynamodb-local-data Docker volume.
set -euo pipefail

name=dynamodb-local
image=amazon/dynamodb-local
port=8000
volume=dynamodb-local-data

container_id() {
  docker ps -aq --filter "name=^/${name}$"
}

running_id() {
  docker ps -q --filter "name=^/${name}$"
}

# The image runs as uid 1000. A new Docker volume is owned by root, so
# SQLite cannot create its database file until that directory is reassigned.
prepare_volume() {
  docker volume create "$volume" >/dev/null
  docker run --rm --user root --entrypoint chown \
    -v "${volume}:/data" \
    "$image" \
    1000:1000 /data >/dev/null
}

wait_ready() {
  local attempt code
  for attempt in $(seq 1 50); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "http://127.0.0.1:${port}/" || true)"
    if [[ -n "$code" && "$code" != "000" ]]; then
      echo "DynamoDB Local is running at http://localhost:${port}"
      return
    fi
    sleep 0.2
  done
  echo "DynamoDB Local did not accept connections on port ${port}." >&2
  docker logs --tail 40 "$name" >&2 || true
  exit 1
}

start() {
  if [[ -n "$(running_id)" ]]; then
    echo "DynamoDB Local is already running at http://localhost:${port}"
    return
  fi
  prepare_volume
  if [[ -n "$(container_id)" ]]; then
    docker start "$name" >/dev/null
  else
    docker run -d \
      --name "$name" \
      -p "${port}:8000" \
      -v "${volume}:/home/dynamodblocal/data" \
      -w /home/dynamodblocal \
      "$image" \
      -jar DynamoDBLocal.jar -sharedDb -dbPath ./data >/dev/null
  fi
  wait_ready
}

stop() {
  if [[ -z "$(container_id)" ]]; then
    echo "DynamoDB Local is not running."
    return
  fi
  if [[ -n "$(running_id)" ]]; then
    docker stop "$name" >/dev/null
  fi
  echo "DynamoDB Local stopped. Data remains in the ${volume} volume."
}

restart() {
  if [[ -z "$(container_id)" ]]; then
    start
    return
  fi
  docker stop "$name" >/dev/null
  prepare_volume
  docker start "$name" >/dev/null
  wait_ready
}

status() {
  if [[ -n "$(running_id)" ]]; then
    echo "running  http://localhost:${port}  container ${name}"
  elif [[ -n "$(container_id)" ]]; then
    echo "stopped  container ${name}  volume ${volume}"
  else
    echo "absent"
  fi
}

logs() {
  if [[ -z "$(container_id)" ]]; then
    echo "DynamoDB Local has no container yet. Start it with: bun run db:start" >&2
    exit 1
  fi
  docker logs --tail 80 "$name"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  logs) logs ;;
  *)
    echo "Usage: bash scripts/dynamodb-local.sh {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
