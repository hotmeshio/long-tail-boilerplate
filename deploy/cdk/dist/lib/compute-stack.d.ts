import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { DeployConfig } from './config';
export interface ComputeStackProps extends cdk.StackProps {
    vpc: ec2.Vpc;
    dbSecret: secretsmanager.ISecret;
    albSecurityGroup: ec2.SecurityGroup;
    appSecurityGroup: ec2.SecurityGroup;
    workerSecurityGroup: ec2.SecurityGroup;
    natsSecurityGroup: ec2.SecurityGroup;
    bucket: s3.Bucket;
    jwtSecret: secretsmanager.Secret;
    oauthSecret: secretsmanager.Secret;
    apiKeysSecret: secretsmanager.Secret;
    anthropicApiKeySecret: secretsmanager.Secret;
    openaiApiKeySecret: secretsmanager.Secret;
    seedAdminPasswordSecret: secretsmanager.Secret;
    natsTokenSecret: secretsmanager.Secret;
    certificate: acm.Certificate;
    hostedZone: route53.IHostedZone;
    config: DeployConfig;
}
export declare class ComputeStack extends cdk.Stack {
    readonly alb: elbv2.ApplicationLoadBalancer;
    constructor(scope: Construct, id: string, props: ComputeStackProps);
}
