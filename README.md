# @riao/authn-sso-entra

Microsoft Entra ID (Azure AD) authentication driver for riao-iam.

## Installation

```bash
npm install @riao/authn-sso-entra @riao/iam @riao/dbal
npm install --save-dev @riao/cli
```

```bash
npx riao migration:create import-sso-entra-tables
```

`database/main/migrations/123456789-import-sso-tables.ts`:

```typescript
import { AuthenticationSSOMigrations } from '@riao/authn-sso/authentication-sso-migrations';

export default AuthenticationSSOMigrations;
```

## Setup

### 1. Register Application in Entra

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory → App registrations
3. Click "New registration"
4. Configure:
   - **Name**: Your application name
   - **Supported principal types**: Choose based on your needs
   - **Redirect URI**: `https://yourdomain.com/auth/entra/callback`

### 2. Create Client Secret

1. In your app registration, go to Certificates & secrets
2. Click "New client secret"
3. Copy the value (you won't be able to see it again)

### 3. Get Configuration Values

From your app registration Overview page, note:
- **Application (client) ID** → `ENTRA_CLIENT_ID`
- **Directory (tenant) ID** → `ENTRA_TENANT_ID`

## Configuration

```typescript
import { EntraAuthentication } from '@riao/authn-sso-entra';

const entraAuth = new EntraAuthentication({
	db: database,
	clientId: process.env.ENTRA_CLIENT_ID!,
	clientSecret: process.env.ENTRA_CLIENT_SECRET!,
	tenantId: process.env.ENTRA_TENANT_ID!,
	redirectUri: process.env.ENTRA_REDIRECT_URI!,
});
```

### Required API Permissions

**IMPORTANT**: You must configure the following permission in your app registration:

1. Go to **App Registration** → **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph** → **Delegated permissions**
4. Search for and grant: **`User.Read`**
5. Click **Grant admin consent for [Organization]**

Without the `User.Read` permission, user info retrieval will fail with a 403 Forbidden error.

### Custom Scopes

By default, the driver requests: `openid`, `profile`, `email`, `https://graph.microsoft.com/.default`.

To customize scopes:

```typescript
const entraAuth = new EntraAuthentication({
	// ... other options
	scopes: ['openid', 'profile', 'email', 'offline_access'],
});
```

## Environment Variables

```bash
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=your-secret-here
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_REDIRECT_URI=https://yourdomain.com/auth/entra/callback
```

## Usage

### Get Authorization URL

```typescript
const state = crypto.randomUUID();
const authUrl = entraAuth.getAuthorizationUrl(state);
// Redirect user to authUrl
```

### Handle Callback

```typescript
const principal = await entraAuth.authenticate({ code });
if (principal) {
	// User authenticated successfully
	// Create session, JWT token, etc.
}
```

### Refresh Access Token

```typescript
const newAccessToken = await entraAuth.refreshAccessToken(principalId);
```

### Get Stored Token

```typescript
const tokenRecord = await entraAuth.getStoredToken(principalId);
```

### Revoke Session

```typescript
await entraAuth.revokeSession(principalId);
```

## API Scopes

### Default Scopes

The implementation requests these scopes by default:

- `openid` - Required for OpenID Connect identity verification
- `profile` - User's profile information (displayName, etc.)
- `email` - User's email address
- `https://graph.microsoft.com/.default` - Microsoft Graph API access (required for fetching user info)

**Note**: To make these work, you must grant the `User.Read` permission in your app registration's API permissions.

### Optional Scopes

- `offline_access` - Enables refresh tokens for persistent access without user interaction

### Scope Descriptions

| Scope | Purpose | Required | Notes |
|-------|---------|----------|-------|
| `openid` | Identity verification | Yes | Always required |
| `profile` | User profile data | Yes | Needed for displayName |
| `email` | Email address | Yes | Needed for user email |
| `https://graph.microsoft.com/.default` | Graph API access | Yes | Required for getUserInfo() |
| `offline_access` | Refresh tokens | No | Optional, for persistent access |

### Example: Adding Offline Access

```typescript
const entraAuth = new EntraAuthentication({
	// ... other options
	scopes: [
		'openid',
		'profile',
		'email',
		'https://graph.microsoft.com/.default',
		'offline_access', // Enables refresh tokens
	],
});
```

For a complete list of available scopes, see [Microsoft Entra permissions and consent](https://learn.microsoft.com/en-us/entra/identity-platform/permissions-consent-overview).

## Error Handling

All methods throw on network/API errors. Wrap calls in try-catch:

```typescript
try {
	const principal = await entraAuth.authenticate({ code });
}
catch (error) {
	console.error('Authentication failed:', error);
}
```

## Contributing & Development

See [contributing.md](docs/contributing/contributing.md) for information on how to develop or contribute to this project!
