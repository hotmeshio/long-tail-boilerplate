import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import type { DeployConfig } from './config';
export interface GithubOidcStackProps extends cdk.StackProps {
    config: DeployConfig;
}
export declare class GithubOidcStack extends cdk.Stack {
    readonly deployRole: iam.Role;
    constructor(scope: Construct, id: string, props: GithubOidcStackProps);
}
