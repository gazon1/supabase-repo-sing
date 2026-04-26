#!/bin/sh
# ./volumes/api/kong-entrypoint.sh
set -e

# Простая замена переменных без envsubst
sed -e "s|\${ANON_KEY}|${ANON_KEY}|g" \
    -e "s|\${SERVICE_ROLE_KEY}|${SERVICE_ROLE_KEY}|g" \
    -e "s|\${DASHBOARD_USERNAME}|${DASHBOARD_USERNAME}|g" \
    -e "s|\${DASHBOARD_PASSWORD}|${DASHBOARD_PASSWORD}|g" \
    /home/kong/temp.yml > /usr/local/kong/kong.yml

exec /docker-entrypoint.sh kong docker-start