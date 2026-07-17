import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { classifyVertexError, getVertexErrorDiagnostic } from './vertexErrors.js'

const originalUseVertex = process.env.CLAUDE_CODE_USE_VERTEX
const originalProject = process.env.ANTHROPIC_VERTEX_PROJECT_ID
const originalRegion = process.env.CLOUD_ML_REGION

describe('Vertex AI error diagnostics', () => {
	beforeEach(() => {
		process.env.CLAUDE_CODE_USE_VERTEX = '1'
		process.env.ANTHROPIC_VERTEX_PROJECT_ID = 'test-project'
		process.env.CLOUD_ML_REGION = 'us-east5'
	})

	afterEach(() => {
		setOrDelete('CLAUDE_CODE_USE_VERTEX', originalUseVertex)
		setOrDelete('ANTHROPIC_VERTEX_PROJECT_ID', originalProject)
		setOrDelete('CLOUD_ML_REGION', originalRegion)
	})

	test.each([
		[403, 'PERMISSION_DENIED: aiplatform.endpoints.predict', 'iam'],
		[403, 'request violates constraint organization policy', 'organization_policy'],
		[404, 'publisher model is not enabled', 'model_access'],
		[400, 'model is not available in region', 'region'],
		[429, 'RESOURCE_EXHAUSTED: quota exceeded', 'quota'],
	] as const)('classifies %s %s as %s', (status, message, category) => {
		expect(classifyVertexError(Object.assign(new Error(message), { status }))).toBe(category)
	})

	test('includes runtime context and redacts credentials', () => {
		const error = Object.assign(new Error('PERMISSION_DENIED authorization: Bearer secret-token'), {
			status: 403,
		})
		const diagnostic = getVertexErrorDiagnostic(error, 'claude-sonnet-4-5')

		expect(diagnostic?.message).toContain('project=test-project')
		expect(diagnostic?.message).toContain('region=us-east5')
		expect(diagnostic?.message).toContain('authorization=[redacted]')
		expect(diagnostic?.message).not.toContain('secret-token')
	})
})

function setOrDelete(name: string, value: string | undefined): void {
	if (value === undefined) Reflect.deleteProperty(process.env, name)
	else process.env[name] = value
}
