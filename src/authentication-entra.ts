import {
	SSOAuthentication,
	SSOUserInfo,
	SSOTokenResponse,
	SSOAuthenticationOptions,
	requestProviderJson,
	validateTokenResponse,
	validateProviderUser,
	isProviderString,
} from '@riao/authn-sso';
import { Principal } from '@riao/iam';

export interface EntraAuthenticationOptions extends Omit<
	SSOAuthenticationOptions,
	'provider'
> {
	clientId: string;
	clientSecret: string;
	tenantId: string;
	redirectUri: string;
	scopes?: string[];
}

/**
 * Microsoft Entra ID (Azure AD) SSO authentication driver
 * Extends generic SSOAuthentication with Entra-specific
 * OAuth2/OIDC implementation
 */
export class EntraAuthentication<
	TPrincipal extends Principal,
> extends SSOAuthentication<TPrincipal> {
	protected readonly clientId: string;
	protected readonly clientSecret: string;
	protected readonly tenantId: string;
	protected readonly redirectUri: string;
	protected readonly scopes: string[];

	constructor(options: EntraAuthenticationOptions) {
		super({ ...options, provider: 'entra' });
		this.clientId = options.clientId;
		this.clientSecret = options.clientSecret;
		this.tenantId = options.tenantId;
		this.redirectUri = options.redirectUri;
		// Default scopes: openid for ID token, profile & email for user info
		// https://graph.microsoft.com/.default for Microsoft Graph API access
		// 	(required for getUserInfo)
		this.scopes = options.scopes || [
			'openid',
			'profile',
			'email',
			'https://graph.microsoft.com/.default',
		];
	}

	/**
	 * Generate Entra authorization URL
	 */
	public getAuthorizationUrl(state: string): string {
		const baseUrl = 'https://login.microsoftonline.com';
		const path = `/${this.tenantId}/oauth2/v2.0/authorize`;
		const params = new URLSearchParams(this.getAuthorizationParams(state));
		return `${baseUrl}${path}?${params}`;
	}

	/**
	 * Get authorization URL query parameters for Entra
	 */
	protected getAuthorizationParams(state: string): Record<string, string> {
		return {
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			response_type: 'code',
			scope: this.scopes.join(' '),
			state,
		};
	}

	/**
	 * Exchange authorization code for tokens
	 */
	public async exchangeAuthorizationCode(
		code: string
	): Promise<SSOTokenResponse> {
		const tokenUrl =
			`https://login.microsoftonline.com/${this.tenantId}` +
			'/oauth2/v2.0/token';
		const data = await requestProviderJson(tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: this.clientId,
				client_secret: this.clientSecret,
				code,
				redirect_uri: this.redirectUri,
				grant_type: 'authorization_code',
				scope: this.scopes.join(' '),
			}).toString(),
		}, 'Entra token exchange', this.requestTimeoutMs);
		return validateTokenResponse(data);
	}

	/**
	 * Fetch user information from Microsoft Graph API
	 */
	protected async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
		const data = await requestProviderJson(
			'https://graph.microsoft.com/v1.0/me', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			}, 'Entra user info', this.requestTimeoutMs, true);
		validateProviderUser(
			data, ['userPrincipalName', 'mail', 'displayName'], true
		);
		const userData = data as unknown as {
			id: string;
			userPrincipalName?: string;
			mail?: string;
			displayName?: string;
		};
		const login = isProviderString(userData.userPrincipalName) ?
			userData.userPrincipalName : userData.mail;
		if (!isProviderString(login)) {
			throw new Error('Malformed Entra user response: missing login');
		}
		return {
			id: userData.id,
			login,
			name: userData.displayName || login,
			type: 'user',
		};
	}

	/**
	 * Refresh access token using refresh token
	 */
	protected async exchangeRefreshToken(
		refreshToken: string
	): Promise<SSOTokenResponse> {
		const tokenUrl =
			`https://login.microsoftonline.com/${this.tenantId}` +
			'/oauth2/v2.0/token';
		const data = await requestProviderJson(tokenUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: this.clientId,
				client_secret: this.clientSecret,
				refresh_token: refreshToken,
				grant_type: 'refresh_token',
				scope: this.scopes.join(' '),
			}).toString(),
		}, 'Entra token refresh', this.requestTimeoutMs);
		return validateTokenResponse(data);
	}
}
