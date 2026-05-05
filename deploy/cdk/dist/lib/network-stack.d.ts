import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
export declare class NetworkStack extends cdk.Stack {
    readonly vpc: ec2.Vpc;
    readonly dbSecurityGroup: ec2.SecurityGroup;
    readonly appSecurityGroup: ec2.SecurityGroup;
    readonly workerSecurityGroup: ec2.SecurityGroup;
    readonly albSecurityGroup: ec2.SecurityGroup;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
