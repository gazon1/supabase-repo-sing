#!/bin/sh
# Downloads the standard Supabase Postgres init SQL files from the official repo.
# Run once before first deploy or when upgrading Supabase versions.
#
# Usage: ./scripts/download-db-init.sh
 
set -e
 
BASE_URL="https://raw.githubusercontent.com/supabase/supabase/master/docker/volumes/db"
DEST="./volumes/db"
 
FILES="
_supabase.sql
jwt.sql
logs.sql
pooler.sql
realtime.sql
roles.sql
webhooks.sql
"
 
mkdir -p "$DEST"
 
for f in $FILES; do
  f=$(echo "$f" | tr -d '[:space:]')
  [ -z "$f" ] && continue
  echo "→ Downloading $f ..."
  curl -fsSL "${BASE_URL}/${f}" -o "${DEST}/${f}"
done
 
echo "✅ All DB init files downloaded to ${DEST}/"