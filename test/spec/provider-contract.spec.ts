import 'jasmine';
import { Database } from '@riao/dbal';
import { KeyPairGenerator } from '@riao/crypto';
import { Principal } from '@riao/iam';
import { NoopAuthenticationProtection } from '@riao/iam/authentication';
import { ProviderAuthenticationRejectedError } from '@riao/authn-sso';
import {
	EntraAuthentication,
} from '../../src';

describe('Entra provider contract (isolated)', () => {
	let auth: EntraAuthentication<Principal>;
	const db = { getQueryRepository: () => ({}) } as unknown as Database;
	const options = {
		db, clientId: 'client', clientSecret: 'secret', tenantId: 'tenant',
		redirectUri: 'https://example.com/callback',
	};

	beforeEach(() => {
		auth = new EntraAuthentication(options);
	});

	it('forwards inherited protection and encryption options', () => {
		const keys = new KeyPairGenerator({ algorithm: 'RS256' }).generate();
		const protection = new NoopAuthenticationProtection();
		auth = new EntraAuthentication({
			...options, stateExpiryMinutes: 2,
			authenticationProtection: protection,
			encryptionPublicKey: keys.publicKey,
			encryptionPrivateKey: keys.privateKey,
		});
		expect(auth['stateExpiryMinutes']).toBe(2);
		expect(auth['authenticationProtection']).toBe(protection);
		expect(auth['encryptor']).toBeDefined();
		expect(auth['decryptor']).toBeDefined();
	});

	it('classifies invalid grants in both exchange APIs', async () => {
		spyOn(global, 'fetch').and.callFake(async () =>
			new Response(JSON.stringify({
				error: 'invalid_grant',
				error_description: 'secret-token',
			}), { status: 400 })
		);
		await expectAsync(auth.exchangeAuthorizationCode('code'))
			.toBeRejectedWithError(ProviderAuthenticationRejectedError);
		await expectAsync(auth['exchangeRefreshToken']('token'))
			.toBeRejectedWithError(ProviderAuthenticationRejectedError);
	});

	it('classifies Graph invalid token responses', async () => {
		spyOn(global, 'fetch').and.resolveTo(new Response(JSON.stringify({
			error: {
				code: 'InvalidAuthenticationToken',
				message: 'secret-token',
			},
		}), { status: 400 }));
		await expectAsync(auth['getUserInfo']('token'))
			.toBeRejectedWithError(ProviderAuthenticationRejectedError);
	});

	it(
		'keeps outages, throttling and permission errors operational',
		async () => {
			const fetchSpy = spyOn(global, 'fetch');
			for (const [status, code] of [
				[503, 'invalid_grant'],
				[429, 'invalid_token'],
				[403, 'Forbidden'],
			] as const) {
				fetchSpy.and.resolveTo(new Response(JSON.stringify({
					error: code,
					error_description: 'secret-token',
				}), { status }));
				try {
					await auth['getUserInfo']('token');
					fail('Expected operational provider error');
				}
				catch (error) {
					expect(error).not.toEqual(
						jasmine.any(ProviderAuthenticationRejectedError)
					);
					expect((error as Error).message)
						.not.toContain('secret-token');
				}
			}
		}
	);
});
