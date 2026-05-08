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
ALLOC_GB=$(aws rds describe-db-instances --query 'DBInstances[0].AllocatedStorage' --output text 2>/dev/null)

# Formats avg/max percent columns (CPU%, Memory%)
fmt_pct() {
  awk '{printf "  %-28s %6.1f%%    %6.1f%%\n", $1, $2, $3}'
}

# Formats avg/max count columns (connections)
fmt_count() {
  awk '{printf "  %-28s %6.0f      %6.0f\n", $1, $2, $3}'
}

# Formats single-value byte-to-GB columns
fmt_gb() {
  awk '{printf "  %-28s %6.2f GB\n", $1, $2/1073741824}'
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Long Tail AWS Stats — last $PERIOD"
echo "═══════════════════════════════════════════════════"

echo ""
echo "── RDS PostgreSQL ($DB_ID) ──"
echo "  CPU:                             Avg        Max"
RDS_CPU=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$RDS_CPU" | fmt_pct

echo "  Connections:                     Avg        Max"
RDS_CONN=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average Maximum \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average,Maximum]' \
  --output text 2>&1)
echo "$RDS_CONN" | fmt_count

echo "  Freeable Memory (GB):"
RDS_MEM=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average]' \
  --output text 2>&1)
echo "$RDS_MEM" | fmt_gb

echo "  Free Storage Space (GB):"
RDS_DISK=$(aws cloudwatch get-metric-statistics --namespace AWS/RDS --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value=$DB_ID \
  --start-time $START --end-time $END --period $INTERVAL \
  --statistics Average \
  --query 'Datapoints | sort_by(@, &Timestamp) | [].[Timestamp,Average]' \
  --output text 2>&1)
echo "$RDS_DISK" | fmt_gb

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

echo ""
echo "── Service Status ──"
SVC_STATUS=$(aws ecs describe-services --cluster longtail --services api worker \
  --query 'services[*].[serviceName,desiredCount,runningCount]' \
  --output text 2>&1)
echo "$SVC_STATUS" | awk '{printf "  %-12s desired: %s  running: %s\n", $1, $2, $3}'

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://longtail.hotmesh.io/health)

# ── Summary ──
# Compute rollups from captured data
RDS_CPU_AVG=$(echo "$RDS_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
RDS_CPU_MAX=$(echo "$RDS_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
RDS_CONN_MAX=$(echo "$RDS_CONN" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
RDS_MEM_LAST=$(echo "$RDS_MEM" | awk '{v=$2} END {printf "%.2f", v/1073741824}')
RDS_DISK_LAST=$(echo "$RDS_DISK" | awk '{v=$2} END {printf "%.2f", v/1073741824}')
API_CPU_AVG=$(echo "$API_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
API_CPU_MAX=$(echo "$API_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
API_MEM_AVG=$(echo "$API_MEM" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
API_MEM_MAX=$(echo "$API_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
WRK_CPU_AVG=$(echo "$WRK_CPU" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
WRK_CPU_MAX=$(echo "$WRK_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')
WRK_MEM_AVG=$(echo "$WRK_MEM" | awk '{s+=$2; n++} END {if(n>0) printf "%.1f", s/n; else print "—"}')
WRK_MEM_MAX=$(echo "$WRK_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.1f", m}')

# Tasks running vs desired
SVC_OK=$(echo "$SVC_STATUS" | awk '{if($2==$3) ok++; n++} END {print (ok==n) ? "yes" : "no"}')

# Disk usage percentage
DISK_PCT=$(echo "$RDS_DISK" | awk -v alloc="$ALLOC_GB" '{v=$2} END {if(alloc>0) printf "%.0f", ((alloc - v/1073741824) / alloc) * 100; else print "—"}')

# Health grade
#   A = all green: health 200, all services running, peak CPU <70, disk used <80%
#   B = minor concern: peak CPU 70-85 or disk 80-90%
#   C = needs attention: peak CPU >85 or disk >90% or service mismatch or health down
grade_health() {
  local grade="A"
  local notes=""

  if [ "$HEALTH" != "200" ]; then
    grade="C"; notes="${notes} health-endpoint-down"
  fi
  if [ "$SVC_OK" != "yes" ]; then
    grade="C"; notes="${notes} service-count-mismatch"
  fi

  # Peak CPU across all services
  local peak_cpu=$(echo -e "$RDS_CPU\n$API_CPU\n$WRK_CPU" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
  if [ "$peak_cpu" -gt 85 ] 2>/dev/null; then
    grade="C"; notes="${notes} cpu-peak-${peak_cpu}%"
  elif [ "$peak_cpu" -gt 70 ] 2>/dev/null; then
    [ "$grade" = "A" ] && grade="B"; notes="${notes} cpu-peak-${peak_cpu}%"
  fi

  # Disk usage
  if [ "$DISK_PCT" != "—" ] 2>/dev/null; then
    if [ "$DISK_PCT" -gt 90 ] 2>/dev/null; then
      grade="C"; notes="${notes} disk-${DISK_PCT}%-used"
    elif [ "$DISK_PCT" -gt 80 ] 2>/dev/null; then
      [ "$grade" = "A" ] && grade="B"; notes="${notes} disk-${DISK_PCT}%-used"
    fi
  fi

  # Peak memory across ECS services
  local peak_mem=$(echo -e "$API_MEM\n$WRK_MEM" | awk 'BEGIN{m=0} {if($3>m) m=$3} END {printf "%.0f", m}')
  if [ "$peak_mem" -gt 85 ] 2>/dev/null; then
    grade="C"; notes="${notes} mem-peak-${peak_mem}%"
  elif [ "$peak_mem" -gt 70 ] 2>/dev/null; then
    [ "$grade" = "A" ] && grade="B"; notes="${notes} mem-peak-${peak_mem}%"
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
printf "  │ RDS CPU         │  %6s%%     │  %6s%%     │\n" "$RDS_CPU_AVG" "$RDS_CPU_MAX"
printf "  │ API CPU         │  %6s%%     │  %6s%%     │\n" "$API_CPU_AVG" "$API_CPU_MAX"
printf "  │ API Memory      │  %6s%%     │  %6s%%     │\n" "$API_MEM_AVG" "$API_MEM_MAX"
printf "  │ Worker CPU      │  %6s%%     │  %6s%%     │\n" "$WRK_CPU_AVG" "$WRK_CPU_MAX"
printf "  │ Worker Memory   │  %6s%%     │  %6s%%     │\n" "$WRK_MEM_AVG" "$WRK_MEM_MAX"
echo "  └─────────────────┴─────────────┴─────────────┘"
echo ""
printf "  RDS Connections (peak): %s\n" "$RDS_CONN_MAX"
printf "  RDS Freeable Memory:    %s GB\n" "$RDS_MEM_LAST"
printf "  RDS Free Storage:       %s / %s GB (%s%% used)\n" "$RDS_DISK_LAST" "$ALLOC_GB" "$DISK_PCT"
printf "  Services:               %s\n" "$([ "$SVC_OK" = "yes" ] && echo "all running" || echo "MISMATCH")"
printf "  Health endpoint:        %s\n" "$([ "$HEALTH" = "200" ] && echo "OK" || echo "DOWN ($HEALTH)")"
echo ""
