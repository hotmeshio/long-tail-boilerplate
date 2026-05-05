#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { DnsStack } from '../lib/dns-stack';
import { ComputeStack } from '../lib/compute-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Stack-level tags applied to all resources
cdk.Tags.of(app).add('Project', 'long-tail');
cdk.Tags.of(app).add('Environment', 'production');

// 1. Network — VPC, subnets, NAT gateway, security groups
const network = new NetworkStack(app, 'LongTail-Network', { env });

// 2. Data — RDS, S3, Secrets Manager
const data = new DataStack(app, 'LongTail-Data', {
  env,
  vpc: network.vpc,
  dbSecurityGroup: network.dbSecurityGroup,
});

// 3. DNS — Route 53 hosted zone lookup, ACM certificate
const dns = new DnsStack(app, 'LongTail-Dns', { env });

// 4. Compute — ECS Fargate, ALB, DNS A record
new ComputeStack(app, 'LongTail-Compute', {
  env,
  vpc: network.vpc,
  dbSecret: data.dbSecret,
  albSecurityGroup: network.albSecurityGroup,
  appSecurityGroup: network.appSecurityGroup,
  workerSecurityGroup: network.workerSecurityGroup,
  bucket: data.bucket,
  jwtSecret: data.jwtSecret,
  oauthSecret: data.oauthSecret,
  apiKeysSecret: data.apiKeysSecret,
  anthropicApiKeySecret: data.anthropicApiKeySecret,
  openaiApiKeySecret: data.openaiApiKeySecret,
  seedAdminPasswordSecret: data.seedAdminPasswordSecret,
  certificate: dns.certificate,
  hostedZone: dns.hostedZone,
});

// 5. GitHub OIDC — deployed manually with context variables:
//    npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO
// Only instantiated when context vars are provided, so `cdk deploy --all` skips it.
const githubOwner = app.node.tryGetContext('githubOwner');
const githubRepo = app.node.tryGetContext('githubRepo');
if (githubOwner && githubRepo) {
  new GithubOidcStack(app, 'LongTail-GithubOidc', { env });
}
