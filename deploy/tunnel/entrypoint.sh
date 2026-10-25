#!/bin/sh
set -eu
host=$(jq -er '.host // .DE_PUBLIC_IPV4' /config/de-endpoint.json)
port=$(jq -er '.port // .DE_SSH_PORT' /config/de-endpoint.json)
user=${EGG_TUNNEL_USER:-tunnel}
test -r /keys/tunnel_key || { echo 'tunnel: key is not readable' >&2; exit 1; }
test -r /keys/known_hosts || { echo 'tunnel: pinned known_hosts is not readable' >&2; exit 1; }
test -s /keys/known_hosts
install -m 700 -d /tmp/ssh
install -m 600 /keys/tunnel_key /tmp/ssh/key
install -m 600 /keys/known_hosts /tmp/ssh/known_hosts
exec ssh -N -T -i /tmp/ssh/key -p "$port" \
  -L 0.0.0.0:3128:127.0.0.1:3128 \
  -o GatewayPorts=yes -o ExitOnForwardFailure=yes -o BatchMode=yes \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/tmp/ssh/known_hosts \
  -o ConnectTimeout=10 -o ConnectionAttempts=1 \
  -o ServerAliveInterval=10 -o ServerAliveCountMax=3 \
  -o TCPKeepAlive=yes -o LogLevel=ERROR "$user@$host"
