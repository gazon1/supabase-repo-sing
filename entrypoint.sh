#!/bin/sh
set -e
 
# Wait for MinIO to be ready and create the default bucket
/usr/bin/mc alias set supabase-minio \
  http://supabase-minio:9000 \
  "${MINIO_ROOT_USER}" \
  "${MINIO_ROOT_PASSWORD}"
 
/usr/bin/mc mb --ignore-existing supabase-minio/stub
 
echo "✅ MinIO bucket 'stub' ready"
exit 0
 
