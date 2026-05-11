import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

import type { DeployConfig } from './config';

export interface DnsStackProps extends cdk.StackProps {
  config: DeployConfig;
}

export class DnsStack extends cdk.Stack {
  public readonly certificate: acm.Certificate;
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.hostedZoneDomain,
    });

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: config.domainName,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: `ACM certificate ARN for ${config.domainName}`,
    });
  }
}
