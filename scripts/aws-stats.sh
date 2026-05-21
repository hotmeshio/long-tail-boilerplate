#!/bin/bash
# AWS CloudWatch stats for Long Tail services (Aurora Serverless v2)
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

# Detect Aurora cluster
CLUSTER_ID=$(aws rds describe-db-clusters --query 'DBClusters[0].DBClusterIdentifier' --output text 2>/dev/null)
WRITER_ID=$(aws rds describe-db-clusters --query 'DBClusters[0].DBClusterMembers[?IsClusterWriter==`true`].DBInstanceIdentifier | [0]' --output text 2>/dev/null)

fmt_pct() {
  awk '{printf "  %-28s %6.1f%%    %6.1f%%\n", $1, $2, $3}'
}

fmt_count() {
  awk '{printf "  %-28s %6.0f      %6.0f\n", $1, $2, $3}'
}

fmt_gb() {
  awk '{printf "  %-28s %6.2f GB\n", $1, $2/1073741824}'
}

fmt_acu() {
  awk '{printf "  %-28s %5.1f      %5.1f\n", $1, $2, $3}'
}

# Side-by-side: takes two metric datasets and prints them aligned
# Usage: side_by_side "LEFT_LABEL" "$LEFT_DATA" "RIGHT_LABEL" "$RIGHT_DATA"
side_by_side() {
  local ll="$1" ld="$2" rl="$3" rd="$4"
  paste <(echo "$ld" | awk '{printf "  %-19s %5.1f%% %5.1f%%", $1, $2, $3}') \
        <(echo "$rd" | awk '{printf "  %5.1f%% %5.1f%%\n", $2, $3}') 2>/dev/null
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Long Tail AWS Stats — last $PERIOD"
echo "═══════════════════════════════════════════════════"

# ── Aurora ──
echo ""
echo "── Aurora Serverless v2 ($CLUSTER_ID) ──"

echo "  ACU Capacity:                    Avg        Max"
AURORA_ACU=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name ServerlessDatabaseCapacity \
  --dimensions Name=DBClusterIdentifier,Value=$CLUSTER_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$AURORA_ACU" | fmt_acu

echo "  CPU (writer):                    Avg        Max"
AURORA_CPU=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=$WRITER_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$AURORA_CPU" | fmt_pct

echo "  Connections:                     Avg        Max"
AURORA_CONN=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=$WRITER_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$AURORA_CONN" | fmt_count

echo "  Freeable Memory (GB):"
AURORA_MEM=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=$WRITER_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average]' \
  --output text 2>&1)
echo "$AURORA_MEM" | fmt_gb

# ── ECS: API ──
echo ""
echo "── API Service ──"
echo "  CPU:                             Avg        Max"
API_CPU=$(aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=api \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$API_CPU" | fmt_pct

echo "  Memory:                          Avg        Max"
API_MEM=$(aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=api \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$API_MEM" | fmt_pct

# ── ECS: Worker ──
echo ""
echo "── Worker Service ──"
echo "  CPU:                             Avg        Max"
WRK_CPU=$(aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name CPUUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=worker \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$WRK_CPU" | fmt_pct

echo "  Memory:                          Avg        Max"
WRK_MEM=$(aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization \
  --dimensions Name=ClusterName,Value=longtail Name=ServiceName,Value=worker \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$WRK_MEM" | fmt_pct

# ── Service Status ──
echo ""
echo "── Service Status ──"
SVC_STATUS=$(aws ecs describe-services --cluster longtail --services api worker \
  --query 'services[*].[serviceName,desiredCount,runningCount]' \
  --output text 2>&1)
echo "$SVC_STATUS" | awk '{printf "  %-12s desired: %s  running: %s\n", $1, $2, $3}'

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://longtail.hotmesh.io/health)

# ── Summary ──
AURORA_ACU_AVG=$(echo "$AURORA_ACU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
AURORA_ACU_MAX=$(echo "$AURORA_ACU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
AURORA_CPU_AVG=$(echo "$AURORA_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
AURORA_CPU_MAX=$(echo "$AURORA_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
AURORA_CONN_MAX=$(echo "$AURORA_CONN" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
AURORA_MEM_LAST=$(echo "$AURORA_MEM" | awk '{v=$2} END {printf "%.2f", v/1073741824}')
API_CPU_AVG=$(echo "$API_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
API_CPU_MAX=$(echo "$API_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
API_MEM_AVG=$(echo "$API_MEM" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
API_MEM_MAX=$(echo "$API_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
WRK_CPU_AVG=$(echo "$WRK_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
WRK_CPU_MAX=$(echo "$WRK_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
WRK_MEM_AVG=$(echo "$WRK_MEM" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
WRK_MEM_MAX=$(echo "$WRK_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')

SVC_OK=$(echo "$SVC_STATUS" | awk '{if($2==$3) ok++; n++} END {print (ok==n) ? "yes" : "no"}')

# Health grade (Aurora-aware)
grade_health() {
  local grade="A"
  local notes=""

  if [ "$HEALTH" != "200" ]; then
    grade="C"; notes="${notes} health-endpoint-down"
  fi
  if [ "$SVC_OK" != "yes" ]; then
    grade="C"; notes="${notes} service-count-mismatch"
  fi

  # ACU at ceiling = scaling limit
  local acu_max_int=$(echo "$AURORA_ACU_MAX" | awk '{printf "%.0f", $1}')
  local acu_limit=$(aws rds describe-db-clusters --query 'DBClusters[0].ServerlessV2ScalingConfiguration.MaxCapacity' --output text 2>/dev/null)
  if [ "$acu_max_int" -ge "$acu_limit" ] 2>/dev/null; then
    grade="C"; notes="${notes} acu-at-ceiling(${AURORA_ACU_MAX}/${acu_limit})"
  fi

  # Peak ECS CPU
  local peak_cpu=$(echo -e "$API_CPU\n$WRK_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
  if [ "$peak_cpu" -gt 85 ] 2>/dev/null; then
    grade="C"; notes="${notes} ecs-cpu-peak-${peak_cpu}%"
  elif [ "$peak_cpu" -gt 70 ] 2>/dev/null; then
    [ "$grade" = "A" ] && grade="B"; notes="${notes} ecs-cpu-peak-${peak_cpu}%"
  fi

  # Peak ECS memory
  local peak_mem=$(echo -e "$API_MEM\n$WRK_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
  if [ "$peak_mem" -gt 85 ] 2>/dev/null; then
    grade="C"; notes="${notes} ecs-mem-peak-${peak_mem}%"
  elif [ "$peak_mem" -gt 70 ] 2>/dev/null; then
    [ "$grade" = "A" ] && grade="B"; notes="${notes} ecs-mem-peak-${peak_mem}%"
  fi

  if [ -z "$notes" ]; then
    notes=" all clear"
  fi

  echo "${grade}:${notes}"
}

GRADE_RESULT=$(grade_health)
GRADE="${GRADE_RESULT%%:*}"
GRADE_NOTES="${GRADE_RESULT#*:}"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Summary — last $PERIOD"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Health:  $GRADE $GRADE_NOTES"
echo "  Window:  $PERIOD ($START → $END)"
echo ""
echo "  ┌─────────────────┬─────────────┬─────────────┐"
echo "  │                 │   Avg       │   Peak      │"
echo "  ├─────────────────┼─────────────┼─────────────┤"
printf "  │ Aurora ACU      │  %5s      │  %5s      │\n" "$AURORA_ACU_AVG" "$AURORA_ACU_MAX"
printf "  │ Aurora CPU      │  %5s%%     │  %5s%%     │\n" "$AURORA_CPU_AVG" "$AURORA_CPU_MAX"
printf "  │ API CPU         │  %5s%%     │  %5s%%     │\n" "$API_CPU_AVG" "$API_CPU_MAX"
printf "  │ API Memory      │  %5s%%     │  %5s%%     │\n" "$API_MEM_AVG" "$API_MEM_MAX"
printf "  │ Worker CPU      │  %5s%%     │  %5s%%     │\n" "$WRK_CPU_AVG" "$WRK_CPU_MAX"
printf "  │ Worker Memory   │  %5s%%     │  %5s%%     │\n" "$WRK_MEM_AVG" "$WRK_MEM_MAX"
echo "  └─────────────────┴─────────────┴─────────────┘"
echo ""
printf "  Aurora Connections (peak): %s\n" "$AURORA_CONN_MAX"
printf "  Aurora Freeable Memory:    %s GB\n" "$AURORA_MEM_LAST"
printf "  Services:                  %s\n" "$([ "$SVC_OK" = "yes" ] && echo "all running" || echo "MISMATCH")"
printf "  Health endpoint:           %s\n" "$([ "$HEALTH" = "200" ] && echo "OK" || echo "DOWN ($HEALTH)")"
echo ""
