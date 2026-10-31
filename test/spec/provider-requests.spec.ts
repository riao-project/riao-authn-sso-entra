import 'jasmine';
import { Database } from '@riao/dbal';
import { Principal } from '@riao/iam';
import {
	ProviderAuthenticationRejectedError,
} from '@riao/authn-sso';
import { EntraAuthentication } from '../../src/authentication-entra';

describe('Entra provider requests', () => {
	const db = { getQueryRepository: () => ({}) } as unknown as Database;
	const options = {
		db,
		clientId: 'client',
		clientSecret: 'secret',
		tenantId: 'tenant',
		redirectUri: 'https://example.com/callback',
		requestTimeoutMs: 25,
	};
	let auth: EntraAuthentication<Principal>;

	beforeEach(() => {
		auth = new EntraAuthentication(options);
	});

	it('uses the configured timeout for all provider requests', async () => {
		const timeoutSpy = spyOn(AbortSignal, 'timeout').and.callThrough();
		const fetchSpy = spyOn(global, 'fetch').and.resolveTo(
			new Response(JSON.stringify({
				access_token: 'token',
				expires_in: 3600,
			}))
		);
		await auth.exchangeAuthorizationCode('code');
		expect(fetchSpy.calls.mostRecent().args[1]?.signal).toBeDefined();
		expect(timeoutSpy).toHaveBeenCalledTimes(1);
		expect(timeoutSpy.calls.mostRecent().args[0]).toBe(25);

		fetchSpy.and.resolveTo(new Response(JSON.stringify({
			id: 'id',
			userPrincipalName: 'user@example.com',
		})));
		await auth['getUserInfo']('token');
		expect(fetchSpy.calls.mostRecent().args[1]?.signal).toBeDefined();
		expect(timeoutSpy).toHaveBeenCalledTimes(2);
		expect(timeoutSpy.calls.mostRecent().args[0]).toBe(25);

		fetchSpy.and.resolveTo(new Response(JSON.stringify({
			access_token: 'refreshed-token',
			expires_in: 3600,
		})));
		await auth['exchangeRefreshToken']('refresh-token');
		expect(fetchSpy.calls.mostRecent().args[1]?.signal).toBeDefined();
		expect(timeoutSpy.calls.mostRecent().args[0]).toBe(25);
		expect(timeoutSpy).toHaveBeenCalledTimes(3);
	});

	it('classifies expected provider rejections', async () => {
		spyOn(global, 'fetch').and.resolveTo(new Response(JSON.stringify({
			error: 'invalid_grant',
			error_description: 'secret-token',
		}), { status: 400 }));

		await expectAsync(auth.exchangeAuthorizationCode('code'))
			.toBeRejectedWithError(ProviderAuthenticationRejectedError);
	});

	it(
		'rejects malformed provider responses before trusting them',
		async () => {
			const fetchSpy = spyOn(global, 'fetch').and.resolveTo(
				new Response(JSON.stringify({
					access_token: 'token',
					expires_in: '3600',
				}))
			);
			await expectAsync(auth.exchangeAuthorizationCode('code'))
				.toBeRejectedWithError('Malformed provider token response');

			fetchSpy.and.resolveTo(new Response(JSON.stringify({ id: 123 })));
			await expectAsync(auth['getUserInfo']('token'))
				.toBeRejectedWithError('Malformed provider user response');
		}
	);
});
