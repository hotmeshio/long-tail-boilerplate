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
exports.ComputeStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53Targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
class ComputeStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { vpc, dbSecret, albSecurityGroup, appSecurityGroup, workerSecurityGroup, natsSecurityGroup, bucket, jwtSecret, oauthSecret, apiKeysSecret, anthropicApiKeySecret, openaiApiKeySecret, seedAdminPasswordSecret, natsTokenSecret, certificate, hostedZone, config, } = props;
        // --- Shared: Docker image, built once, used by both services ---
        const image = ecs.ContainerImage.fromAsset('../..', {
            exclude: ['deploy/cdk/cdk.out', 'deploy/cdk/node_modules', 'deploy/cdk/dist'],
            platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
        });
        const sharedSecrets = {
            POSTGRES_HOST: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
            POSTGRES_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
            POSTGRES_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
            JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
            OAUTH_CONFIG: ecs.Secret.fromSecretsManager(oauthSecret),
            API_KEYS: ecs.Secret.fromSecretsManager(apiKeysSecret),
            ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(anthropicApiKeySecret),
            OPENAI_API_KEY: ecs.Secret.fromSecretsManager(openaiApiKeySecret),
        };
        const sharedEnv = {
            NODE_ENV: 'production',
            PGSSLMODE: 'no-verify',
            POSTGRES_PORT: '5432',
            POSTGRES_DB: config.dbName,
            LT_STORAGE_BACKEND: 's3',
            LT_S3_BUCKET: bucket.bucketName,
            LT_S3_REGION: cdk.Stack.of(this).region,
        };
        // --- ECS Cluster ---
        const cluster = new ecs.Cluster(this, 'Cluster', {
            vpc,
            clusterName: config.projectSlug,
            defaultCloudMapNamespace: {
                name: config.serviceDiscoveryNamespace,
                type: cdk.aws_servicediscovery.NamespaceType.DNS_PRIVATE,
                vpc,
            },
        });
        // --- NATS Event Bus ---
        // Lightweight pub/sub for cross-server event delivery.
        // Workers and API servers publish events to NATS (port 4222).
        // Browser dashboard connects directly to NATS via WebSocket (port 9222).
        // No Socket.IO relay — one event bus, one subscription, no intermediary.
        const natsLogGroup = new logs.LogGroup(this, 'NatsLogGroup', {
            logGroupName: config.logGroup('nats'),
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const natsTaskDef = new ecs.FargateTaskDefinition(this, 'NatsTaskDef', {
            cpu: 256,
            memoryLimitMiB: 512,
        });
        natsTaskDef.addContainer('nats', {
            image: ecs.ContainerImage.fromRegistry('nats:2-alpine'),
            // Write config at startup using NATS_TOKEN env var from Secrets Manager.
            // Auth, monitoring, and WebSocket (no TLS — ALB terminates).
            entryPoint: ['sh', '-c'],
            command: [
                `printf 'port: 4222\\nhttp_port: 8222\\nauthorization { token: %s }\\nwebsocket { port: 9222\\n  no_tls: true\\n}\\n' "$NATS_TOKEN" > /tmp/nats.conf && exec nats-server -c /tmp/nats.conf`,
            ],
            portMappings: [
                { containerPort: 4222 },
                { containerPort: 9222 },
                { containerPort: 8222 },
            ],
            secrets: {
                NATS_TOKEN: ecs.Secret.fromSecretsManager(natsTokenSecret),
            },
            logging: ecs.LogDrivers.awsLogs({
                logGroup: natsLogGroup,
                streamPrefix: 'nats',
            }),
        });
        const natsService = new ecs.FargateService(this, 'NatsService', {
            cluster,
            taskDefinition: natsTaskDef,
            desiredCount: 1,
            securityGroups: [natsSecurityGroup],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            serviceName: 'nats',
            cloudMapOptions: {
                name: 'nats',
                dnsRecordType: cdk.aws_servicediscovery.DnsRecordType.A,
            },
        });
        // --- ALB ---
        this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
            vpc,
            internetFacing: true,
            securityGroup: albSecurityGroup,
            vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        });
        this.alb.addListener('HttpRedirect', {
            port: 80,
            defaultAction: elbv2.ListenerAction.redirect({
                protocol: 'HTTPS',
                port: '443',
            }),
        });
        const httpsListener = this.alb.addListener('HttpsListener', {
            port: 443,
            certificates: [certificate],
            defaultAction: elbv2.ListenerAction.fixedResponse(404, {
                contentType: 'text/plain',
                messageBody: 'Not Found',
            }),
        });
        // ── NATS WebSocket Listener (port 9222) ───────────────────────────────
        // Browser dashboard connects directly to NATS via WebSocket.
        // TLS terminates at ALB; NATS serves plaintext WebSocket internally.
        const natsWsListener = this.alb.addListener('NatsWsListener', {
            port: 9222,
            protocol: elbv2.ApplicationProtocol.HTTPS,
            certificates: [certificate],
            defaultAction: elbv2.ListenerAction.fixedResponse(404, {
                contentType: 'text/plain',
                messageBody: 'Not Found',
            }),
        });
        natsWsListener.addTargets('NatsWsTarget', {
            port: 9222,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [natsService.loadBalancerTarget({
                    containerName: 'nats',
                    containerPort: 9222,
                })],
            healthCheck: {
                path: '/',
                port: '8222',
                protocol: elbv2.Protocol.HTTP,
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
            priority: 1,
            conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
        });
        // ── API Service ─────────────────────────────────────────────────────────
        // Dashboard + REST API. Readonly workflow observers for dashboard visibility.
        // Runs the conditional seed on first boot.
        const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
            logGroupName: config.logGroup('api'),
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const apiTaskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
            cpu: 512,
            memoryLimitMiB: 1024,
        });
        apiTaskDef.addContainer('api', {
            image,
            command: ['node', 'build/index.js'],
            portMappings: [{ containerPort: 3030 }],
            environment: {
                ...sharedEnv,
                APP_ROLE: 'api',
                PORT: '3030',
                NATS_URL: config.natsUrl,
                NATS_WS_URL: config.natsWsUrl,
            },
            secrets: {
                ...sharedSecrets,
                SEED_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(seedAdminPasswordSecret),
                NATS_TOKEN: ecs.Secret.fromSecretsManager(natsTokenSecret),
            },
            logging: ecs.LogDrivers.awsLogs({
                logGroup: apiLogGroup,
                streamPrefix: 'api',
            }),
        });
        bucket.grantReadWrite(apiTaskDef.taskRole);
        const apiService = new ecs.FargateService(this, 'ApiService', {
            cluster,
            taskDefinition: apiTaskDef,
            desiredCount: 1,
            securityGroups: [appSecurityGroup],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            serviceName: 'api',
            healthCheckGracePeriod: cdk.Duration.seconds(60),
            minHealthyPercent: 100,
            maxHealthyPercent: 200,
        });
        const apiScaling = apiService.autoScaleTaskCount({
            minCapacity: 1,
            maxCapacity: 4,
        });
        apiScaling.scaleOnCpuUtilization('ApiCpuScaling', {
            targetUtilizationPercent: 70,
        });
        httpsListener.addTargets('ApiTarget', {
            port: 3030,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [apiService],
            healthCheck: {
                path: '/',
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(10),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
            },
            priority: 1,
            conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
        });
        // ── Worker Service ──────────────────────────────────────────────────────
        // Workflow execution only. No HTTP server, no inbound traffic.
        // 120s stop timeout for graceful shutdown of in-flight durable activities
        // and leader advisory lock release.
        const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
            logGroupName: config.logGroup('worker'),
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        const workerTaskDef = new ecs.FargateTaskDefinition(this, 'WorkerTaskDef', {
            cpu: 512,
            memoryLimitMiB: 1024,
        });
        workerTaskDef.addContainer('worker', {
            image,
            command: ['node', 'build/index.js'],
            environment: {
                ...sharedEnv,
                APP_ROLE: 'worker',
                NATS_URL: config.natsUrl,
            },
            secrets: {
                ...sharedSecrets,
                NATS_TOKEN: ecs.Secret.fromSecretsManager(natsTokenSecret),
            },
            logging: ecs.LogDrivers.awsLogs({
                logGroup: workerLogGroup,
                streamPrefix: 'worker',
            }),
            stopTimeout: cdk.Duration.seconds(120),
        });
        bucket.grantReadWrite(workerTaskDef.taskRole);
        const workerService = new ecs.FargateService(this, 'WorkerService', {
            cluster,
            taskDefinition: workerTaskDef,
            desiredCount: 1,
            securityGroups: [workerSecurityGroup],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            serviceName: 'worker',
            minHealthyPercent: 100,
            maxHealthyPercent: 200,
        });
        const workerScaling = workerService.autoScaleTaskCount({
            minCapacity: 1,
            maxCapacity: 4,
        });
        workerScaling.scaleOnCpuUtilization('WorkerCpuScaling', {
            targetUtilizationPercent: 70,
        });
        // --- DNS A Record ---
        new route53.ARecord(this, 'AliasRecord', {
            zone: hostedZone,
            recordName: config.subdomain,
            target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(this.alb)),
        });
        // --- Outputs ---
        new cdk.CfnOutput(this, 'AlbDnsName', {
            value: this.alb.loadBalancerDnsName,
            description: 'ALB DNS name',
        });
        new cdk.CfnOutput(this, 'ServiceUrl', {
            value: `https://${config.domainName}`,
            description: 'Application URL',
        });
        new cdk.CfnOutput(this, 'NatsWsUrl', {
            value: config.natsWsUrl,
            description: 'NATS WebSocket URL for browser connections',
        });
    }
}
exports.ComputeStack = ComputeStack;
