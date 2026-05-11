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
export declare class DataStack extends cdk.Stack {
    readonly dbInstance: rds.DatabaseInstance;
    readonly dbSecret: secretsmanager.ISecret;
    readonly bucket: s3.Bucket;
    readonly jwtSecret: secretsmanager.Secret;
    readonly oauthSecret: secretsmanager.Secret;
    readonly apiKeysSecret: secretsmanager.Secret;
    readonly anthropicApiKeySecret: secretsmanager.Secret;
    readonly openaiApiKeySecret: secretsmanager.Secret;
    readonly seedAdminPasswordSecret: secretsmanager.Secret;
    readonly natsTokenSecret: secretsmanager.Secret;
    constructor(scope: Construct, id: string, props: DataStackProps);
}
