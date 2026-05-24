#!/usr/bin/env bash
#
# Wipe the Aurora PostgreSQL database via a one-off Fargate task,
# then restart api + worker services so they reseed on startup.
#
# Drops ALL schemas (hmsh, durable, longtail) and ALL tables in public
# (hmsh_*, lt_*) so the app starts completely fresh — migrations,
# triggers, and seed data all recreated from scratch.
#
# Usage:
#   ./scripts/aws-wipe-db.sh
#   npm run aws:wipe-db
#

set -euo pipefail

REGION="us-west-1"
CLUSTER="longtail"
API_SERVICE="api"
WORKER_SERVICE="worker"

echo "==> Fetching Aurora credentials from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id LongTail/AuroraDatabase \
  --region "$REGION" \
  --query 'SecretString' \
  --output text)

DB_HOST=$(echo "$SECRET_JSON" | jq -r '.host')
DB_USER=$(echo "$SECRET_JSON" | jq -r '.username')
DB_PASS=$(echo "$SECRET_JSON" | jq -r '.password')
DB_NAME=$(echo "$SECRET_JSON" | jq -r '.dbname')

echo "==> Fetching network config from api service..."
NETWORK_JSON=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$API_SERVICE" \
  --region "$REGION" \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' \
  --output json)

SUBNETS=$(echo "$NETWORK_JSON" | jq -r '.subnets | join(",")')
SECURITY_GROUPS=$(echo "$NETWORK_JSON" | jq -r '.securityGroups | join(",")')

echo "==> Fetching latest api task definition..."
TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$API_SERVICE" \
  --region "$REGION" \
  --query 'services[0].taskDefinition' \
  --output text)

echo "    Task def: $TASK_DEF"
echo "    Host:     $DB_HOST"
echo "    Database: $DB_NAME"
echo "    Subnets:  $SUBNETS"
echo "    SGs:      $SECURITY_GROUPS"

# The wipe command: drop all non-system schemas and all public tables.
# This gives the app a completely clean database on restart.
read -r -d '' WIPE_CMD << 'NODESCRIPT' || true
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.PG_HOST,
  port: 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASS,
  database: process.env.PG_DB,
  ssl: { rejectUnauthorized: false }
});
(async () => {
  console.log('[wipe] Connecting to', process.env.PG_HOST);

  // 1. Drop non-system schemas (CASCADE drops all contained objects)
  const schemas = await pool.query(
    "SELECT schema_name FROM information_schema.schemata " +
    "WHERE schema_name NOT IN ('public','information_schema','pg_catalog','pg_toast') " +
    "AND schema_name NOT LIKE 'pg_%'"
  );
  for (const { schema_name } of schemas.rows) {
    await pool.query('DROP SCHEMA ' + schema_name + ' CASCADE');
    console.log('[wipe] Dropped schema:', schema_name);
  }

  // 2. Drop all tables in public schema
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  if (tables.rows.length > 0) {
    const names = tables.rows.map(r => r.tablename).join(', ');
    console.log('[wipe] Dropping public tables:', names);
    await pool.query('DROP TABLE IF EXISTS ' + names + ' CASCADE');
    console.log('[wipe] Dropped all public tables');
  } else {
    console.log('[wipe] No tables in public schema');
  }

  // 3. Drop any remaining sequences, functions, types in public
  const seqs = await pool.query(
    "SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'"
  );
  for (const { sequence_name } of seqs.rows) {
    await pool.query('DROP SEQUENCE IF EXISTS ' + sequence_name + ' CASCADE');
    console.log('[wipe] Dropped sequence:', sequence_name);
  }

  // 4. Verify clean state
  const remaining = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
  );
  const remainingSchemas = await pool.query(
    "SELECT schema_name FROM information_schema.schemata " +
    "WHERE schema_name NOT IN ('public','information_schema','pg_catalog','pg_toast') " +
    "AND schema_name NOT LIKE 'pg_%'"
  );
  console.log('[wipe] Remaining public tables:', remaining.rows.length);
  console.log('[wipe] Remaining custom schemas:', remainingSchemas.rows.length);
  console.log('[wipe] Database wiped clean.');

  await pool.end();
  process.exit(0);
})().catch(e => { console.error('[wipe] FAILED:', e.message); process.exit(1); });
NODESCRIPT

echo ""
echo "==> Running one-off Fargate task to wipe database..."
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUPS],assignPublicIp=DISABLED}" \
  --overrides "{
    \"containerOverrides\": [{
      \"name\": \"api\",
      \"command\": [\"node\", \"-e\", $(echo "$WIPE_CMD" | jq -Rs .)],
      \"environment\": [
        {\"name\": \"PG_HOST\", \"value\": \"$DB_HOST\"},
        {\"name\": \"PG_USER\", \"value\": \"$DB_USER\"},
        {\"name\": \"PG_PASS\", \"value\": \"$DB_PASS\"},
        {\"name\": \"PG_DB\", \"value\": \"$DB_NAME\"}
      ]
    }]
  }" \
  --region "$REGION" \
  --query 'tasks[0].taskArn' \
  --output text)

echo "    Task ARN: $TASK_ARN"
TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')

echo "==> Waiting for wipe task to complete..."
aws ecs wait tasks-stopped \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION"

# Check exit code
EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query 'tasks[0].containers[?name==`api`].exitCode' \
  --output text)

echo "    Exit code: $EXIT_CODE"

# Show logs from the wipe task
echo "==> Wipe task logs:"
sleep 5
aws logs get-log-events \
  --log-group-name /ecs/longtail/api \
  --log-stream-name "ecs/api/$TASK_ID" \
  --region "$REGION" \
  --query 'events[*].message' \
  --output text 2>/dev/null || echo "    (logs not yet available)"

if [ "$EXIT_CODE" != "0" ]; then
  echo "ERROR: Wipe task failed with exit code $EXIT_CODE"
  exit 1
fi

echo ""
echo "==> Restarting api service (force new deployment)..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$API_SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --query 'service.{name:serviceName,desired:desiredCount}' \
  --output table

echo "==> Restarting worker service (force new deployment)..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$WORKER_SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --query 'service.{name:serviceName,desired:desiredCount}' \
  --output table

echo ""
echo "==> Done. Services restarting — they will reseed on startup."
echo "    Monitor: npm run aws:logs:api"
echo "    Status:  npm run aws:services"
