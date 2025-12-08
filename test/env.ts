import { AppConfig, configure } from 'ts-appconfig';

/**
 * Test environment configuration with strong typing
 * Provides test-specific configuration for Entra authentication tests
 */
class TestEnvironment extends AppConfig {
	// Entra OAuth credentials
	// For unit tests: defaults to test values
	// For integration tests: must be set via environment variables or .env.test
	readonly ENTRA_CLIENT_ID: string = 'test-client-id';
	readonly ENTRA_CLIENT_SECRET: string = 'test-client-secret';
	readonly ENTRA_TENANT_ID: string = 'test-tenant-id';

	// Entra OAuth configuration
	readonly ENTRA_REDIRECT_URI: string = 'https://localhost:3000/callback';

	// Test database configuration
	readonly TEST_DATABASE_NAME: string = 'entra_test_db';

	// Integration test configuration
	// Set ENABLE_INTEGRATION_TESTS=true to run real Entra ID tests
	readonly ENABLE_INTEGRATION_TESTS: boolean = false;

	// Test user credentials for integration tests
	// Format: user@tenant.onmicrosoft.com
	readonly ENTRA_TEST_USER_UPNAME: string = '';

	// Test user password for integration tests
	readonly ENTRA_TEST_USER_PASSWORD: string = '';

	// Test mode indicator
	override NODE_ENV: string = 'test';
}

/**
 * Configured test environment with variables loaded from .env.test,
 * process.env (overrides), and defaults
 */
export const testEnv = configure(TestEnvironment, {
	relativePath: './.env.test',
});
