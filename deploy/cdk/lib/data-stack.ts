import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSecurityGroup: ec2.SecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly bucket: s3.Bucket;
  public readonly jwtSecret: secretsmanager.Secret;
  public readonly oauthSecret: secretsmanager.Secret;
  public readonly apiKeysSecret: secretsmanager.Secret;
  public readonly anthropicApiKeySecret: secretsmanager.Secret;
  public readonly openaiApiKeySecret: secretsmanager.Secret;
  public readonly seedAdminPasswordSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { vpc, dbSecurityGroup } = props;

    // --- RDS PostgreSQL ---

    const parameterGroup = new rds.ParameterGroup(this, 'DbParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      parameters: {
        max_connections: '200',
        idle_in_transaction_session_timeout: '60000',
        'tcp_keepalives_idle': '60',
        'tcp_keepalives_interval': '10',
        'tcp_keepalives_count': '6',
      },
    });

    this.dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MEDIUM,
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      parameterGroup,
      multiAz: false,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      storageType: rds.StorageType.GP3,
      databaseName: 'longtail',
      credentials: rds.Credentials.fromGeneratedSecret('longtail', {
        secretName: 'LongTail/Database',
      }),
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.dbSecret = this.dbInstance.secret!;

    // --- S3 Bucket ---

    this.bucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `longtail-files-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
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
      secretName: 'LongTail/JwtSigningKey',
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.oauthSecret = new secretsmanager.Secret(this, 'OAuthProviders', {
      secretName: 'LongTail/OAuthProviders',
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'),
    });

    this.apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeys', {
      secretName: 'LongTail/ApiKeys',
      secretStringValue: cdk.SecretValue.unsafePlainText('{}'),
    });

    this.anthropicApiKeySecret = new secretsmanager.Secret(this, 'AnthropicApiKey', {
      secretName: 'LongTail/AnthropicApiKey',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder'),
    });

    this.openaiApiKeySecret = new secretsmanager.Secret(this, 'OpenaiApiKey', {
      secretName: 'LongTail/OpenaiApiKey',
      secretStringValue: cdk.SecretValue.unsafePlainText('placeholder'),
    });

    this.seedAdminPasswordSecret = new secretsmanager.Secret(this, 'SeedAdminPassword', {
      secretName: 'LongTail/SeedAdminPassword',
      generateSecretString: {
        passwordLength: 32,
        excludePunctuation: true,
      },
    });

    // --- Outputs ---

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: this.dbInstance.dbInstanceEndpointAddress,
      description: 'RDS endpoint address',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name',
    });
  }
}
