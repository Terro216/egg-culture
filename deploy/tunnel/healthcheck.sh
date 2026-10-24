#!/bin/sh
set -eu
# Verify CONNECT, TLS and the API response, not just the local listening socket.
code=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --proxy http://127.0.0.1:3128 --noproxy '' --connect-timeout 3 --max-time 6 \
  https://api.telegram.org/bot0:0/getMe)
test "$code" = 401
