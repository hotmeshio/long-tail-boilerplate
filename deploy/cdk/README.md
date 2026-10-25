# Long Tail CDK Stacks

See [../README.md](../README.md) for the complete deployment guide.

## Before any command

The domain is required and is never stored in the repo. Export it in your shell (CI reads the same names from repository secrets):

```bash
export LT_HOSTED_ZONE_DOMAIN=example.com   # a Route 53 hosted zone you own
export LT_SUBDOMAIN=app                     # the app serves at https://app.example.com
```

Without them, synth stops with `Missing hostedZoneDomain: pass -c hostedZoneDomain=... or set LT_HOSTED_ZONE_DOMAIN`.

## Quick reference

```bash
npm ci && npm run build              # install and compile
npx cdk synth --all                  # synthesize templates (lookups cached in cdk.context.json)
npx cdk diff --all                   # compare with what is deployed
npx cdk deploy LongTail-Network      # VPC, subnets, security groups
npx cdk deploy LongTail-Data         # Aurora PostgreSQL, S3, Secrets Manager
npx cdk deploy LongTail-Dns          # ACM certificate
npx cdk deploy LongTail-Compute      # ECS Fargate, ALB, AWS WAF, DNS record
npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO   # once, for CI
```

## Settings (CDK context)

| Key | Default | Purpose |
|-----|---------|---------|
| `hostedZoneDomain` / `LT_HOSTED_ZONE_DOMAIN` | required | Route 53 hosted zone |
| `subdomain` / `LT_SUBDOMAIN` | required | Record name under the zone |
| `projectName` | `LongTail` | Stack, cluster, log group, and secret names |
| `environment` | `production` | `Environment` tag |
| `loginRateLimit` | `30` | WAF: `POST /api/auth/login` requests per IP per window |
| `loginRateWindowSeconds` | `300` | WAF window: 60, 120, 300, or 600 |

Pass any of them as `-c key=value`. `cdk.out/` and `cdk.context.json` are gitignored: they name your account and hosted zone.
