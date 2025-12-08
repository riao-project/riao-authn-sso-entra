import 'jasmine';
import { maindb } from '../../database/main';
import {
	EntraAuthentication,
	EntraAuthenticationOptions,
} from '../../src/index';

beforeAll(async () => {
	await maindb.init();
});

afterAll(async () => {
	await maindb.disconnect();
});

describe('Entra SSO Authentication Driver - Exports', () => {
	it('should export EntraAuthentication class', () => {
		expect(EntraAuthentication).toBeDefined();
	});

	it('should be instantiable with required options', () => {
		const options: EntraAuthenticationOptions = {
			db: maindb,
			clientId: 'test-id',
			clientSecret: 'test-secret',
			tenantId: 'test-tenant',
			redirectUri: 'https://localhost/callback',
		};

		const auth = new EntraAuthentication(options);
		expect(auth).toBeDefined();
		expect(auth).toBeInstanceOf(EntraAuthentication);
	});
});
