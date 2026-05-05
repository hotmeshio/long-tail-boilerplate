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
exports.GithubOidcStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class GithubOidcStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const githubOwner = this.node.tryGetContext('githubOwner');
        const githubRepo = this.node.tryGetContext('githubRepo');
        if (!githubOwner || !githubRepo) {
            throw new Error('Context variables "githubOwner" and "githubRepo" are required. ' +
                'Deploy with: npx cdk deploy LongTail-GithubOidc -c githubOwner=OWNER -c githubRepo=REPO');
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
exports.GithubOidcStack = GithubOidcStack;
