import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface LoginWafProps {
  /** ARN of the load balancer the web ACL protects. */
  loadBalancerArn: string;
  /** Name prefix for the ACL and its metrics. */
  name: string;
  /** Login attempts allowed per client IP within the window. */
  loginRateLimit: number;
  /** Window the limit is counted over: 60, 120, 300, or 600 seconds. */
  loginRateWindowSeconds: number;
}

/**
 * Web ACL on the ALB:
 *   1. AWS IP reputation list: blocks addresses AWS tracks as malicious.
 *   2. Login throttle: an IP over the limit on POST /api/auth/login gets 429
 *      until its count falls back under the limit. Other paths are unaffected.
 *
 * The path match lowercases and URL-decodes first, since Express routes
 * case-insensitively. Behind the ALB the source IP is the client's own.
 */
export class LoginWaf extends Construct {
  constructor(scope: Construct, id: string, props: LoginWafProps) {
    super(scope, id);

    const visibility = (metricName: string) => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName: `${props.name}-${metricName}`,
    });

    const acl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${props.name}-web-acl`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('web-acl'),
      rules: [
        {
          name: 'aws-ip-reputation',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesAmazonIpReputationList' },
          },
          visibilityConfig: visibility('ip-reputation'),
        },
        {
          name: 'login-rate-limit',
          priority: 1,
          action: { block: { customResponse: { responseCode: 429 } } },
          statement: {
            rateBasedStatement: {
              limit: props.loginRateLimit,
              evaluationWindowSec: props.loginRateWindowSeconds,
              aggregateKeyType: 'IP',
              scopeDownStatement: {
                andStatement: {
                  statements: [
                    {
                      byteMatchStatement: {
                        fieldToMatch: { method: {} },
                        positionalConstraint: 'EXACTLY',
                        searchString: 'POST',
                        textTransformations: [{ priority: 0, type: 'NONE' }],
                      },
                    },
                    {
                      byteMatchStatement: {
                        fieldToMatch: { uriPath: {} },
                        positionalConstraint: 'STARTS_WITH',
                        searchString: '/api/auth/login',
                        textTransformations: [
                          { priority: 0, type: 'URL_DECODE' },
                          { priority: 1, type: 'LOWERCASE' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
          visibilityConfig: visibility('login-rate-limit'),
        },
      ],
    });

    new wafv2.CfnWebACLAssociation(this, 'AlbAssociation', {
      resourceArn: props.loadBalancerArn,
      webAclArn: acl.attrArn,
    });
  }
}
