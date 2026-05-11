#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { DnsStack } from '../lib/dns-stack';
import { ComputeStack } from '../lib/compute-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { loadConfig } from '../lib/config';

const app = new cdk.App();
const config = loadConfig(app);

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

cdk.Tags.of(app).add('Project', config.projectSlug);
cdk.Tags.of(app).add('Environment', config.environment);

// 1. Network — VPC, subnets, NAT gateway, security groups
const network = new NetworkStack(app, config.stackName('Network'), { env });

// 2. Data — RDS, S3, Secrets Manager
const data = new DataStack(app, config.stackName('Data'), {
  env,
  vpc: network.vpc,
  dbSecurityGroup: network.dbSecurityGroup,
  config,
});

// 3. DNS — Route 53 hosted zone lookup, ACM certificate
const dns = new DnsStack(app, config.stackName('Dns'), { env, config });

// 4. Compute — ECS Fargate, ALB, NATS, DNS A record
new ComputeStack(app, config.stackName('Compute'), {
  env,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
  albSecurityGroup: network.albSecurityGroup,
  appSecurityGroup: network.appSecurityGroup,
  workerSecurityGroup: network.workerSecurityGroup,
  natsSecurityGroup: network.natsSecurityGroup,
  bucket: data.bucket,
  jwtSecret: data.jwtSecret,
  oauthSecret: data.oauthSecret,
  apiKeysSecret: data.apiKeysSecret,
  anthropicApiKeySecret: data.anthropicApiKeySecret,
  openaiApiKeySecret: data.openaiApiKeySecret,
  seedAdminPasswordSecret: data.seedAdminPasswordSecret,
  natsTokenSecret: data.natsTokenSecret,
  certificate: dns.certificate,
  hostedZone: dns.hostedZone,
  config,
});

// 5. GitHub OIDC — deployed manually with context variables:
//    npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO
// Only instantiated when context vars are provided, so `cdk deploy --all` skips it.
const githubOwner = app.node.tryGetContext('githubOwner');
const githubRepo = app.node.tryGetContext('githubRepo');
if (githubOwner && githubRepo) {
  new GithubOidcStack(app, config.stackName('GithubOidc'), { env, config });
}
