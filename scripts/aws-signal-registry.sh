#!/usr/bin/env bash
# Query durable.signal_registry on AWS RDS via a one-shot Fargate task
set -euo pipefail

CLUSTER="longtail"
SUBNETS='["subnet-0ff50eabdaead9c20","subnet-07710fd1155d681f4"]'
SG="sg-08c00d1d745617c68"
EXEC_ROLE="arn:aws:iam::162216049230:role/LongTail-Compute-ApiTaskDefExecutionRoleE6ABB053-O0qsKPiZJTz2"
LOG_GROUP="/ecs/longtail/api"

DB_SECRET=$(aws secretsmanager get-secret-value --secret-id LongTail/AuroraDatabase --query SecretString --output text)
DB_HOST=$(echo "$DB_SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")
DB_PASS=$(echo "$DB_SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
CONN="postgresql://longtail:${DB_PASS}@${DB_HOST}:5432/longtail?sslmode=require"

SQL="SELECT COUNT(*) AS total FROM durable.signal_registry; SELECT * FROM durable.signal_registry ORDER BY expiry DESC;"

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --family longtail-db-query \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 256 --memory 512 \
  --execution-role-arn "$EXEC_ROLE" \
  --container-definitions "[{
    \"name\": \"postgres\",
    \"image\": \"postgres:16-alpine\",
    \"essential\": true,
    \"command\": [\"psql\", \"${CONN}\", \"-c\", \"${SQL}\"],
    \"logConfiguration\": {
      \"logDriver\": \"awslogs\",
      \"options\": {
        \"awslogs-group\": \"${LOG_GROUP}\",
        \"awslogs-region\": \"us-west-1\",
        \"awslogs-stream-prefix\": \"db-query\"
      }
    }
  }]" \
  --query 'taskDefinition.taskDefinitionArn' --output text)

TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --launch-type FARGATE \
  --task-definition "$TASK_DEF_ARN" \
  --network-configuration "{
    \"awsvpcConfiguration\": {
      \"subnets\": ${SUBNETS},
      \"securityGroups\": [\"${SG}\"],
      \"assignPublicIp\": \"DISABLED\"
    }
  }" \
  --query 'tasks[0].taskArn' --output text)

TASK_ID=$(echo "$TASK_ARN" | awk -F/ '{print $NF}')
echo "⏳ Waiting for task ${TASK_ID}..."

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ID" 2>/dev/null || \
  while true; do
    STATUS=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ID" --query 'tasks[0].lastStatus' --output text)
    [ "$STATUS" = "STOPPED" ] && break
    sleep 1
  done

EXIT=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ID" --query 'tasks[0].containers[0].exitCode' --output text)

aws logs get-log-events \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "db-query/postgres/$TASK_ID" \
  --limit 500 \
  --query 'events[].message' \
  --output json | python3 -c "
import sys, json
for m in json.load(sys.stdin): print(m.rstrip())
"

aws ecs deregister-task-definition --task-definition "$TASK_DEF_ARN" --query 'taskDefinition.status' --output text > /dev/null

exit "${EXIT:-1}"
