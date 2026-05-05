#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const network_stack_1 = require("../lib/network-stack");
const data_stack_1 = require("../lib/data-stack");
const dns_stack_1 = require("../lib/dns-stack");
const compute_stack_1 = require("../lib/compute-stack");
const github_oidc_stack_1 = require("../lib/github-oidc-stack");
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};
// Stack-level tags applied to all resources
cdk.Tags.of(app).add('Project', 'long-tail');
cdk.Tags.of(app).add('Environment', 'production');
// 1. Network — VPC, subnets, NAT gateway, security groups
const network = new network_stack_1.NetworkStack(app, 'LongTail-Network', { env });
// 2. Data — RDS, S3, Secrets Manager
const data = new data_stack_1.DataStack(app, 'LongTail-Data', {
    env,
    vpc: network.vpc,
    dbSecurityGroup: network.dbSecurityGroup,
});
// 3. DNS — Route 53 hosted zone lookup, ACM certificate
const dns = new dns_stack_1.DnsStack(app, 'LongTail-Dns', { env });
// 4. Compute — ECS Fargate, ALB, DNS A record
new compute_stack_1.ComputeStack(app, 'LongTail-Compute', {
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
    new github_oidc_stack_1.GithubOidcStack(app, 'LongTail-GithubOidc', { env });
}
