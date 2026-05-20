import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import type { DeployConfig } from './config';

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
  config: DeployConfig;
}

export class DataStack extends cdk.Stack {
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly bucket: s3.Bucket;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly oauthSecret: secretsmanager.Secret;
  public readonly apiKeysSecret: secretsmanager.Secret;
  public readonly anthropicApiKeySecret: secretsmanager.Secret;
  public readonly openaiApiKeySecret: secretsmanager.Secret;
  public readonly seedAdminPasswordSecret: secretsmanager.Secret;
  public readonly natsTokenSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { vpc, dbSecurityGroup, config } = props;

    // --- Aurora Serverless v2 PostgreSQL ---

    const parameterGroup = new rds.ParameterGroup(this, 'AuroraDbParameterGroup', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      parameters: {
        max_connections: '200',
        idle_in_transaction_session_timeout: '60000',
        'tcp_keepalives_idle': '60',
        'tcp_keepalives_interval': '10',
        'tcp_keepalives_count': '6',
      },
    });

    this.dbCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      parameterGroup,
      defaultDatabaseName: config.dbName,
      credentials: rds.Credentials.fromGeneratedSecret(config.dbUsername, {
        secretName: config.secretName('AuroraDatabase'),
      }),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        publiclyAccessible: false,
      }),
      backup: { retention: cdk.Duration.days(7) },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      storageEncrypted: true,
    });

    this.dbSecret = this.dbCluster.secret!;

    // --- S3 Bucket ---

    this.bucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: config.bucketName(cdk.Stack.of(this).account, cdk.Stack.of(this).region),
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          noncurrentVersionExpiration: cdk.Duration.days(30),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(60),
            },
          ],
        },
        {
          prefix: 'tmp/',
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    // --- Secrets Manager ---

    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSigningKey', {
      secretName: config.secretName('JwtSigningKey'),
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.oauthSecret = new secretsmanager.Secret(this, 'OAuthProviders', {
      secretName: config.secretName('OAuthProviders'),
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'),
    });

    this.apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeys', {
      secretName: config.secretName('ApiKeys'),
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'),
    });

    this.anthropicApiKeySecret = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: config.secretName('AnthropicApiKey'),
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder'),
    });

    this.openaiApiKeySecret = new secretsmanager.Secret(this, 'OpenaiApiKey', {
      secretName: config.secretName('OpenaiApiKey'),
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder'),
    });

    this.seedAdminPasswordSecret = new secretsmanager.Secret(this, 'SeedAdminPassword', {
      secretName: config.secretName('SeedAdminPassword'),
      generateSecretString: {
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    this.natsTokenSecret = new secretsmanager.Secret(this, 'NatsToken', {
      secretName: config.secretName('NatsToken'),
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    // --- Outputs ---

    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: this.dbCluster.clusterEndpoint.hostname,
      description: 'Aurora Serverless v2 cluster endpoint',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name',
    });
  }
}
