import * as cdk from 'aws-cdk-lib';

/**
 * Centralized deployment configuration.
 *
 * All deployment-specific values live here. Fork the boilerplate,
 * change these values, and deploy to any AWS account/region.
 *
 * Override any value via CDK context:
 *   npx cdk deploy --all -c projectName=myapp -c domainName=myapp.example.com
 *
 * Or set them in cdk.json under "context": { "projectName": "myapp", ... }
 */
export function loadConfig(app: cdk.App) {
  // ── Identity ───────────────────────────────────────────────────────────
  // These values flow into stack names, resource names, tags, and DNS.

  /** Project name — used in stack prefixes, ECS cluster, log groups, S3 bucket, secrets */
  const projectName = app.node.tryGetContext('projectName') || 'LongTail';

  /** Lowercase slug derived from project name — used where AWS requires lowercase */
  const projectSlug = app.node.tryGetContext('projectSlug') || projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');

  /** Root domain — the Route 53 hosted zone you own */
  const hostedZoneDomain = app.node.tryGetContext('hostedZoneDomain') || 'hotmesh.io';

  /** Subdomain record name (without the root domain) */
  const subdomain = app.node.tryGetContext('subdomain') || 'longtail';

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

    // ── Derived values ─────────────────────────────────────────────────
    // Computed from the above — no need to override individually.

    /** Stack name prefix: e.g., "LongTail-Network" */
    stackName: (suffix: string) => `${projectName}-${suffix}`,

    /** Log group path: e.g., "/ecs/longtail/api" */
    logGroup: (service: string) => `/ecs/${projectSlug}/${service}`,

    /** Secrets Manager path: e.g., "LongTail/Database" */
    secretName: (name: string) => `${projectName}/${name}`,

    /** S3 bucket name: e.g., "longtail-files-123456789-us-west-1" */
    bucketName: (account: string, region: string) =>
      `${projectSlug}-files-${account}-${region}`,

    /** Internal NATS URL via Cloud Map */
    natsUrl: `nats://nats.${serviceDiscoveryNamespace}:4222`,

    /** Public NATS WebSocket URL (TLS terminated at ALB) */
    natsWsUrl: `wss://${domainName}:9222`,

    /** GitHub Actions deploy role name */
    deployRoleName: `${projectName}-GithubActionsDeployRole`,
  };
}

export type DeployConfig = ReturnType<typeof loadConfig>;
