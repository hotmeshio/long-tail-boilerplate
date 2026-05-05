#!/bin/bash
# AWS CloudWatch stats for Long Tail services
# Usage: ./scripts/aws-stats.sh [5m|15m|30m|1h|1d]

PERIOD="${1:-5m}"

case "$PERIOD" in
  5m)  MINS=5;   INTERVAL=60  ;;
  15m) MINS=15;  INTERVAL=60  ;;
  30m) MINS=30;  INTERVAL=300 ;;
  1h)  MINS=60;  INTERVAL=300 ;;
  1d)  MINS=1440; INTERVAL=3600 ;;
  *)   echo "Usage: $0 [5m|15m|30m|1h|1d]"; exit 1 ;;
esac

START=$(date -u -v-${MINS}M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "${MINS} minutes ago" +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DB_ID=$(aws rds describe-db-instances --query 'DBInstances[0].DBInstanceIdentifier' --output text 2>/dev/null)

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Long Tail AWS Stats — last $PERIOD"
echo "═══════════════════════════════════════════════════"

echo ""
echo "── RDS PostgreSQL ($DB_ID) ──"
echo "  CPU:"
aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo "  Connections:"
aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo "  Freeable Memory (GB):"
aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,`Average / 1073741824`]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo ""
echo "── API Service ──"
echo "  CPU:"
aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=api \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo "  Memory:"
aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=api \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo ""
echo "── Worker Service ──"
echo "  CPU:"
aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=worker \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo "  Memory:"
aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=worker \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output table 2>&1 | grep -v "^-*$\|GetMetric\|^$"

echo ""
echo "── Service Status ──"
aws ecs describe-services --cluster longtail --services api worker \
  --query 'services[*].{Service:serviceName,Desired:desiredCount,Running:runningCount}' \
  --output table 2>&1

echo ""
curl -s https://longtail.hotmesh.io/health
echo ""
