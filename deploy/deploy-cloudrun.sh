#!/usr/bin/env bash
# Free-tier deployment of the EHS Safety Platform to Google Cloud.
#
#   Cloud Run (API + Web, scale-to-zero)  ·  Gemini on Vertex AI (service-account auth, billed to the project)
#   Postgres 15 on an Always-Free e2-micro VM, reachable only over the VPC (Direct VPC egress)
#   Cloud Storage (private violation evidence)
#
# Usage:  PROJECT_ID=my-project ./deploy/deploy-cloudrun.sh
# Reads optional TELEGRAM_* / FONNTE_TOKEN / WA_TARGET_PHONE from backend/.env.
# Set USE_VERTEX=false to use a Gemini API key (GEMINI_API_KEY from backend/.env) instead of Vertex AI.
# Re-running is safe: existing resources are reused and services are redeployed.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
REGION="us-central1"          # Always Free e2-micro regions: us-central1, us-west1, us-east1
ZONE="${REGION}-a"
DB_VM="ehs-postgres"
DB_NAME="ehs_safety"
DB_USER="ehs_app"
BUCKET="${BUCKET:-${PROJECT_ID}-ehs-evidence}"
API_SERVICE="ehs-api"
WEB_SERVICE="ehs-web"
SA_NAME="ehs-api-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

envval() { grep -E "^$1=" "$ROOT/backend/.env" 2>/dev/null | head -1 | cut -d= -f2- || true; }

gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  compute.googleapis.com secretmanager.googleapis.com storage.googleapis.com aiplatform.googleapis.com

echo "==> Build permissions (new projects run Cloud Build as the default compute service account)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role roles/cloudbuild.builds.builder --condition=None >/dev/null

echo "==> Service account for the API"
gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name "EHS API runtime"
for role in roles/secretmanager.secretAccessor roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA_EMAIL" --role "$role" --condition=None >/dev/null
done

echo "==> Private evidence bucket"
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA_EMAIL" --role roles/storage.objectAdmin >/dev/null

echo "==> Secrets"
put_secret() {  # put_secret NAME VALUE  (adds a new version only when the value changed)
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    [ "$(gcloud secrets versions access latest --secret "$1" 2>/dev/null)" = "$2" ] || printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic >/dev/null
  fi
}
USE_VERTEX="${USE_VERTEX:-true}"
if [ "$USE_VERTEX" != "true" ]; then
  GEMINI_API_KEY="${GEMINI_API_KEY:-$(envval GEMINI_API_KEY)}"
  [ -n "$GEMINI_API_KEY" ] || { echo "GEMINI_API_KEY missing (backend/.env)"; exit 1; }
  put_secret ehs-gemini-api-key "$GEMINI_API_KEY"
fi
gcloud secrets describe ehs-jwt-secret >/dev/null 2>&1 || put_secret ehs-jwt-secret "$(openssl rand -hex 32)"
if gcloud secrets describe ehs-db-password >/dev/null 2>&1; then
  DB_PASSWORD="$(gcloud secrets versions access latest --secret ehs-db-password)"
else
  DB_PASSWORD="$(openssl rand -hex 16)"; put_secret ehs-db-password "$DB_PASSWORD"
fi

echo "==> Postgres on Always-Free e2-micro VM"
if ! gcloud compute instances describe "$DB_VM" --zone "$ZONE" >/dev/null 2>&1; then
  cat > /tmp/ehs-pg-startup.sh <<STARTUP
#!/bin/bash
set -e
if ! command -v psql >/dev/null; then
  apt-get update && apt-get install -y postgresql
fi
CONF=\$(ls -d /etc/postgresql/*/main)
grep -q "^listen_addresses = '\*'" \$CONF/postgresql.conf || echo "listen_addresses = '*'" >> \$CONF/postgresql.conf
grep -q "10.0.0.0/8" \$CONF/pg_hba.conf || echo "host all all 10.0.0.0/8 scram-sha-256" >> \$CONF/pg_hba.conf
systemctl restart postgresql
su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 || \
  su postgres -c "psql -c \"CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}'\""
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
  su postgres -c "createdb -O ${DB_USER} ${DB_NAME}"
echo "EHS_PG_READY"
STARTUP
  # The external IP is only needed for apt-get; it is removed once Postgres is installed.
  gcloud compute instances create "$DB_VM" --zone "$ZONE" --machine-type e2-micro \
    --image-family debian-12 --image-project debian-cloud --boot-disk-size 30GB --boot-disk-type pd-standard \
    --tags ehs-postgres --metadata-from-file startup-script=/tmp/ehs-pg-startup.sh
  rm -f /tmp/ehs-pg-startup.sh
  echo "    waiting for Postgres install..."
  until gcloud compute instances get-serial-port-output "$DB_VM" --zone "$ZONE" 2>/dev/null | grep -q EHS_PG_READY; do sleep 15; done
  gcloud compute instances delete-access-config "$DB_VM" --zone "$ZONE" --access-config-name "external-nat" || true
fi
DB_IP="$(gcloud compute instances describe "$DB_VM" --zone "$ZONE" --format 'value(networkInterfaces[0].networkIP)')"
put_secret ehs-database-url "postgresql+pg8000://${DB_USER}:${DB_PASSWORD}@${DB_IP}:5432/${DB_NAME}"

SECRETS="DATABASE_URL=ehs-database-url:latest,JWT_SECRET_KEY=ehs-jwt-secret:latest"
TG="$(envval TELEGRAM_BOT_TOKEN)"; FT="$(envval FONNTE_TOKEN)"
if [ -n "$TG" ]; then put_secret ehs-telegram-token "$TG"; SECRETS="$SECRETS,TELEGRAM_BOT_TOKEN=ehs-telegram-token:latest"; fi
if [ -n "$FT" ]; then put_secret ehs-fonnte-token "$FT"; SECRETS="$SECRETS,FONNTE_TOKEN=ehs-fonnte-token:latest"; fi
ENV_VARS="GCS_BUCKET_NAME=${BUCKET},UPLOADS_DIR=/tmp/uploads"
if [ "$USE_VERTEX" = "true" ]; then
  ENV_VARS="${ENV_VARS},GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global"
else
  SECRETS="${SECRETS},GEMINI_API_KEY=ehs-gemini-api-key:latest"
fi
for v in TELEGRAM_CHAT_ID WA_TARGET_PHONE; do
  val="$(envval $v)"; [ -n "$val" ] && ENV_VARS="${ENV_VARS},${v}=${val}"
done

echo "==> Deploying API to Cloud Run"
gcloud run deploy "$API_SERVICE" --source "$ROOT/backend" --region "$REGION" --allow-unauthenticated \
  --service-account "$SA_EMAIL" --memory 1Gi --timeout 300 --min-instances 0 --max-instances 3 \
  --network default --subnet default --vpc-egress private-ranges-only \
  --set-secrets "$SECRETS" --set-env-vars "$ENV_VARS"
API_URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" --format 'value(status.url)')"

echo "==> Building and deploying web dashboard"
gcloud artifacts repositories describe ehs --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create ehs --repository-format docker --location "$REGION"
WEB_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/ehs/web:$(date +%Y%m%d-%H%M%S)"
gcloud builds submit "$ROOT/web-dashboard" --region "$REGION" --config "$ROOT/deploy/cloudbuild-web.yaml" \
  --substitutions "_IMAGE=${WEB_IMAGE},_API_URL=${API_URL}/api/v1"
gcloud run deploy "$WEB_SERVICE" --image "$WEB_IMAGE" --region "$REGION" --allow-unauthenticated --port 3000 \
  --min-instances 0 --max-instances 3
WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" --format 'value(status.url)')"

echo "==> Wiring public URLs and CORS"
# Cloud Run serves each service on two hostnames; allow both for the browser.
WEB_URL_ALT="https://${WEB_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
gcloud run services update "$API_SERVICE" --region "$REGION" \
  --update-env-vars "^@^PUBLIC_API_BASE_URL=${API_URL}@CORS_ORIGINS=${WEB_URL},${WEB_URL_ALT}" >/dev/null

cat <<EOF

Deployed.
  Web dashboard : ${WEB_URL}
  API (docs)    : ${API_URL}/docs
  Demo login    : admin@globalmfg.com / admin123
EOF
