# Entra SSO Web App Example

This example demonstrates how to integrate Microsoft Entra SSO authentication into an Express.js web application.

## Overview

This is a complete, working example that shows:

- **OAuth 2.0 Flow**: Authorization code flow with PKCE support
- **Session Management**: Express session middleware with secure cookies
- **Protected Routes**: Middleware to require authentication
- **Token Refresh**: Using `offline_access` scope for persistent sessions
- **Error Handling**: Proper error handling and user feedback
- **Strong Type Safety**: Using `ts-appconfig` for environment variables with full TypeScript support

## Setup

### 1. Create Entra App Registration

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Fill in:
   - **Name**: Your app name (e.g., "My Web App")
   - **Redirect URI**: Select "Web" and enter `http://localhost:3000/auth/entra/callback`
4. Click **Register**

### 2. Configure App Registration

In your new app registration:

#### Get credentials (Certificates & secrets)
1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Copy the **Value** (this is your `ENTRA_CLIENT_SECRET`)

#### Copy IDs
1. Go to **Overview**
2. Copy:
   - **Application (client) ID** → `ENTRA_CLIENT_ID`
   - **Directory (tenant) ID** → `ENTRA_TENANT_ID`

#### Configure redirect URI
1. Go to **Authentication**
2. Under **Redirect URIs**, verify `http://localhost:3000/auth/entra/callback` is listed
3. Under **Advanced settings**, set **Allow public client flows** to **Yes** (for development)

#### Configure API permissions (REQUIRED)
**This step is essential for user profile retrieval to work.**

1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph** → **Delegated permissions**
4. Search for and select the following:
   - `User.Read` - **REQUIRED** for fetching user profile information
   - `offline_access` - Optional, for persistent sessions (refresh tokens)
5. Click **Add permissions**

**Grant Admin Consent (CRITICAL):**
- Look for the **Grant admin consent for [Organization]** button at the top
- Click it and confirm
- You should see a green checkmark next to the permissions
- Without this step, you'll get "Insufficient privileges" errors when fetching user info

**Troubleshooting 403 Forbidden:**
If you still get "Authorization_RequestDenied" errors:
1. Verify that `User.Read` permission shows a **green checkmark** (granted)
2. Wait a few minutes for permissions to propagate in Azure
3. Try a new login session
4. Clear your browser cookies and try again
5. If using a test/development tenant, you might need to be an admin to grant consent

### 3. Install Dependencies

```bash
npm install express express-session
npm install --save-dev @types/express @types/express-session
```

### 4. Configure Environment with ts-appconfig

This example uses **ts-appconfig** for strongly-typed environment variables. Environment variables are automatically loaded from:

1. Default values in `env.ts`
2. `.env` file
3. `process.env`

Copy `.env.example` to `.env` and fill in your Entra credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
ENTRA_CLIENT_ID=your-client-id
ENTRA_CLIENT_SECRET=your-client-secret
ENTRA_TENANT_ID=your-tenant-id
ENTRA_REDIRECT_URI=http://localhost:3000/auth/entra/callback
SESSION_SECRET=generate-a-random-string
PORT=3000
NODE_ENV=development
```

**Type Safety Benefits:**
- Full autocomplete: `env.ENTRA_CLIENT_ID` with IDE support
- Compile-time validation: Missing required variables caught before runtime
- Default values: PORT defaults to 3000, NODE_ENV defaults to 'development'
- No `.env` parsing errors: ts-appconfig handles all parsing and validation

### 5. Database Setup

Initialize your database with the Entra migration:

```typescript
// In your app initialization
import { EntraAuthentication } from '@riao/iam';
import { Migration } from '@riao/dbal';

// Run migration
const migration = new EntraAuthenticationMigration();
await migration.up(database);
```

### 6. Run the App

```bash
npm run build
npm start
```

Visit `http://localhost:3000`

## OAuth Flow Explained

### 1. User clicks "Sign in with Entra"
```
GET /auth/entra/login
↓
Generates random state (CSRF protection)
Redirects user to Entra login URL
```

### 2. User logs in to Entra
```
User enters credentials on Microsoft login page
Entra validates and redirects back with authorization code
```

### 3. Callback received
```
GET /auth/entra/callback?code=...&state=...
↓
Validate state matches (CSRF check)
Exchange code for access token (backend-to-backend)
Fetch user info from Microsoft Graph
Create or link principal
↓
Store user ID in session
Redirect to dashboard
```

### 4. Subsequent requests
```
GET /dashboard
↓
Middleware checks session.userId
If present → allow access
If missing → redirect to login
```

## Key Concepts

### Default Scopes

Default scopes used for basic login (no persistent access):
- `openid` - Request ID token
- `profile` - Request profile information
- `email` - Request email address

No refresh token is issued; user must log in again after session expires.

### Offline Access (Persistent Sessions)

To maintain user sessions without requiring re-login:

```typescript
const entraAuth = new EntraAuthentication({
  // ... other options
  scopes: [
    'openid',
    'profile', 
    'email',
    'offline_access', // ← Enables refresh tokens
  ],
});
```

With `offline_access`, the system stores a refresh token and can:
- Obtain new access tokens without user interaction
- Keep users logged in across sessions
- Implement auto-refresh on token expiration

### Session Management

Sessions are stored in-memory (for development). For production:

```typescript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient();
app.use(session({
  store: new RedisStore({ client: redisClient }),
  // ... other options
}));
```

### Token Refresh

If using `offline_access`, refresh tokens when needed:

```typescript
app.post('/api/refresh-token', async (req: Request, res: Response) => {
  const userId = req.session.userId;
  const newAccessToken = await entraAuth.refreshAccessToken(userId);
  res.json({ accessToken: newAccessToken });
});
```

Or implement automatic refresh:

```typescript
app.use((req: Request, res: Response, next: Function) => {
  // Check token expiration before each request
  // If expired, call refreshAccessToken
  next();
});
```

## Configuration with ts-appconfig

The app uses `env.ts` to define and load environment variables with strong typing:

```typescript
import { AppConfig, configure } from 'ts-appconfig';

class Environment extends AppConfig {
  // Required variables
  readonly ENTRA_CLIENT_ID: string = '';
  readonly ENTRA_CLIENT_SECRET: string = '';
  readonly ENTRA_TENANT_ID: string = '';
  readonly SESSION_SECRET: string = '';

  // Optional with defaults
  readonly ENTRA_REDIRECT_URI: string = 'http://localhost:3000/auth/entra/callback';
  readonly PORT: string = '3000';
  override NODE_ENV: string = 'development';
}

export const env = configure(Environment);
```

Then use in your code with full type safety:

```typescript
import { env } from './env';

// All of these have autocomplete and type checking
const clientId = env.ENTRA_CLIENT_ID;           // string
const port = parseInt(env.PORT, 10);            // number
const isProduction = env.NODE_ENV === 'production';  // boolean
```

**Key Benefits:**
- ✅ **Autocomplete**: IDE shows all available config properties
- ✅ **Type Safety**: Can't typo property names
- ✅ **Validation**: Missing required variables fail at startup
- ✅ **Documentation**: Comments in class define what each variable does
- ✅ **Defaults**: Override defaults by setting environment variables
- ✅ **IDE Support**: Full IntelliSense across your app

## Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/auth/entra/login` | Initiate Entra login |
| GET | `/auth/entra/callback` | OAuth callback (handled internally) |
| POST | `/auth/logout` | Logout and destroy session |
| GET | `/api/me` | Get current user info (protected) |
| POST | `/api/refresh-token` | Refresh access token (protected) |
| GET | `/dashboard` | Protected example route |

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ENTRA_CLIENT_ID` | App registration client ID | `a1234567-b89c-12d3-e4fg-567890abcdef` |
| `ENTRA_CLIENT_SECRET` | App registration secret | `abc123~xyz456` |
| `ENTRA_TENANT_ID` | Directory tenant ID | `12345678-1234-1234-1234-123456789012` |
| `ENTRA_REDIRECT_URI` | OAuth callback URL | `http://localhost:3000/auth/entra/callback` |
| `SESSION_SECRET` | Session encryption key | Any random string |
| `NODE_ENV` | Environment | `development` or `production` |
| `PORT` | Server port | `3000` |

## Error Handling

The app handles common errors:

- **Missing credentials**: Redirects to login with error message
- **Entra errors**: Logged and user redirected to login
- **Session errors**: Returns 500 response
- **Token refresh failure**: Returns 401 (requires re-login)

## Security Considerations

✅ **Implemented**:
- HTTPS-only cookies in production
- HTTPOnly flag prevents XSS token theft
- CSRF protection via state parameter
- Session secrets encrypted
- Secrets stored in environment variables

⚠️ **Consider for Production**:
- Use production-grade session store (Redis, etc.)
- Implement rate limiting on login endpoint
- Add CORS configuration
- Use HTTPS (not HTTP)
- Implement token refresh strategy
- Add logout on other devices
- Implement principal linking for existing users
- Add audit logging

## Troubleshooting

### "Redirect URI mismatch"
- Verify `ENTRA_REDIRECT_URI` matches exactly in App Registration
- Check for trailing slashes and protocol (http vs https)

### "unauthorized_client"
- Verify `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are correct
- Check that client secret hasn't expired

### "Authorization_RequestDenied" or "Insufficient privileges" (403 Forbidden)
**Problem**: User info fetch fails with "Failed to fetch Entra user info: 403 Forbidden"

**Solution**:
1. **Add User.Read permission**:
   - Go to Azure Portal → App Registration
   - Click **API permissions**
   - Verify `User.Read` (Microsoft Graph > Delegated) is in the list
   - It should have a ✅ green checkmark

2. **Grant admin consent**:
   - Look for **"Grant admin consent for [Organization Name]"** button
   - Click it and confirm
   - Wait for the permission status to change to green ✅

3. **Propagation delay**:
   - Azure permissions can take 5-15 minutes to fully propagate
   - Try logging in again after waiting

4. **Browser cache**:
   - Clear all cookies for localhost:3000
   - Try in a private/incognito browser window

5. **Test with Graph Explorer**:
   - Use [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer)
   - Sign in with the same principal
   - Try calling GET `/me`
   - This confirms if permissions are working

6. **Check tenant permissions**:
   - Ensure your principal is an admin in the Azure tenant
   - Non-admin users can't grant consent for app-wide permissions in some tenants
   - Ask your Azure administrator to grant consent

### "The provided value for the 'redirect_uri' is not valid"
- Add redirect URI in App Registration → Authentication
- Wait a few minutes for changes to propagate

### User not found after callback
- Check that `User.Read` scope is granted in API permissions
- Verify Microsoft Graph API call succeeds (check error message)
- The error message will provide details about what permission is missing

### Session not persisting
- Check browser cookies are enabled
- Verify `SESSION_SECRET` is set
- In production, verify session store is accessible
- If using `offline_access` scope, ensure it's also granted in API permissions

### "The provided value for the 'redirect_uri' is not valid"
- Add redirect URI in App Registration → Authentication
- Wait a few minutes for changes to propagate

### User not found after callback
- Check that `offline_access` scope is granted if using persistent sessions
- Verify Microsoft Graph API call succeeds (check logs)

### Session not persisting
- Check browser cookies are enabled
- Verify `SESSION_SECRET` is set
- In production, verify session store is accessible

## Next Steps

- **Production Deployment**: Switch to Redis for session storage
- **Principal Linking**: Link Entra principals to existing user principals
- **Permissions**: Request additional Graph API scopes for user data
- **Multi-tenant**: Configure for multiple Entra organizations
- **Token Refresh**: Implement automatic token refresh strategy

## Resources

- [Microsoft Entra Documentation](https://learn.microsoft.com/en-us/entra/)
- [OAuth 2.0 Authorization Code Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Graph API](https://graph.microsoft.com/)
- [Express.js Session Middleware](https://github.com/expressjs/session)
