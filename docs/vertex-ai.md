# Vertex AI configuration for yyyjie

yyyjie can call Anthropic Claude publisher models through Google Vertex AI. The
UI and executable are branded as `yyyjie`; the upstream environment variables,
request metadata, model IDs, authentication, and Vertex publisher routes remain
unchanged because Google and Anthropic use them for compatibility and routing.

## Prerequisites

Use a real Google Cloud project with billing enabled, the Vertex AI API enabled,
and the required Anthropic model enabled in Model Garden. Confirm that the model
is available in the selected region and that the project has enough partner-model
quota or Provisioned Throughput capacity.

The active Google principal needs `aiplatform.endpoints.predict`. The predefined
`roles/aiplatform.user` role is the usual starting point. User ADC with a quota
project may additionally need `serviceusage.services.use` on that quota project.
Organization policy, VPC Service Controls, Assured Workloads, or Marketplace
procurement policy can still deny a request even when IAM is otherwise correct.

## Local development with user ADC

```bash
gcloud auth application-default login

export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID="your-project-id"
export CLOUD_ML_REGION="us-east5"

yyyjie
```

`gcloud auth login` and `gcloud auth application-default login` create different
credentials. The Vertex adapter uses Google Application Default Credentials
(ADC), so use the latter for local development.

## Service account or workload identity

In Google Cloud, prefer an attached service account or Workload Identity
Federation. ADC discovers the attached identity automatically:

```bash
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID="your-project-id"
export CLOUD_ML_REGION="us-east5"

yyyjie
```

For an environment that must use an ADC-compatible credential file, point Google
Auth at it explicitly. Do not commit credentials to the repository.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/application-default.json"
export CLAUDE_CODE_USE_VERTEX=1
export ANTHROPIC_VERTEX_PROJECT_ID="your-project-id"
export CLOUD_ML_REGION="us-east5"

yyyjie
```

ADC keeps Google's normal lookup order: `GOOGLE_APPLICATION_CREDENTIALS`, the
local ADC file, then an attached service account from the metadata server.

## Region and model overrides

`CLOUD_ML_REGION` sets the default Vertex region. Existing model-specific
`VERTEX_REGION_*` variables still take precedence through the upstream model
mapping. Use the exact Vertex publisher model ID accepted in the selected region.

For an authorized Vertex proxy, `ANTHROPIC_VERTEX_BASE_URL` and
`CLAUDE_CODE_SKIP_VERTEX_AUTH` remain supported. Skipping Google authentication
requires an explicit `ANTHROPIC_VERTEX_PROJECT_ID`; it is intended only when the
proxy performs the required authentication and routing.

## Error categories

Vertex failures are surfaced with the current project, region, and model and are
classified as one of:

- ADC authentication
- Vertex AI API disabled
- IAM permission denied
- unsupported region
- publisher-model access or authorization
- organization policy or service perimeter
- quota, rate limit, or regional capacity

The original Google error is retained in a shortened diagnostic so administrators
can match it to Cloud Audit Logs without exposing credential material.

## Telemetry and protocol metadata

Optional analytics and OpenTelemetry export are disabled in this fork. Required
authentication, billing, routing, session correlation, and client compatibility
metadata are not telemetry and are preserved, including `CLAUDE_CODE_*`
variables and `X-Claude-Code-*` request headers.
