import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
export declare class DnsStack extends cdk.Stack {
    readonly certificate: acm.Certificate;
    readonly hostedZone: route53.IHostedZone;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
