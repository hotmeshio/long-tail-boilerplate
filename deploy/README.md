# Long Tail — Deployment Guide

Long Tail is a durable workflow execution platform powered by PostgreSQL. The same codebase runs locally via Docker Compose or in production on AWS via CDK. This guide covers both environments end-to-end.

## Table of Contents

- [Architecture](#architecture)
  - [Two Services, One Image](#two-services-one-image)
  - [Postgres Is the Backbone](#postgres-is-the-backbone)
  - [File Storage (S3 / MinIO)](#file-storage-s3--minio)
  - [Environment Parity](#environment-parity)
- [Local Development](#local-development)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
  - [Services](#services)
  - [Environment Variables](#environment-variables)
  - [Connecting a SQL Client](#connecting-a-sql-client)
  - [MinIO Console](#minio-console)
  - [Running Tests](#running-tests)
  - [Full Reset](#full-reset)
- [AWS Deployment](#aws-deployment)
  - [What Gets Created](#what-gets-created)
  - [Network Layout](#network-layout)
  - [Security Groups](#security-groups)
  - [Secrets Manager](#secrets-manager)
  - [Prerequisites](#aws-prerequisites)
  - [Step-by-Step First Deploy](#step-by-step-first-deploy)
  - [Verify Everything Works](#verify-everything-works)
  - [Connecting a SQL Client to RDS](#connecting-a-sql-client-to-rds)
- [Day-to-Day Operations](#day-to-day-operations)
  - [Deploying Code Changes](#deploying-code-changes)
  - [Updating Secrets](#updating-secrets)
  - [Checking Logs](#checking-logs)
  - [Checking Service Health](#checking-service-health)
  - [Restarting Services](#restarting-services)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Infrastructure Details](#infrastructure-details)
  - [RDS Configuration](#rds-configuration)
  - [S3 Bucket Configuration](#s3-bucket-configuration)
  - [Fargate Task Sizing](#fargate-task-sizing)
  - [Future Flips](#future-flips)
  - [Tearing Down](#tearing-down)

---

## Architecture

### Two Services, One Image

The same Docker image runs in two modes, controlled by the `APP_ROLE` environment variable:

| Service | `APP_ROLE` | Role | Network |
|---------|-----------|------|---------|
| **API** | `api` | Express dashboard, REST API, readonly workflow observers | Behind ALB on port 3030 |
| **Worker** | `worker` | Workflow execution, durable activities, leader election via LISTEN/NOTIFY | No inbound traffic |
| **NATS** | *(n/a)* | Event bus for cross-container event delivery (replaces Socket.IO for multi-container) | Internal port 4222, WebSocket 9222 via ALB |

Local development runs both roles in a single container with `APP_ROLE` unset (standalone mode). On AWS, they are separate Fargate services with independent scaling and lifecycle.

### Why NATS (Not Socket.IO)

Socket.IO works in single-container mode because all events are emitted and consumed in the same process. In a multi-container deployment (separate API and worker services), Socket.IO cannot deliver events across containers — the worker emits events that the API container (serving the dashboard) never sees.

NATS solves this: workers publish events to NATS, and the dashboard connects directly to NATS via WebSocket. One event bus, one subscription, no intermediary. The browser authenticates to NATS using a token obtained from an authenticated API endpoint (`GET /api/nats-credentials`), so unauthenticated users cannot subscribe to events.

The worker uses a 120-second stop timeout. When ECS sends SIGTERM during a rolling deploy, in-flight durable activities complete and leader advisory locks release gracefully before the container exits.

### Postgres Is the Backbone

PostgreSQL serves as:

- **Durable execution engine** — workflow state, checkpoints, replay
- **Job queue** — LISTEN/NOTIFY for real-time work distribution
- **Tool registry** — MCP server and tool definitions
- **Audit log** — execution traces, escalation history
- **IAM store** — users, roles, permissions

There is no Redis, no SQS, no separate orchestrator. Both services connect directly to Postgres — no connection pooler. LISTEN/NOTIFY requires persistent connections; transaction-mode pooling (like RDS Proxy) would break NOTIFY delivery.

Workers elect a leader every 60 seconds. The leader polls on behalf of the group and fans work out via NOTIFY.

### File Storage (S3 / MinIO)

Both services read and write files to S3-compatible storage. The app uses the same `LT_S3_*` environment variables in all environments:

| Variable | Local (Docker Compose) | AWS |
|----------|----------------------|-----|
| `LT_STORAGE_BACKEND` | `s3` | `s3` |
| `LT_S3_BUCKET` | `long-tail-files` | `longtail-files-{account}-{region}` |
| `LT_S3_ENDPOINT` | `http://minio:9000` | *(omitted — uses default S3 endpoint)* |
| `LT_S3_REGION` | `us-east-1` | `us-west-1` |
| `LT_S3_ACCESS_KEY` | `minioadmin` | *(omitted — IAM task role)* |
| `LT_S3_SECRET_KEY` | `minioadmin` | *(omitted — IAM task role)* |
| `LT_S3_FORCE_PATH_STYLE` | `true` | *(omitted — defaults to false)* |

On AWS, the Fargate task role has `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` permissions on the bucket. No access keys needed.

### Environment Parity

The same code runs in both environments. Only env vars change:

| Concern | Local | AWS |
|---------|-------|-----|
| Postgres | Container on port 5416 | RDS in isolated subnets |
| File storage | MinIO container on port 9002 | S3 bucket |
| Event bus | NATS container on port 4222/9222 | NATS Fargate service via Cloud Map + ALB |
| SSL | Not required | `PGSSLMODE=no-verify`, TLS at ALB for NATS WS |
| Secrets | `.env` file / docker-compose env | Secrets Manager → ECS task definition |
| App role | Standalone (unset) | `APP_ROLE=api` or `APP_ROLE=worker` |

---

## Local Development

### Prerequisites

- Docker and Docker Compose
- Node 22+
- A `.env` file (copy from `.env.example`)

### Quick Start

```bash
cp .env.example .env
docker compose up -d --build
```

The app starts on `http://localhost:3030`. Postgres runs on port 5416. MinIO runs on port 9002.

### Services

Docker Compose runs four containers:

| Container | Image | Ports | Purpose |
|-----------|-------|-------|---------|
| `app` | Built from `Dockerfile` (dev stage) | 3030 | API + workers (standalone mode) |
| `postgres` | `postgres:16` | 5416 | Database |
| `nats` | `nats:2-alpine` | 4222 (client), 9222 (WebSocket) | Event bus for real-time dashboard updates |
| `minio` | `minio/minio` | 9002 (API), 9003 (console) | S3-compatible file storage |

The `app` container mounts `src/`, `scripts/`, and `tests/` as volumes. Code changes hot-reload via `ts-node-dev`.

### Environment Variables

The `.env` file drives all configuration. Key variables:

```bash
# Database
POSTGRES_HOST=localhost          # Use 'postgres' when running inside the container
POSTGRES_PORT=5416               # Mapped from container's 5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=myapp

# Server
PORT=3030
JWT_SECRET=change-me-in-production

# File storage (MinIO)
LT_STORAGE_BACKEND=s3
LT_S3_BUCKET=long-tail-files
LT_S3_ENDPOINT=http://localhost:9002
LT_S3_REGION=us-east-1
LT_S3_ACCESS_KEY=minioadmin
LT_S3_SECRET_KEY=minioadmin
LT_S3_FORCE_PATH_STYLE=true

# NATS event bus
NATS_URL=nats://nats:4222         # Internal NATS connection
NATS_TOKEN=dev_api_secret         # Auth token (Secrets Manager in production)
NATS_WS_URL=ws://localhost:9222   # Browser WebSocket URL

# LLM (required for workflow builder)
ANTHROPIC_API_KEY=sk-ant-...

# OAuth (optional)
# OAUTH_ENCRYPTION_KEY=...
# OAUTH_GOOGLE_CLIENT_ID=...
# OAUTH_GOOGLE_CLIENT_SECRET=...
```

### Connecting a SQL Client

Connect Beekeeper Studio (or any Postgres client) to the local database:

| Field | Value |
|-------|-------|
| Host | `localhost` |
| Port | `5416` |
| User | `postgres` |
| Password | `password` |
| Database | `myapp` |
| SSL | Off |

Key tables to explore:

| Table | What it stores |
|-------|---------------|
| `lt_users` | User accounts (superadmin, admin, etc.) |
| `lt_roles` | Role definitions |
| `lt_user_roles` | Role assignments |
| `lt_config_role_escalations` | Escalation chains |

The `hmsh_*` tables are managed by HotMesh (the durable execution engine). They store workflow state, streams, and job metadata.

### MinIO Console

Access the MinIO web console at `http://localhost:9003`:

| Field | Value |
|-------|-------|
| Username | `minioadmin` |
| Password | `minioadmin` |

Browse uploaded files, create buckets, and inspect storage.

### Running Tests

```bash
npm test                       # Unit tests (fast, mocked)
npm run test:integration       # Integration tests (requires docker compose up)
```

### Full Reset

```bash
docker compose down -v         # Stop containers and delete volumes
docker compose up -d --build   # Rebuild and start fresh
npm run seed                   # Re-seed users and roles (run inside container)
```

The `-v` flag deletes the Postgres and MinIO data volumes. Everything starts from scratch.

---

## AWS Deployment

### What Gets Created

The CDK code in `deploy/cdk/` creates four CloudFormation stacks:

| Stack | Resources | Deploy time |
|-------|-----------|-------------|
| **LongTail-Network** | VPC, 6 subnets (2 public, 2 private, 2 isolated), 1 NAT gateway, 4 security groups | ~5 min |
| **LongTail-Data** | RDS PostgreSQL 16, S3 bucket, 8 Secrets Manager entries (including NATS token) | ~15 min |
| **LongTail-Dns** | ACM certificate for `longtail.hotmesh.io` (DNS-validated via existing `hotmesh.io` hosted zone in Route 53) | ~3 min |
| **LongTail-Compute** | ECS Fargate cluster, API service, worker service, NATS service, ALB (ports 443 + 9222), Route 53 A record | ~10 min |

A fifth stack, **LongTail-GithubOidc**, creates an IAM role for GitHub Actions. It's deployed separately, once.

All resources are tagged with `Project: long-tail` and `Environment: production`.

### Network Layout

```
                    Internet
                       │
                   ┌───┴───┐
                   │  ALB  │  (public subnets, ports 80/443/9222)
                   └───┬───┘
                       │
         ┌─────────────┼────────────┐
         │ :3030       │ :9222      │
    ┌────┴────┐   ┌────┴────┐  ┌────┴─────┐
    │   API   │   │  NATS   │  │  Worker  │   (private subnets, NAT egress)
    │ Fargate │   │ Fargate │  │ Fargate  │
    └────┬────┘   └────┬────┘  └────┬─────┘
         │  :4222      │  :4222     │
         └─────────────┤────────────┘
                       │
              ┌────────┴────────┐
              │   port 5432     │
         ┌────┴────┐
         │   RDS   │              (isolated subnets, no internet)
         │ Postgres│
         └─────────┘
```

- **NATS** — Internal event bus in private subnets. API and worker connect on port 4222. Browser dashboard connects via ALB on port 9222 (TLS terminated at ALB, plaintext internally).

- **Public subnets** — ALB only. Receives internet traffic on 80 (redirects to 443), 443 (HTTPS with ACM cert), and 9222 (NATS WebSocket, TLS terminated at ALB).
- **Private subnets** — Fargate tasks. Outbound internet via NAT gateway (for ECR image pulls, S3, external APIs). No inbound except from ALB.
- **Isolated subnets** — RDS only. No internet access at all. Only reachable from the private subnets.

One NAT gateway (cost-optimized for a single-environment setup).

### Security Groups

| Security Group | Inbound Rules | Attached To |
|---------------|---------------|-------------|
| ALB | TCP 80, 443, 9222 from `0.0.0.0/0` | Application Load Balancer |
| API tasks | TCP 3030 from ALB SG | API Fargate tasks |
| Worker tasks | *(none)* | Worker Fargate tasks |
| NATS | TCP 4222 from API SG + Worker SG, TCP 9222 from ALB SG, TCP 8222 from ALB SG (health) | NATS Fargate task |
| RDS | TCP 5432 from API SG, TCP 5432 from Worker SG | RDS instance |

Workers have no inbound rules — they initiate all connections outbound (to Postgres, S3, external APIs).

### Secrets Manager

CDK creates eight secrets. Some are auto-generated, some need manual setup:

| Secret Name | Created By | Action Required |
|-------------|-----------|-----------------|
| `LongTail/Database` | CDK (auto-generated RDS credentials) | None — used automatically |
| `LongTail/JwtSigningKey` | CDK (auto-generated, 64 chars) | None — used automatically |
| `LongTail/SeedAdminPassword` | CDK (auto-generated, 32 chars) | None — used for first-boot superadmin |
| `LongTail/NatsToken` | CDK (auto-generated, 48 chars) | None — shared by NATS server, API, and worker |
| `LongTail/AnthropicApiKey` | CDK (placeholder) | **Replace with your real key** |
| `LongTail/OpenaiApiKey` | CDK (placeholder) | **Replace with your real key** |
| `LongTail/OAuthProviders` | CDK (empty `{}`) | Optional — add OAuth provider credentials |
| `LongTail/ApiKeys` | CDK (empty `{}`) | Optional |

Secrets are injected into containers via ECS task definition `secrets:` blocks. ECS resolves them at container start time, not continuously. After changing a secret value, restart the services.

### AWS Prerequisites

- **AWS CLI v2** configured with admin credentials (`aws sts get-caller-identity` should work)
- **Node 22+**
- **Docker** running (CDK builds the container image locally)
- **Route 53** hosted zone for your domain already exists (the CDK looks up `hotmesh.io`)
- **CDK bootstrapped** for your account and region:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION
```

### Step-by-Step First Deploy

```bash
cd deploy/cdk
npm ci
npm run build
```

#### 1. Synthesize (verify before touching AWS)

```bash
npx cdk synth --all
```

Generates CloudFormation templates in `cdk.out/`. Review if you want. The only AWS call is a Route 53 hosted zone lookup.

#### 2. Deploy Network

```bash
npx cdk deploy LongTail-Network --require-approval never
```

**Verify:** AWS Console → VPC → Your VPCs. New VPC with 6 subnets across 2 AZs, 1 NAT gateway.

#### 3. Deploy Data

```bash
npx cdk deploy LongTail-Data --require-approval never
```

**Verify:**
- RDS → Databases: PostgreSQL 16 instance, status "Available"
- S3 → Buckets: `longtail-files-ACCOUNT-REGION`
- Secrets Manager: all seven secrets listed above

#### 4. Set your LLM API keys

Do this **before** deploying Compute so the first boot has working keys.

```bash
aws secretsmanager put-secret-value \
  --secret-id LongTail/AnthropicApiKey \
  --secret-string "sk-ant-your-key-here"

aws secretsmanager put-secret-value \
  --secret-id LongTail/OpenaiApiKey \
  --secret-string "sk-your-key-here"
```

**Verify** (don't skip — a failed put silently leaves `placeholder` and workflows will fail with 401):

```bash
aws secretsmanager get-secret-value --secret-id LongTail/AnthropicApiKey \
  --query SecretString --output text | head -c 20
# Expected: sk-ant-...  (NOT "placeholder")

aws secretsmanager get-secret-value --secret-id LongTail/OpenaiApiKey \
  --query SecretString --output text | head -c 20
# Expected: sk-proj-...  (NOT "placeholder")
```

#### 5. Deploy DNS

```bash
npx cdk deploy LongTail-Dns --require-approval never
```

**Verify:** ACM → Certificates: `longtail.hotmesh.io` with status "Issued".

#### 6. Deploy Compute

```bash
npx cdk deploy LongTail-Compute --require-approval never
```

This step builds the Docker image for `linux/amd64` (cross-compiles if you're on an ARM Mac), pushes it to ECR, and creates the ECS cluster, both Fargate services, the ALB, and the Route 53 A record.

**Verify:**
- ECS → Clusters → `longtail`: three services (`api`, `worker`, `nats`), each with 1 running task
- EC2 → Load Balancers: internet-facing ALB with HTTPS on 443
- `https://longtail.hotmesh.io/health` returns `{"status":"ok"}`

### Verify Everything Works

```bash
# Health check
curl -s https://longtail.hotmesh.io/health

# Service status
aws ecs describe-services --cluster longtail --services api worker \
  --query 'services[*].{name:serviceName,running:runningCount}' --output table

# Retrieve your superadmin password
aws secretsmanager get-secret-value --secret-id LongTail/SeedAdminPassword \
  --query SecretString --output text
```

Log in at `https://longtail.hotmesh.io/login` with username `superadmin` and the password from the command above. The superadmin account is created automatically on first boot.

### Connecting a SQL Client to RDS

RDS is in isolated subnets with no public access. To connect from your laptop (e.g., Beekeeper Studio), use SSM Session Manager port forwarding through a Fargate task.

**Quick method — use the ECS Exec feature:**

First, enable ECS Exec on the API service (one-time):

```bash
aws ecs update-service --cluster longtail --service api --enable-execute-command
aws ecs update-service --cluster longtail --service api --force-new-deployment
```

Wait for the new task to start, then get the task ID and start a port-forwarding session:

```bash
# Get the API task ID
TASK_ID=$(aws ecs list-tasks --cluster longtail --service-name api \
  --query 'taskArns[0]' --output text | awk -F/ '{print $NF}')

# Get the RDS endpoint
RDS_HOST=$(aws secretsmanager get-secret-value --secret-id LongTail/Database \
  --query SecretString --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")

# Get the RDS password
RDS_PASS=$(aws secretsmanager get-secret-value --secret-id LongTail/Database \
  --query SecretString --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")

echo "RDS Host: $RDS_HOST"
echo "RDS User: longtail"
echo "RDS Password: $RDS_PASS"
echo "RDS Database: longtail"
```

Then in Beekeeper Studio:

| Field | Value |
|-------|-------|
| Host | Use the `RDS_HOST` value |
| Port | `5432` |
| User | `longtail` |
| Password | Use the `RDS_PASS` value |
| Database | `longtail` |
| SSL | On (allow self-signed) |

Note: Direct connections from your laptop require network-level access to the isolated subnet (VPN, bastion, or SSM tunnel). For most admin tasks, the dashboard at `https://longtail.hotmesh.io` provides full visibility into workflows, users, and execution traces.

---

## Day-to-Day Operations

### Deploying Code Changes

For routine code changes (no infrastructure changes):

```bash
cd deploy/cdk
npm run build
npx cdk deploy LongTail-Compute --require-approval never
```

CDK rebuilds the Docker image, pushes to ECR, and does a rolling update on both services. Takes ~3–5 minutes. Zero downtime.

Most deploys only change the ECS task definitions and services. `cdk diff` should show 2–6 changed resources. Anything more is a signal to review before deploying.

### Updating Secrets

Update the value in Secrets Manager, then restart services. ECS resolves secrets at container start time.

```bash
# Example: rotate the Anthropic key
aws secretsmanager put-secret-value \
  --secret-id LongTail/AnthropicApiKey \
  --secret-string "sk-ant-new-key-here"

# Verify
aws secretsmanager get-secret-value --secret-id LongTail/AnthropicApiKey \
  --query SecretString --output text | head -c 20

# Restart both services
aws ecs update-service --cluster longtail --service api --force-new-deployment
aws ecs update-service --cluster longtail --service worker --force-new-deployment
```

### Checking Logs

```bash
# Live tail (Ctrl+C to stop)
aws logs tail /ecs/longtail/api --follow --format short
aws logs tail /ecs/longtail/worker --follow --format short

# Last 10 minutes
aws logs tail /ecs/longtail/worker --since 10m --format short

# Search for errors
aws logs filter-log-events --log-group-name /ecs/longtail/worker \
  --start-time $(date -v-30M +%s000) --filter-pattern "error" \
  --query 'events[*].message' --output text
```

### Checking Service Health

```bash
# Quick status
curl -s https://longtail.hotmesh.io/health

# Service details
aws ecs describe-services --cluster longtail --services api worker \
  --query 'services[*].{name:serviceName,desired:desiredCount,running:runningCount}' \
  --output table
```

### Restarting Services

```bash
# Restart both (rolling — zero downtime)
aws ecs update-service --cluster longtail --service api --force-new-deployment
aws ecs update-service --cluster longtail --service worker --force-new-deployment
```

This starts new tasks with fresh secret values and drains the old ones. Takes ~2 minutes per service.

---

## GitHub Actions CI/CD

Two workflows in `.github/workflows/`:

- **`test.yml`** — runs on every push and PR. Typechecks, unit tests, and integration tests (including NATS event delivery).
- **`deploy.yml`** — runs on git tags matching `v*.*.*`. Runs all tests, builds and deploys via CDK, then runs post-deploy smoke tests.

### Setup (one-time, after manual deploy is working)

```bash
# Deploy the OIDC stack
cd deploy/cdk
npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO
```

Copy the output role ARN. In GitHub → Settings → Secrets and variables → Actions → Variables, add:

| Variable | Value |
|----------|-------|
| `AWS_ACCOUNT_ID` | Your AWS account ID |
| `AWS_REGION` | `us-west-1` |
| `AWS_ROLE_ARN` | Role ARN from the OIDC stack output |

### Release Flow

```bash
git tag v1.0.0 && git push --tags
```

GitHub Actions builds the image, pushes to ECR, runs `cdk deploy --all`. Rolling deploy, zero downtime.

---

## Infrastructure Details

### RDS Configuration

- **Engine:** PostgreSQL 16
- **Instance:** `db.t4g.medium` (2 vCPU, 4 GB RAM)
- **Storage:** gp3, 100 GB initial, autoscaling to 500 GB
- **Multi-AZ:** disabled (one-line flip to enable)
- **Backups:** 7-day automated retention
- **Deletion protection:** enabled
- **Removal policy:** RETAIN (survives `cdk destroy`)

Custom parameter group (critical for LISTEN/NOTIFY):

| Parameter | Value | Why |
|-----------|-------|-----|
| `max_connections` | 200 | Worker mesh + API connections |
| `idle_in_transaction_session_timeout` | 60000 | Prevents zombie transactions |
| `tcp_keepalives_idle` | 60 | Detects dead connections |
| `tcp_keepalives_interval` | 10 | Keepalive probe frequency |
| `tcp_keepalives_count` | 6 | Probes before declaring dead |

### S3 Bucket Configuration

- **Encryption:** S3-managed
- **Public access:** blocked
- **SSL:** enforced
- **Versioning:** enabled
- **Removal policy:** RETAIN

Lifecycle rules:
- Non-current versions expire after 30 days
- Objects transition to Infrequent Access after 60 days
- `tmp/` prefix expires after 7 days

### Fargate Task Sizing

Both services run at 0.5 vCPU / 1 GB RAM. Auto-scaling is configured 1–4 tasks per service, targeting 70% CPU utilization.

| Service | CPU | Memory | Desired | Max | Stop Timeout |
|---------|-----|--------|---------|-----|-------------|
| API | 0.5 vCPU | 1 GB | 1 | 4 | default |
| Worker | 0.5 vCPU | 1 GB | 1 | 4 | 120 seconds |
| NATS | 0.25 vCPU | 512 MB | 1 | 1 | default |

### Future Flips

- **Multi-AZ RDS:** Change `multiAz: false` to `true` in `data-stack.ts`
- **Larger RDS:** Change `InstanceSize.MEDIUM` in `data-stack.ts`
- **Staging environment:** Instantiate the same stacks in `bin/app.ts` with prefix `LongTailStaging-`

### Tearing Down

RDS and S3 have `RemovalPolicy.RETAIN` and deletion protection. `cdk destroy` leaves them behind intentionally.

To fully tear down:

1. `npx cdk destroy --all`
2. AWS Console → RDS: disable deletion protection, delete the instance
3. AWS Console → S3: empty the bucket, delete it
4. AWS Console → Secrets Manager: delete retained secrets
