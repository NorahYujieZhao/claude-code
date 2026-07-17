import { afterEach, describe, expect, test } from 'bun:test'
import { type VertexConfigurationError, createVertexRuntimeConfig } from './vertex.js'

const saved = {
	skip: process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH,
	project: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
	googleProject: process.env.GOOGLE_CLOUD_PROJECT,
	gcloudProject: process.env.GCLOUD_PROJECT,
	region: process.env.CLOUD_ML_REGION,
}

describe('Vertex AI runtime configuration', () => {
	afterEach(() => {
		setOrDelete('CLAUDE_CODE_SKIP_VERTEX_AUTH', saved.skip)
		setOrDelete('ANTHROPIC_VERTEX_PROJECT_ID', saved.project)
		setOrDelete('GOOGLE_CLOUD_PROJECT', saved.googleProject)
		setOrDelete('GCLOUD_PROJECT', saved.gcloudProject)
		setOrDelete('CLOUD_ML_REGION', saved.region)
	})

	test('builds a standard project and region context', async () => {
		process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH = '1'
		process.env.ANTHROPIC_VERTEX_PROJECT_ID = 'test-project'
		process.env.CLOUD_ML_REGION = 'us-east5'

		const config = await createVertexRuntimeConfig('claude-sonnet-4-5')

		expect(config.projectId).toBe('test-project')
		expect(config.region).toBe('us-east5')
		expect(await config.googleAuth.getClient()).toBeDefined()
	})

	test('requires an explicit project when proxy auth is skipped', async () => {
		process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH = '1'
		Reflect.deleteProperty(process.env, 'ANTHROPIC_VERTEX_PROJECT_ID')
		Reflect.deleteProperty(process.env, 'GOOGLE_CLOUD_PROJECT')
		Reflect.deleteProperty(process.env, 'GCLOUD_PROJECT')

		await expect(createVertexRuntimeConfig('claude-sonnet-4-5')).rejects.toMatchObject({
			code: 'VERTEX_PROJECT_MISSING',
		} satisfies Partial<VertexConfigurationError>)
	})

	test('rejects an invalid region before making a request', async () => {
		process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH = '1'
		process.env.ANTHROPIC_VERTEX_PROJECT_ID = 'test-project'
		process.env.CLOUD_ML_REGION = 'not/a/region'

		await expect(createVertexRuntimeConfig('claude-sonnet-4-5')).rejects.toMatchObject({
			code: 'VERTEX_REGION_INVALID',
		} satisfies Partial<VertexConfigurationError>)
	})
})

function setOrDelete(name: string, value: string | undefined): void {
	if (value === undefined) Reflect.deleteProperty(process.env, name)
	else process.env[name] = value
}
