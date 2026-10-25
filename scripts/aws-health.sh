#!/usr/bin/env bash
# Health check of the deployed app. The URL is the Compute stack's ServiceUrl
# output, so no deployment is named here. STACK_PREFIX defaults to LongTail.
set -euo pipefail

URL=$(aws cloudformation describe-stacks --stack-name "${STACK_PREFIX:-LongTail}-Compute" \
  --query "Stacks[0].Outputs[?OutputKey=='ServiceUrl'].OutputValue" --output text)
curl -s "${URL}/health" && echo ''
