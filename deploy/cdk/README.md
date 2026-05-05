# Long Tail — CDK Stacks

See [../README.md](../README.md) for the complete deployment guide.

## Quick Reference

```bash
npm ci && npm run build              # Install and compile
npx cdk synth --all                  # Synthesize templates
npx cdk deploy LongTail-Network      # VPC, subnets, security groups
npx cdk deploy LongTail-Data         # RDS, S3, Secrets Manager
npx cdk deploy LongTail-Dns          # ACM certificate
npx cdk deploy LongTail-Compute      # ECS Fargate, ALB, DNS record
```
