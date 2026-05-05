import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class GithubOidcStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const githubOwner = this.node.tryGetContext('githubOwner');
    const githubRepo = this.node.tryGetContext('githubRepo');

    if (!githubOwner || !githubRepo) {
      throw new Error(
        'Context variables "githubOwner" and "githubRepo" are required. ' +
        'Deploy with: npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO',
      );
    }

    // Create the OIDC provider for GitHub Actions.
    // If one already exists in the account, import it instead.
    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['ffffffffffffffffffffffffffffffffffffffff'],
    });

    this.deployRole = new iam.Role(this, 'GithubActionsRole', {
      roleName: 'LongTail-GithubActionsDeployRole',
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:${githubOwner}/${githubRepo}:*`,
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
      // AdministratorAccess for simplicity on a personal account.
      // For a shared/org account, scope this down to:
      //   - cloudformation:*
      //   - ecs:*, ecr:*, ec2:*, elasticloadbalancing:*
      //   - s3:*, rds:*, secretsmanager:*
      //   - iam:PassRole on CDK execution roles
      //   - logs:*, route53:*, acm:*
      //   - sts:AssumeRole on cdk-* roles
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
      maxSessionDuration: cdk.Duration.hours(1),
    });

    new cdk.CfnOutput(this, 'RoleArn', {
      value: this.deployRole.roleArn,
      description: 'IAM role ARN for GitHub Actions — add this as AWS_ROLE_ARN in GitHub repo variables',
    });
  }
}
