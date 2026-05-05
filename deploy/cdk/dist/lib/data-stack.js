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
exports.DataStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
class DataStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
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
        this.dbSecret = this.dbInstance.secret;
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
exports.DataStack = DataStack;
