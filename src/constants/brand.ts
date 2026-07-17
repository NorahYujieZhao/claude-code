/**
 * User-facing branding for this fork.
 *
 * Upstream protocol identifiers (model IDs, headers, environment variables,
 * config paths, and MCP capability names) deliberately do not belong here.
 */
export const PRODUCT_NAME = 'yyyjie'
export const CLI_NAME = 'yyyjie'
export const PRODUCT_DESCRIPTION =
	'yyyjie - an AI coding assistant powered by Anthropic Claude models'

/** Keep the historical command available for existing scripts. */
export const LEGACY_CLI_NAME = 'claude'

/**
 * Authentication, routing, billing/quota, and required client metadata are
 * operational protocol data, not optional telemetry, and remain enabled.
 */
export const OPTIONAL_TELEMETRY_ENABLED = false
