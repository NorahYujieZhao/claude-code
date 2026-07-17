import type { GoogleAuth } from 'google-auth-library'
import { getVertexRegionForModel, isEnvTruthy } from '../../utils/envUtils.js'

const GOOGLE_CLOUD_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const ADC_PREFLIGHT_TIMEOUT_MS = 10_000

export type VertexConfigurationErrorCode =
	| 'VERTEX_PROJECT_MISSING'
	| 'VERTEX_PROJECT_INVALID'
	| 'VERTEX_REGION_INVALID'
	| 'VERTEX_ADC_UNAVAILABLE'

export class VertexConfigurationError extends Error {
	readonly code: VertexConfigurationErrorCode

	constructor(code: VertexConfigurationErrorCode, message: string, options?: { cause?: unknown }) {
		super(message, options)
		this.name = 'VertexConfigurationError'
		this.code = code
	}
}

export type VertexRuntimeConfig = {
	projectId: string
	region: string
	googleAuth: GoogleAuth
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
	return values.find((value) => value?.trim())?.trim()
}

/**
 * Resolve the target Vertex project without changing Google's ADC lookup order.
 * ANTHROPIC_VERTEX_PROJECT_ID is the documented explicit target; the standard
 * Google project variables are accepted as compatibility fallbacks.
 */
export function getConfiguredVertexProjectId(): string | undefined {
	return firstNonEmpty(
		process.env.ANTHROPIC_VERTEX_PROJECT_ID,
		process.env.GOOGLE_CLOUD_PROJECT,
		process.env.GCLOUD_PROJECT,
	)
}

function validateProjectId(projectId: string): void {
	// Accept legacy domain-scoped IDs while rejecting values that could alter a
	// resource path. Google remains the authority for full project validation.
	if (!/^[a-z0-9][a-z0-9:.-]*$/i.test(projectId)) {
		throw new VertexConfigurationError(
			'VERTEX_PROJECT_INVALID',
			`Invalid Vertex AI project ID "${projectId}". Set ANTHROPIC_VERTEX_PROJECT_ID to a Google Cloud project ID, not a display name or resource path.`,
		)
	}
}

function resolveRegion(model: string | undefined): string {
	const region = getVertexRegionForModel(model)?.trim() || 'us-east5'
	if (region !== 'global' && !/^[a-z]+(?:-[a-z0-9]+)+\d$/.test(region)) {
		throw new VertexConfigurationError(
			'VERTEX_REGION_INVALID',
			`Invalid Vertex AI region "${region}". Set CLOUD_ML_REGION or the model-specific VERTEX_REGION_* variable to a Google Cloud region such as us-east5.`,
		)
	}
	return region
}

function adcFailureMessage(error: unknown): string {
	const detail = error instanceof Error ? error.message : String(error)
	return `Google Application Default Credentials are unavailable or could not issue an access token. Set GOOGLE_APPLICATION_CREDENTIALS to an ADC-compatible credential file, run \`gcloud auth application-default login\` for local development, or attach a service account to the Google Cloud workload. Credential detail: ${detail}`
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(
				new Error(
					`ADC lookup timed out after ${timeoutMs}ms; no usable local ADC or Google metadata-server credential was found`,
				),
			)
		}, timeoutMs)
	})
	try {
		return await Promise.race([promise, timeout])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

/**
 * Build the standard Vertex authentication context used by AnthropicVertex.
 * This performs an ADC preflight so credential failures are distinguished from
 * IAM, model, region, organization-policy, and quota errors returned by Vertex.
 */
export async function createVertexRuntimeConfig(
	model: string | undefined,
): Promise<VertexRuntimeConfig> {
	const region = resolveRegion(model)
	const configuredProjectId = getConfiguredVertexProjectId()

	if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
		try {
			const { refreshGcpCredentialsIfNeeded } = await import('../../utils/auth.js')
			await refreshGcpCredentialsIfNeeded()
		} catch (error) {
			throw new VertexConfigurationError('VERTEX_ADC_UNAVAILABLE', adcFailureMessage(error), {
				cause: error,
			})
		}
	}

	const { GoogleAuth } = await import('google-auth-library')

	if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
		if (!configuredProjectId) {
			throw new VertexConfigurationError(
				'VERTEX_PROJECT_MISSING',
				'ANTHROPIC_VERTEX_PROJECT_ID is required when CLAUDE_CODE_SKIP_VERTEX_AUTH is enabled because the project cannot be discovered from ADC.',
			)
		}
		validateProjectId(configuredProjectId)
		return {
			projectId: configuredProjectId,
			region,
			googleAuth: {
				getClient: () =>
					Promise.resolve({
						getRequestHeaders: () => Promise.resolve({}),
					}),
			} as unknown as GoogleAuth,
		}
	}

	const googleAuth = new GoogleAuth({
		scopes: [GOOGLE_CLOUD_SCOPE],
		...(configuredProjectId ? { projectId: configuredProjectId } : {}),
	})

	let projectId = configuredProjectId
	try {
		await withTimeout(
			(async () => {
				const authClient = await googleAuth.getClient()
				const accessToken = await authClient.getAccessToken()
				if (!accessToken.token) {
					throw new Error('Google ADC returned no access token')
				}
				projectId ??= await googleAuth.getProjectId()
			})(),
			ADC_PREFLIGHT_TIMEOUT_MS,
		)
	} catch (error) {
		throw new VertexConfigurationError('VERTEX_ADC_UNAVAILABLE', adcFailureMessage(error), {
			cause: error,
		})
	}

	if (!projectId) {
		throw new VertexConfigurationError(
			'VERTEX_PROJECT_MISSING',
			'Vertex AI target project could not be resolved. Set ANTHROPIC_VERTEX_PROJECT_ID explicitly, or configure a project in Google ADC.',
		)
	}
	validateProjectId(projectId)

	return { projectId, region, googleAuth }
}
