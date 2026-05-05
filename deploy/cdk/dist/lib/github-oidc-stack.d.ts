import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
export declare class GithubOidcStack extends cdk.Stack {
    readonly deployRole: iam.Role;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
