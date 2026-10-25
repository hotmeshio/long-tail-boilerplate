import * as cdk from 'aws-cdk-lib';

/**
 * Centralized deployment configuration.
 *
 * Nothing here names a real deployment. The domain is required and comes
 * from CDK context or the environment; CI passes it from repository secrets:
 *   LT_HOSTED_ZONE_DOMAIN=example.com LT_SUBDOMAIN=app npx cdk deploy --all
 *   npx cdk deploy --all -c hostedZoneDomain=example.com -c subdomain=app
 *
 * Other values have defaults and accept the same context overrides.
 */
export function loadConfig(app: cdk.App) {
  // ── Identity ───────────────────────────────────────────────────────────
  // These values flow into stack names, resource names, tags, and DNS.

  /** Project name — used in stack prefixes, ECS cluster, log groups, S3 bucket, secrets */
  const projectName = app.node.tryGetContext('projectName') || 'LongTail';

  /** Lowercase slug derived from project name — used where AWS requires lowercase */
  const projectSlug = app.node.tryGetContext('projectSlug') || projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  /** Root domain: the Route 53 hosted zone you own */
  const hostedZoneDomain = required(app, 'hostedZoneDomain', 'LT_HOSTED_ZONE_DOMAIN');

  /** Subdomain record name (without the root domain) */
  const subdomain = required(app, 'subdomain', 'LT_SUBDOMAIN');

  /** Full domain name — derived from subdomain + hosted zone */
  const domainName = `${subdomain}.${hostedZoneDomain}`;

  /** Environment tag (e.g., production, staging) */
  const environment = app.node.tryGetContext('environment') || 'production';

  // ── Database ───────────────────────────────────────────────────────────

  const dbName = app.node.tryGetContext('dbName') || projectSlug;
  const dbUsername = app.node.tryGetContext('dbUsername') || projectSlug;

  // ── NATS ───────────────────────────────────────────────────────────────
  // NATS auth token is stored in Secrets Manager (auto-generated).
  // No hardcoded token — all containers read from the shared secret.

  // ── Login protection (AWS WAF on the ALB) ───────────────────────────────

  /** POST /api/auth/login attempts allowed per client IP per window */
  const loginRateLimit = Number(app.node.tryGetContext('loginRateLimit') ?? 30);

  /** Window the login limit is counted over: 60, 120, 300, or 600 seconds */
  const loginRateWindowSeconds = Number(app.node.tryGetContext('loginRateWindowSeconds') ?? 300);

  /** CloudMap private DNS namespace for service discovery */
  const serviceDiscoveryNamespace = `${projectSlug}.local`;

  return {
    projectName,
    projectSlug,
    hostedZoneDomain,
    subdomain,
    domainName,
    environment,
    dbName,
    dbUsername,
    serviceDiscoveryNamespace,
    loginRateLimit,
    loginRateWindowSeconds,

    // ── Derived values ─────────────────────────────────────────────────
    // Computed from the above — no need to override individually.

    /** Stack name prefix: e.g., "LongTail-Network" */
    stackName: (suffix: string) => `${projectName}-${suffix}`,

    /** Log group path: e.g., "/ecs/longtail/api" */
    logGroup: (service: string) => `/ecs/${projectSlug}/${service}`,

    /** Secrets Manager path: e.g., "LongTail/Database" */
    secretName: (name: string) => `${projectName}/${name}`,

    /** S3 bucket name: e.g., "longtail-files-123456789-us-east-1" */
    bucketName: (account: string, region: string) =>
      `${projectSlug}-files-${account}-${region}`,

    /** Internal NATS URL via Cloud Map */
    natsUrl: `nats://nats.${serviceDiscoveryNamespace}:4222`,

    /** GitHub Actions deploy role name */
    deployRoleName: `${projectName}-GithubActionsDeployRole`,
  };
}

export type DeployConfig = ReturnType<typeof loadConfig>;

/** A value from CDK context or the environment; throws when neither is set. */
function required(app: cdk.App, contextKey: string, envKey: string): string {
  const value = app.node.tryGetContext(contextKey) || process.env[envKey];
  if (!value) {
    throw new Error(`Missing ${contextKey}: pass -c ${contextKey}=... or set ${envKey}`);
  }
  return value;
}
