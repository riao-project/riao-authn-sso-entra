import 'jasmine';
import {
	EntraAuthentication,
	EntraAuthenticationOptions,
} from '../../src/index';
import { createDatabase, runMigrations } from '../database';
import { maindb } from '../database';
import { testEnv } from '../env';
import { Database } from '@riao/dbal';
import { AuthMigrations } from '@riao/iam/auth/auth-migrations';
import { Principal } from '@riao/iam';

describe('EntraAuthentication', () => {
	let db: Database;
	let entraAuth: EntraAuthentication<Principal>;

	const mockEntraOptions: EntraAuthenticationOptions = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		db: null as any,
		clientId: testEnv.ENTRA_CLIENT_ID,
		clientSecret: testEnv.ENTRA_CLIENT_SECRET,
		tenantId: testEnv.ENTRA_TENANT_ID,
		redirectUri: testEnv.ENTRA_REDIRECT_URI,
		scopes: [
			'openid',
			'profile',
			'email',
			'https://graph.microsoft.com/.default',
		],
	};

	beforeAll(async () => {
		await maindb.init();
		db = createDatabase(testEnv.TEST_DATABASE_NAME);
		await db.init();
		const authMigrations = new AuthMigrations();
		await runMigrations(db, authMigrations);
	});

	afterAll(async () => {
		await db.disconnect();
	});

	beforeEach(() => {
		entraAuth = new EntraAuthentication<Principal>({
			...mockEntraOptions,
			db,
		});
	});

	describe('Constructor', () => {
		it('should initialize with provided options', () => {
			expect(entraAuth['clientId']).toBe(testEnv.ENTRA_CLIENT_ID);
			expect(entraAuth['clientSecret']).toBe(testEnv.ENTRA_CLIENT_SECRET);
			expect(entraAuth['tenantId']).toBe(testEnv.ENTRA_TENANT_ID);
			expect(entraAuth['redirectUri']).toBe(testEnv.ENTRA_REDIRECT_URI);
		});

		it('should set default scopes when not provided', () => {
			const authWithoutScopes = new EntraAuthentication<Principal>({
				db,
				clientId: 'client-id',
				clientSecret: 'client-secret',
				tenantId: 'tenant-id',
				redirectUri: 'https://localhost:3000/callback',
			});

			expect(authWithoutScopes['scopes']).toEqual([
				'openid',
				'profile',
				'email',
				'https://graph.microsoft.com/.default',
			]);
		});

		it('should set custom scopes when provided', () => {
			const customScopes = ['openid', 'custom-scope'];
			const authWithCustomScopes = new EntraAuthentication<Principal>({
				...mockEntraOptions,
				db,
				scopes: customScopes,
			});

			expect(authWithCustomScopes['scopes']).toEqual(customScopes);
		});

		it('should set provider to "entra"', () => {
			expect(entraAuth['provider']).toBe('entra');
		});
	});

	describe('getAuthorizationUrl', () => {
		it('should generate valid authorization URL', () => {
			const state = 'test-state-123';
			const url = entraAuth.getAuthorizationUrl(state);

			expect(url).toContain('https://login.microsoftonline.com');
			expect(url).toContain(
				`/${testEnv.ENTRA_TENANT_ID}/oauth2/v2.0/authorize`
			);
			expect(url).toContain(`client_id=${testEnv.ENTRA_CLIENT_ID}`);
			expect(url).toContain(
				`redirect_uri=${encodeURIComponent(testEnv.ENTRA_REDIRECT_URI)}`
			);
			expect(url).toContain('response_type=code');
			expect(url).toContain('scope=openid');
			expect(url).toContain('profile');
			expect(url).toContain('email');
			expect(url).toContain('state=test-state-123');
		});

		it('should include all scopes in authorization URL', () => {
			const url = entraAuth.getAuthorizationUrl('state');

			expect(url).toContain('openid');
			expect(url).toContain('profile');
			expect(url).toContain('email');
			expect(url).toContain(
				'https%3A%2F%2Fgraph.microsoft.com%2F.default'
			);
		});

		it('should properly encode state parameter', () => {
			const specialState = 'state-with-!@#$%^&*()';
			const url = entraAuth.getAuthorizationUrl(specialState);

			// URLSearchParams automatically encodes the parameter
			const params = new URL(url).searchParams;
			expect(params.get('state')).toBe(specialState);
		});

		it('should use tenant ID in URL construction', () => {
			// eslint-disable-next-line max-len
			const authWithDifferentTenant = new EntraAuthentication<Principal>({
				...mockEntraOptions,
				db,
				tenantId: 'different-tenant-id',
			});

			const url = authWithDifferentTenant.getAuthorizationUrl('state');

			expect(url).toContain('/different-tenant-id/oauth2/v2.0/authorize');
		});
	});

	describe('getAuthorizationParams', () => {
		it('should return correct authorization parameters', () => {
			const state = 'test-state';
			const params = entraAuth['getAuthorizationParams'](state);

			expect(params['client_id']).toBe(testEnv.ENTRA_CLIENT_ID);
			expect(params['redirect_uri']).toBe(testEnv.ENTRA_REDIRECT_URI);
			expect(params['response_type']).toBe('code');
			expect(params['state']).toBe('test-state');
			expect(params['scope']).toContain('openid');
		});

		it('should join multiple scopes with spaces', () => {
			const customScopes = ['scope1', 'scope2', 'scope3'];
			const authWithCustom = new EntraAuthentication<Principal>({
				...mockEntraOptions,
				db,
				scopes: customScopes,
			});

			const params = authWithCustom['getAuthorizationParams']('state');

			expect(params['scope']).toBe('scope1 scope2 scope3');
		});
	});

	describe('exchangeAuthorizationCode', () => {
		// eslint-disable-next-line max-len
		it('should successfully exchange authorization code for tokens', async () => {
			const mockResponse = {
				access_token: 'mock-access-token',
				refresh_token: 'mock-refresh-token',
				expires_in: 3600,
				token_type: 'Bearer',
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockResponse), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			const result =
				await entraAuth.exchangeAuthorizationCode('test-code');

			expect(result).toEqual(mockResponse);
			expect(global.fetch).toHaveBeenCalledWith(
				// eslint-disable-next-line max-len
				`https://login.microsoftonline.com/${testEnv.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
				jasmine.objectContaining({
					method: 'POST',
					headers: jasmine.objectContaining({
						// eslint-disable-next-line max-len
						'Content-Type': 'application/x-www-form-urlencoded',
					}),
				})
			);
		});

		// eslint-disable-next-line max-len
		it('should include correct parameters in token exchange request', async () => {
			const mockResponse = {
				access_token: 'mock-access-token',
				refresh_token: 'mock-refresh-token',
				expires_in: 3600,
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockResponse), {
						status: 200,
					})
				)
			);

			await entraAuth.exchangeAuthorizationCode('test-code');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			const body = fetchCall.args[1].body;

			expect(body).toContain(`client_id=${testEnv.ENTRA_CLIENT_ID}`);
			expect(body).toContain(
				`client_secret=${testEnv.ENTRA_CLIENT_SECRET}`
			);
			expect(body).toContain('code=test-code');
			expect(body).toContain(
				`redirect_uri=${encodeURIComponent(testEnv.ENTRA_REDIRECT_URI)}`
			);
			expect(body).toContain('grant_type=authorization_code');
		});

		it('should throw error when token exchange fails', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response('Unauthorized', {
						status: 401,
						statusText: 'Unauthorized',
					})
				)
			);

			try {
				await entraAuth.exchangeAuthorizationCode('invalid-code');
				fail('Expected error to be thrown');
			}
			catch (error) {
				expect(error).toBeTruthy();
				expect((error as Error).message).toContain(
					'Entra token exchange failed'
				);
				expect((error as Error).message).toContain('401');
			}
		});

		it('should handle network errors', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.reject(new Error('Network error'))
			);

			try {
				await entraAuth.exchangeAuthorizationCode('test-code');
				fail('Expected error to be thrown');
			}
			catch (error) {
				expect((error as Error).message).toBe('Network error');
			}
		});
	});

	describe('getUserInfo', () => {
		it('should fetch user info from Microsoft Graph API', async () => {
			const mockUserData = {
				id: 'entra-user-123',
				userPrincipalName: 'user@tenant.onmicrosoft.com',
				mail: 'user@example.com',
				displayName: 'Test User',
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockUserData), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			const userInfo =
				await entraAuth['getUserInfo']('mock-access-token');

			expect(userInfo.id).toBe('entra-user-123');
			expect(userInfo.login).toBe('user@tenant.onmicrosoft.com');
			expect(userInfo.name).toBe('Test User');
			expect(userInfo.type).toBe('user');
		});

		// eslint-disable-next-line max-len
		it('should use mail when userPrincipalName is not available', async () => {
			const mockUserData = {
				id: 'user-456',
				mail: 'user@example.com',
				displayName: 'Another User',
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockUserData), {
						status: 200,
					})
				)
			);

			const userInfo = await entraAuth['getUserInfo']('access-token');

			expect(userInfo.login).toBe('user@example.com');
		});

		it('should use displayName for name field', async () => {
			const mockUserData = {
				id: 'user-789',
				userPrincipalName: 'user@tenant.onmicrosoft.com',
				displayName: 'Display Name',
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockUserData), {
						status: 200,
					})
				)
			);

			const userInfo = await entraAuth['getUserInfo']('access-token');

			expect(userInfo.name).toBe('Display Name');
		});

		// eslint-disable-next-line max-len
		it('should fallback to mail for name when displayName is missing', async () => {
			const mockUserData = {
				id: 'user-101',
				userPrincipalName: 'user@tenant.onmicrosoft.com',
				mail: 'user@example.com',
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockUserData), {
						status: 200,
					})
				)
			);

			const userInfo = await entraAuth['getUserInfo']('access-token');

			expect(userInfo.name).toBe('user@tenant.onmicrosoft.com');
		});

		// eslint-disable-next-line max-len
		it('should include Authorization header with access token', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(
						JSON.stringify({
							id: 'user-123',
							userPrincipalName: 'user@tenant.onmicrosoft.com',
						}),
						{ status: 200 }
					)
				)
			);

			await entraAuth['getUserInfo']('my-access-token');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			expect(fetchCall.args[1].headers.Authorization).toBe(
				'Bearer my-access-token'
			);
		});

		it('should throw error when user info fetch fails', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response('Forbidden', {
						status: 403,
						statusText: 'Forbidden',
					})
				)
			);

			try {
				await entraAuth['getUserInfo']('invalid-token');
				fail('Expected error to be thrown');
			}
			catch (error) {
				expect((error as Error).message).toContain(
					'Failed to fetch Entra user info'
				);
				expect((error as Error).message).toContain('403');
				expect((error as Error).message).toContain(
					'Microsoft Graph permissions'
				);
			}
		});

		it('should query Microsoft Graph /me endpoint', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(
						JSON.stringify({
							id: 'user-123',
							userPrincipalName: 'user@tenant.onmicrosoft.com',
						}),
						{ status: 200 }
					)
				)
			);

			await entraAuth['getUserInfo']('access-token');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			expect(fetchCall.args[0]).toBe(
				'https://graph.microsoft.com/v1.0/me'
			);
		});
	});

	describe('exchangeRefreshToken', () => {
		it('should successfully refresh access token', async () => {
			const mockResponse = {
				access_token: 'new-access-token',
				refresh_token: 'new-refresh-token',
				expires_in: 3600,
			};

			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(JSON.stringify(mockResponse), {
						status: 200,
						headers: { 'Content-Type': 'application/json' },
					})
				)
			);

			const result =
				await entraAuth['exchangeRefreshToken']('old-refresh-token');

			expect(result).toEqual(mockResponse);
		});

		it('should include refresh_token in request body', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(
						JSON.stringify({
							access_token: 'new-token',
							expires_in: 3600,
						}),
						{ status: 200 }
					)
				)
			);

			await entraAuth['exchangeRefreshToken']('refresh-token-123');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			const body = fetchCall.args[1].body;

			expect(body).toContain('grant_type=refresh_token');
			expect(body).toContain('refresh_token=refresh-token-123');
		});

		it('should include client credentials in refresh request', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(
						JSON.stringify({
							access_token: 'new-token',
							expires_in: 3600,
						}),
						{ status: 200 }
					)
				)
			);

			await entraAuth['exchangeRefreshToken']('refresh-token');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			const body = fetchCall.args[1].body;

			expect(body).toContain(`client_id=${testEnv.ENTRA_CLIENT_ID}`);
			expect(body).toContain(
				`client_secret=${testEnv.ENTRA_CLIENT_SECRET}`
			);
		});

		it('should throw error when refresh fails', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response('Unauthorized', {
						status: 401,
						statusText: 'Unauthorized',
					})
				)
			);

			try {
				await entraAuth['exchangeRefreshToken'](
					'invalid-refresh-token'
				);
				fail('Expected error to be thrown');
			}
			catch (error) {
				expect((error as Error).message).toContain(
					'Entra token refresh failed'
				);
				expect((error as Error).message).toContain('401');
			}
		});

		it('should use correct token endpoint for refresh', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(
						JSON.stringify({
							access_token: 'new-token',
							expires_in: 3600,
						}),
						{ status: 200 }
					)
				)
			);

			await entraAuth['exchangeRefreshToken']('refresh-token');

			const fetchCall = (global.fetch as jasmine.Spy).calls.mostRecent();
			expect(fetchCall.args[0]).toBe(
				// eslint-disable-next-line max-len
				`https://login.microsoftonline.com/${testEnv.ENTRA_TENANT_ID}/oauth2/v2.0/token`
			);
		});
	});

	describe('Integration: Full OAuth flow', () => {
		it('should handle complete authentication flow', async () => {
			// This is a simplified integration test
			// In a real scenario, you would mock all external calls

			const mockTokenResponse = {
				access_token: 'access-123',
				refresh_token: 'refresh-123',
				expires_in: 3600,
			};

			const mockUserInfo = {
				id: 'entra-user-id',
				userPrincipalName: 'test@example.com',
				displayName: 'Test User',
			};

			spyOn(global, 'fetch').and.callFake(
				async (input: string | URL | Request) => {
					const url =
						input instanceof Request ? input.url : String(input);

					if (url.includes('/oauth2/v2.0/token')) {
						return Promise.resolve(
							new Response(JSON.stringify(mockTokenResponse), {
								status: 200,
							})
						);
					}

					if (url.includes('graph.microsoft.com')) {
						return Promise.resolve(
							new Response(JSON.stringify(mockUserInfo), {
								status: 200,
							})
						);
					}

					return Promise.reject(new Error('Unknown endpoint'));
				}
			);

			const tokenData =
				await entraAuth.exchangeAuthorizationCode('test-code');
			expect(tokenData.access_token).toBe('access-123');

			const userInfo = await entraAuth['getUserInfo'](
				tokenData.access_token
			);
			expect(userInfo.login).toBe('test@example.com');
		});
	});

	describe('Error handling', () => {
		// eslint-disable-next-line max-len
		it('should include detailed error message when Graph API call fails', async () => {
			const errorResponse = 'Invalid scope requested';
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response(errorResponse, {
						status: 400,
						statusText: 'Bad Request',
					})
				)
			);

			try {
				await entraAuth['getUserInfo']('bad-token');
				fail('Expected error');
			}
			catch (error) {
				expect((error as Error).message).toContain(
					'Failed to fetch Entra user info'
				);
				expect((error as Error).message).toContain('API permissions');
			}
		});

		it('should handle malformed JSON responses', async () => {
			spyOn(global, 'fetch').and.returnValue(
				Promise.resolve(
					new Response('invalid json', {
						status: 200,
					})
				)
			);

			try {
				await entraAuth.exchangeAuthorizationCode('code');
				fail('Expected error');
			}
			catch (error) {
				expect(error).toBeTruthy();
			}
		});
	});
});
