import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecret: secretsmanager.ISecret;
  albSecurityGroup: ec2.SecurityGroup;
  appSecurityGroup: ec2.SecurityGroup;
  workerSecurityGroup: ec2.SecurityGroup;
  bucket: s3.Bucket;
  jwtSecret: secretsmanager.Secret;
  oauthSecret: secretsmanager.Secret;
  apiKeysSecret: secretsmanager.Secret;
  anthropicApiKeySecret: secretsmanager.Secret;
  openaiApiKeySecret: secretsmanager.Secret;
  seedAdminPasswordSecret: secretsmanager.Secret;
  certificate: acm.Certificate;
  hostedZone: route53.IHostedZone;
}

export class ComputeStack extends cdk.Stack {
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      vpc,
      dbSecret,
      albSecurityGroup,
      appSecurityGroup,
      workerSecurityGroup,
      bucket,
      jwtSecret,
      oauthSecret,
      apiKeysSecret,
      anthropicApiKeySecret,
      openaiApiKeySecret,
      seedAdminPasswordSecret,
      certificate,
      hostedZone,
    } = props;

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
      POSTGRES_DB: 'longtail',
      LT_STORAGE_BACKEND: 's3',
      LT_S3_BUCKET: bucket.bucketName,
      LT_S3_REGION: cdk.Stack.of(this).region,
    };

    // --- ECS Cluster ---

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'longtail',
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

    // ── API Service ─────────────────────────────────────────────────────────
    // Dashboard + REST API. Readonly workflow observers for dashboard visibility.
    // Runs the conditional seed on first boot.

    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/ecs/longtail/api',
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
      },
      secrets: {
        ...sharedSecrets,
        SEED_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(seedAdminPasswordSecret),
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
      logGroupName: '/ecs/longtail/worker',
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
      },
      secrets: sharedSecrets,
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
      recordName: 'longtail',
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(this.alb),
      ),
    });

    // --- Outputs ---

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      description: 'ALB DNS name',
    });

    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: 'https://longtail.hotmesh.io',
      description: 'Application URL',
    });
  }
}
