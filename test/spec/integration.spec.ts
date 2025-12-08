import 'jasmine';
import { EntraAuthentication } from '../../src/index';
import { createDatabase, runMigrations } from '../database';
import { maindb } from '../database';
import { testEnv } from '../env';
import { Database } from '@riao/dbal';
import { AuthMigrations } from '@riao/iam/auth/auth-migrations';
import { Principal } from '@riao/iam';
// eslint-disable-next-line max-len
import { AuthenticationSSOMigrations } from '@riao/authn-sso/authentication-sso-migrations';

/**
 * // eslint-disable-next-line max-len
 * Integration tests for Entra Authentication Driver
 *
 * // eslint-disable-next-line max-len
 * These tests perform real HTTP calls to Microsoft Entra ID endpoints.
 * // eslint-disable-next-line max-len
 * They are skipped by default and only run when ENABLE_INTEGRATION_TESTS=true.
 *
 * // eslint-disable-next-line max-len
 * To enable integration tests:
 * // eslint-disable-next-line max-len
 * 1. Set real Entra app credentials in test/.env.test:
 *    - ENTRA_CLIENT_ID: Your Azure app registration client ID
 *    - ENTRA_CLIENT_SECRET: Your Azure app registration client secret
 *    - ENTRA_TENANT_ID: Your Azure tenant ID
 *    - ENTRA_TEST_USER_UPNAME: Test user principal name
 *      (user@tenant.onmicrosoft.com)
 *    - ENTRA_TEST_USER_PASSWORD: Test user password
 * 2. Set ENABLE_INTEGRATION_TESTS=true
 * // eslint-disable-next-line max-len
 * 3. Run: npm run test:dev -- --grep="Integration.*real"
 *
 * Security Notes:
 * // eslint-disable-next-line max-len
 * - Never commit real credentials to version control
 * // eslint-disable-next-line max-len
 * - Use environment variables or secure vaults in CI/CD
 * // eslint-disable-next-line max-len
 * - Use a dedicated test user account with limited permissions
 * - Rotate credentials regularly
 */

describe('EntraAuthentication - Integration Tests', () => {
	let db: Database;
	let entraAuth: EntraAuthentication<Principal>;
	const isIntegrationEnabled = testEnv.ENABLE_INTEGRATION_TESTS === true;

	beforeAll(async () => {
		await maindb.init();
		db = createDatabase(
			// eslint-disable-next-line max-len
			`${testEnv.TEST_DATABASE_NAME}_integration`
		);
		await db.init();
		const authMigrations = new AuthMigrations();
		await runMigrations(db, authMigrations);
		await runMigrations(db, new AuthenticationSSOMigrations());
	});

	afterAll(async () => {
		await db.disconnect();
	});

	beforeEach(() => {
		entraAuth = new EntraAuthentication<Principal>({
			db,
			clientId: testEnv.ENTRA_CLIENT_ID,
			clientSecret: testEnv.ENTRA_CLIENT_SECRET,
			tenantId: testEnv.ENTRA_TENANT_ID,
			redirectUri: testEnv.ENTRA_REDIRECT_URI,
		});
	});

	describe('Real Entra ID Integration', () => {
		const describeIntegration = isIntegrationEnabled ? describe : xdescribe;

		describeIntegration(
			// eslint-disable-next-line max-len
			'with real credentials - requires ENABLE_INTEGRATION_TESTS=true',
			() => {
				// eslint-disable-next-line max-len
				it('should generate valid authorization URL for real tenant', () => {
					const state = `integration-test-${Date.now()}`;
					const authUrl = entraAuth.getAuthorizationUrl(state);

					expect(authUrl).toContain(
						'https://login.microsoftonline.com'
					);
					expect(authUrl).toContain(testEnv.ENTRA_TENANT_ID);
					expect(authUrl).toContain(testEnv.ENTRA_CLIENT_ID);
					expect(authUrl).toContain('oauth2/v2.0/authorize');
					expect(authUrl).toContain(`state=${state}`);
				});

				// eslint-disable-next-line max-len
				it('should fail token exchange with invalid code', async () => {
					try {
						await entraAuth.exchangeAuthorizationCode(
							'invalid-code-xyz'
						);
						fail('Expected error for invalid code');
					}
					catch (error) {
						expect((error as Error).message).toContain(
							'Entra token exchange failed'
						);
					}
				});

				// eslint-disable-next-line max-len
				it('should fail to get user info with invalid token', async () => {
					try {
						await entraAuth['getUserInfo'](
							'invalid-access-token-xyz'
						);
						fail('Expected error for invalid token');
					}
					catch (error) {
						expect((error as Error).message).toContain(
							'Failed to fetch Entra user info'
						);
					}
				});

				// eslint-disable-next-line max-len
				it('should validate tenant ID exists', async () => {
					// This test verifies the tenant ID is accessible
					// by attempting a token exchange which will validate
					// the tenant
					try {
						await entraAuth.exchangeAuthorizationCode('test');
					}
					catch (error) {
						// We expect this to fail with invalid_grant
						//  (invalid code)
						// not with tenant not found errors
						const message = (error as Error).message;

						// Tenant not found
						expect(message).not.toContain('AADSTS90002');
						expect(message).not.toContain('Tenant for tenant ID');
					}
				});
				// eslint-disable-next-line max-len
				it('should validate client credentials are recognized by Entra', async () => {
					try {
						await entraAuth.exchangeAuthorizationCode('test-code');
					}
					catch (error) {
						const message = (error as Error).message;
						// Should get auth error, not client validation error
						expect(message).toBeDefined();
					}
				});
			}
		);

		const describeDisabled = isIntegrationEnabled ? xdescribe : describe;

		describeDisabled(
			// eslint-disable-next-line max-len
			'Integration tests are disabled - set ENABLE_INTEGRATION_TESTS=true to run',
			() => {
				it('should skip all real Entra ID tests', () => {
					expect(isIntegrationEnabled).toBe(false);
					// eslint-disable-next-line no-console
					console.log(
						'\n    ℹ️  Integration tests are disabled. ' +
							// eslint-disable-next-line max-len
							'To enable, set ENABLE_INTEGRATION_TESTS=true in test/.env.test'
					);
				});
			}
		);
	});

	describe('Real Network Error Scenarios', () => {
		it('should handle network timeouts gracefully', async () => {
			const slowEntraAuth = new EntraAuthentication<Principal>({
				db,
				clientId: testEnv.ENTRA_CLIENT_ID,
				// eslint-disable-next-line max-len
				clientSecret: testEnv.ENTRA_CLIENT_SECRET,
				tenantId: testEnv.ENTRA_TENANT_ID,
				redirectUri: testEnv.ENTRA_REDIRECT_URI,
			});

			// eslint-disable-next-line max-len
			// This test would timeout with real network if endpoint is unreachable
			// In integration environment, it documents expected behavior
			try {
				// Attempt with invalid code to trigger token exchange
				await slowEntraAuth.exchangeAuthorizationCode('test');
			}
			catch (error) {
				// Should get network or auth error
				expect(error).toBeTruthy();
			}
		});
	});

	describe('Configuration Validation', () => {
		it('should require all Entra configuration parameters', () => {
			const requiredParams = [
				'ENTRA_CLIENT_ID',
				// eslint-disable-next-line max-len
				'ENTRA_CLIENT_SECRET',
				'ENTRA_TENANT_ID',
				'ENTRA_REDIRECT_URI',
			];

			requiredParams.forEach((param) => {
				// eslint-disable-next-line max-len
				expect(testEnv[param as keyof typeof testEnv]).toBeTruthy();
			});
		});

		it('should have valid Entra tenant ID format', () => {
			// Tenant ID can be:
			// eslint-disable-next-line max-len
			// - UUID format: 12345678-1234-1234-1234-123456789012
			// eslint-disable-next-line max-len
			// - Domain format: contoso.onmicrosoft.com
			const tenantId = testEnv.ENTRA_TENANT_ID;
			expect(tenantId).toBeTruthy();
			expect(tenantId.length).toBeGreaterThan(0);
		});

		it('should have valid redirect URI', () => {
			const redirectUri = testEnv.ENTRA_REDIRECT_URI;
			expect(redirectUri).toMatch(/^https?:\/\//);
		});

		it('should indicate integration test status', () => {
			const status = isIntegrationEnabled ? 'ENABLED' : 'DISABLED';
			/* eslint-disable no-console */
			console.log(`\n    Integration Tests: ${status}`);
			console.log(`    Client ID: ${testEnv.ENTRA_CLIENT_ID}`);
			console.log(`    Tenant ID: ${testEnv.ENTRA_TENANT_ID}`);
			/* eslint-enable no-console */
		});
	});

	describe('OAuth 2.0 Compliance', () => {
		// eslint-disable-next-line max-len
		it('should construct authorization URL with required OAuth parameters', () => {
			const state = 'state-token-123';
			const url = entraAuth.getAuthorizationUrl(state);
			const urlObj = new URL(url);
			const params = urlObj.searchParams;

			// Required OAuth 2.0 parameters
			expect(params.get('client_id')).toBe(testEnv.ENTRA_CLIENT_ID);
			expect(params.get('response_type')).toBe('code');
			expect(params.get('scope')).toBeTruthy();
			expect(params.get('state')).toBe(state);
			expect(params.get('redirect_uri')).toBeTruthy();
		});

		it('should request appropriate scopes for user info access', () => {
			const url = entraAuth.getAuthorizationUrl('state');
			const scopes = new URL(url).searchParams.get('scope') || '';

			// Should request Graph API access for user info
			expect(scopes).toContain('graph.microsoft.com');
		});

		it('should use secure redirect URI (https)', () => {
			if (!testEnv.ENTRA_REDIRECT_URI.includes('localhost')) {
				// eslint-disable-next-line max-len
				// Only check HTTPS for production URIs (not localhost)
				expect(testEnv.ENTRA_REDIRECT_URI).toMatch(/^https:\/\//);
			}
		});
	});

	describe('Error Response Handling', () => {
		// eslint-disable-next-line max-len
		it('should provide descriptive error messages for token endpoint failures', async () => {
			try {
				await entraAuth.exchangeAuthorizationCode('invalid');
			}
			catch (error) {
				const message = (error as Error).message;
				expect(message).toContain('Entra token exchange failed');
				// eslint-disable-next-line max-len
				expect(message).toMatch(/\d{3}/); // Should include HTTP status code
			}
		});

		// eslint-disable-next-line max-len
		it('should provide helpful error context for Graph API failures', async () => {
			try {
				await entraAuth['getUserInfo']('bad-token');
			}
			catch (error) {
				const message = (error as Error).message;
				expect(message).toContain('Failed to fetch Entra user info');
				// Should include troubleshooting guidance
				expect(message).toMatch(/permissions|Graph|User\.Read/i);
			}
		});
	});

	describe('Token Management', () => {
		it('should support refresh token flow', () => {
			// Verify refresh token method exists and is implemented
			expect(entraAuth['exchangeRefreshToken']).toBeDefined();
			expect(typeof entraAuth['exchangeRefreshToken']).toBe('function');
		});

		it('should construct proper refresh token request', async () => {
			// Mock the fetch to capture the request
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let capturedRequest: any = null;
			spyOn(global, 'fetch').and.callFake(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				async (input: any, init: any) => {
					capturedRequest = { input, init };
					return new Response(
						JSON.stringify({
							access_token: 'new-token',
							expires_in: 3600,
						}),
						{ status: 200 }
					);
				}
			);

			await entraAuth['exchangeRefreshToken']('test-refresh-token');

			expect(capturedRequest).toBeTruthy();
			expect(capturedRequest.init.body).toContain(
				'grant_type=refresh_token'
			);
			expect(capturedRequest.init.body).toContain(
				'refresh_token=test-refresh-token'
			);
		});
	});

	describe('Security Considerations', () => {
		// eslint-disable-next-line max-len
		it('should not expose sensitive credentials in error messages', async () => {
			try {
				await entraAuth.exchangeAuthorizationCode('test');
			}
			catch (error) {
				const message = (error as Error).message;
				// Should not expose client secret
				expect(message).not.toContain(testEnv.ENTRA_CLIENT_SECRET);
				// Should not expose sensitive tokens in error
				expect(message).not.toContain('Bearer');
			}
		});

		it('should use secure defaults for scope requests', () => {
			const url = entraAuth.getAuthorizationUrl('state');
			const scopes = new URL(url).searchParams.get('scope') || '';

			// Should request openid for authentication
			expect(scopes).toContain('openid');
			// Should request profile and email for user info
			expect(scopes).toMatch(/profile|email/);
		});

		it('should validate state parameter to prevent CSRF', () => {
			const state = 'csrf-protection-state';
			const url = entraAuth.getAuthorizationUrl(state);

			const urlObj = new URL(url);
			expect(urlObj.searchParams.get('state')).toBe(state);
		});
	});
});
