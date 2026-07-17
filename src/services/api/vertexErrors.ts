import { getVertexRegionForModel, isEnvTruthy } from '../../utils/envUtils.js'
import { getConfiguredVertexProjectId } from './vertex.js'

export type VertexErrorCategory =
	| 'configuration'
	| 'adc'
	| 'iam'
	| 'api_disabled'
	| 'region'
	| 'model_access'
	| 'organization_policy'
	| 'quota'

export type VertexErrorDiagnostic = {
	category: VertexErrorCategory
	message: string
}

function getStatus(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') return undefined
	const value =
		(error as { status?: unknown; code?: unknown }).status ?? (error as { code?: unknown }).code
	if (typeof value === 'number') return value
	if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value)
	return undefined
}

function getRawMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	try {
		return JSON.stringify(error)
	} catch {
		return String(error)
	}
}

function hasAny(message: string, patterns: string[]): boolean {
	return patterns.some((pattern) => message.includes(pattern))
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: provider diagnostics require an ordered match so specific policy/model/quota errors win over generic 403/404 responses.
export function classifyVertexError(error: unknown): VertexErrorCategory | undefined {
	if (!isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) return undefined

	const raw = getRawMessage(error)
	const message = raw.toLowerCase()
	const status = getStatus(error)
	const code =
		error && typeof error === 'object' && 'code' in error
			? String((error as { code?: unknown }).code)
			: ''

	if (code === 'VERTEX_PROJECT_MISSING' || code === 'VERTEX_PROJECT_INVALID') {
		return 'configuration'
	}
	if (code === 'VERTEX_REGION_INVALID') return 'region'
	if (code === 'VERTEX_ADC_UNAVAILABLE') return 'adc'

	if (
		hasAny(message, [
			'organization policy',
			'org policy',
			'violates constraint',
			'policy denied',
			'denied by policy',
			'vpc service controls',
			'service perimeter',
			'security policy',
		])
	) {
		return 'organization_policy'
	}

	if (
		status === 429 ||
		hasAny(message, [
			'resource_exhausted',
			'quota exceeded',
			'quota failure',
			'rate limit exceeded',
			'provisioned throughput',
		])
	) {
		return 'quota'
	}

	if (
		hasAny(message, [
			'aiplatform.googleapis.com has not been used',
			'aiplatform.googleapis.com is disabled',
			'vertex ai api has not been used',
			'service_disabled',
			'accessnotconfigured',
		])
	) {
		return 'api_disabled'
	}

	if (
		hasAny(message, [
			'could not load the default credentials',
			'application default credentials',
			'could not refresh access token',
			'invalid_grant',
			'metadata server',
			'unable to detect a project id',
		]) ||
		status === 401
	) {
		return 'adc'
	}

	if (
		hasAny(message, [
			'not available in location',
			'not available in region',
			'unsupported region',
			'unsupported location',
			'location is not supported',
			'invalid location',
		])
	) {
		return 'region'
	}

	if (
		hasAny(message, [
			'publisher model',
			'model is not enabled',
			'model is not available',
			'does not have access to the model',
			'model garden',
			'marketplace',
			'model not found',
		]) ||
		status === 404
	) {
		return 'model_access'
	}

	if (
		status === 403 ||
		hasAny(message, [
			'permission_denied',
			'permission denied',
			'does not have permission',
			'aiplatform.endpoints.predict',
			'serviceusage.services.use',
			'iam permission',
		])
	) {
		return 'iam'
	}

	return undefined
}

function context(model: string): string {
	const project = getConfiguredVertexProjectId() ?? 'ADC/default project'
	const region = getVertexRegionForModel(model) ?? 'us-east5'
	return `project=${project}, region=${region}, model=${model}`
}

function compactDetail(error: unknown): string {
	const detail = getRawMessage(error)
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
		.replace(
			/\b(authorization|access[_-]?token|api[_-]?key)\b\s*[:=]\s*[^,}\s]+/gi,
			'$1=[redacted]',
		)
		.replace(/\s+/g, ' ')
		.trim()
	return detail.length > 700 ? `${detail.slice(0, 697)}...` : detail
}

export function getVertexErrorDiagnostic(
	error: unknown,
	model: string,
): VertexErrorDiagnostic | undefined {
	const category = classifyVertexError(error)
	if (!category) return undefined

	const detail = compactDetail(error)
	const suffix = detail ? ` Google response: ${detail}` : ''
	const runtime = context(model)

	switch (category) {
		case 'configuration':
			return {
				category,
				message: `Vertex AI configuration error · ${runtime}. Set ANTHROPIC_VERTEX_PROJECT_ID to the target Google Cloud project.${suffix}`,
			}
		case 'adc':
			return {
				category,
				message: `Vertex AI ADC authentication failed · ${runtime}. Configure GOOGLE_APPLICATION_CREDENTIALS, run \`gcloud auth application-default login\`, or attach a service account to the workload.${suffix}`,
			}
		case 'api_disabled':
			return {
				category,
				message: `Vertex AI API is disabled · ${runtime}. Enable aiplatform.googleapis.com in the target project and ensure the caller can use the service.${suffix}`,
			}
		case 'iam':
			return {
				category,
				message: `Vertex AI IAM denied the request · ${runtime}. Grant the active ADC principal roles/aiplatform.user, or a custom role containing aiplatform.endpoints.predict; ADC user quota projects may also require serviceusage.services.use.${suffix}`,
			}
		case 'region':
			return {
				category,
				message: `Vertex AI region rejected the request · ${runtime}. Select a region where this exact Anthropic publisher model is available using CLOUD_ML_REGION or its VERTEX_REGION_* override.${suffix}`,
			}
		case 'model_access':
			return {
				category,
				message: `Vertex AI model access failed · ${runtime}. Enable the Anthropic model in Model Garden/Marketplace, verify the exact Vertex model ID and confirm that it is offered in the selected region.${suffix}`,
			}
		case 'organization_policy':
			return {
				category,
				message: `Google Cloud organization policy blocked Vertex AI · ${runtime}. Ask the organization administrator to review organization-policy, VPC Service Controls, Assured Workloads, and Marketplace procurement constraints.${suffix}`,
			}
		case 'quota':
			return {
				category,
				message: `Vertex AI quota or capacity rejected the request · ${runtime}. Check the project's Vertex AI partner-model quota, regional capacity, and Provisioned Throughput configuration.${suffix}`,
			}
	}
}
