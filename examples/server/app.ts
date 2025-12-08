/* eslint-disable no-console */

import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { EntraAuthentication } from '../../src/authentication-entra';
import crypto from 'crypto';
import { env } from './env';
import { maindb } from '../../database/main';
import { createDatabase, runMigrations } from '../../test/database';
// eslint-disable-next-line max-len
import { AuthenticationSSOMigrations } from '@riao/authn-sso/authentication-sso-migrations';
import { AuthMigrations } from '@riao/iam/auth/auth-migrations';

/**
 * Example: Express Web App with Entra SSO Authentication
 *
 * This example demonstrates:
 * - Setting up Entra authentication for a web app
 * - Managing user sessions
 * - Handling OAuth callback
 * - Protecting routes
 * - Using ts-appconfig for strongly-typed environment variables
 */

// Types
interface User {
	id: string;
	login: string;
	name?: string;
	entra_id?: string;
}

// Extend Express session to add custom properties
declare module 'express-session' {
	interface SessionData {
		userId?: string;
		user?: User;
	}
}

// Initialize Express app
const app = express();

// Configure session middleware
app.use(
	session({
		secret: env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: env.NODE_ENV === 'production',
			httpOnly: true,
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
		},
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup database
const db = createDatabase('entra-example');

// Initialize Entra Authentication
// NOTE: This requires database and userRepository to be initialized
// See your database setup documentation for proper initialization
const entraAuth = new EntraAuthentication({
	db,
	clientId: env.ENTRA_CLIENT_ID,
	clientSecret: env.ENTRA_CLIENT_SECRET,
	tenantId: env.ENTRA_TENANT_ID,
	redirectUri: env.ENTRA_REDIRECT_URI,
	// Scopes required:
	// 	Graph API access 	profile info
	// 	offline_access 		persistent sessions
	scopes: [
		'openid',
		'profile',
		'email',
		// Required for Microsoft Graph API access
		'https://graph.microsoft.com/.default',
		// Allows session persistence
		'offline_access',
	],
});

/**
 * Step 1: Initiate Entra login
 * User clicks "Login with Entra" → redirected to Entra login page
 */
app.get('/auth/entra/login', (req: Request, res: Response): void => {
	// Generate a random state for CSRF protection
	const state = crypto.randomUUID();

	// Store state in session (verify it on callback)
	req.session.save((err) => {
		if (err) {
			res.status(500).json({ error: 'Session error' });
			return;
		}

		// Get authorization URL and redirect user to Entra
		const authUrl = entraAuth.getAuthorizationUrl(state);
		res.redirect(authUrl);
	});
});

/**
 * Step 2: Handle Entra callback
 * Entra redirects user back with authorization code
 */
app.get(
	'/auth/entra/callback',
	async (req: Request, res: Response): Promise<void> => {
		const code = req.query['code'] as string | undefined;
		const state = req.query['state'] as string | undefined;
		const error = req.query['error'] as string | undefined;

		// Check for errors from Entra
		if (error) {
			console.error('Entra error:', error);
			res.redirect('/login?error=entra_auth_failed');
			return;
		}

		// Validate code and state
		if (!code || typeof code !== 'string') {
			res.redirect('/login?error=missing_code');
			return;
		}

		if (!state || typeof state !== 'string') {
			res.redirect('/login?error=missing_state');
			return;
		}

		try {
			// Exchange authorization code for tokens and get user info
			const principal = await entraAuth.authenticate({ code });

			if (!principal) {
				res.redirect('/login?error=authentication_failed');
				return;
			}

			// Store user ID in session
			req.session.userId = String(principal.id);
			req.session.user = principal as User;

			// Save session
			req.session.save((err) => {
				if (err) {
					res.status(500).json({ error: 'Session error' });
					return;
				}

				// Redirect to dashboard or requested page
				res.redirect('/dashboard');
			});
		}
		catch (error) {
			console.error('Authentication error:', error);
			res.redirect('/login?error=authentication_failed');
		}
	}
);

/**
 * Step 3: Middleware to protect routes
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
	if (!req.session?.userId) {
		res.redirect('/login');
		return;
	}

	next();
}

/**
 * Protected route example
 */
app.get('/dashboard', requireAuth, (req: Request, res: Response) => {
	const user = req.session.user;

	res.json({
		message: 'Welcome to dashboard',
		user: {
			id: user?.id,
			login: user?.login,
			name: user?.name,
		},
	});
});

/**
 * Get current user info
 */
app.get('/api/me', requireAuth, (req: Request, res: Response) => {
	res.json(req.session.user);
});

/**
 * Logout
 */
app.post('/auth/logout', (req: Request, res: Response): void => {
	req.session.destroy((err) => {
		if (err) {
			res.status(500).json({ error: 'Logout failed' });
			return;
		}

		res.json({ message: 'Logged out successfully' });
	});
});

/**
 * Refresh token (if offline_access was requested)
 * Call this periodically to maintain user session
 */
app.post(
	'/api/refresh-token',
	requireAuth,
	async (req: Request, res: Response): Promise<void> => {
		try {
			const userId = req.session?.userId;

			if (!userId) {
				res.status(401).json({ error: 'Not authenticated' });
				return;
			}

			// Get stored token record
			// TODO: The refresh token endpoint retrieves and uses
			// 	stored tokens without locking mechanisms. In a
			// 	concurrent environment, multiple refresh requests
			// 	could cause race conditions. Consider implementing
			// 	optimistic locking or transaction-based token updates.
			const tokenRecord = await entraAuth.getStoredToken(userId);

			if (!tokenRecord || !tokenRecord.refresh_token) {
				res.status(401).json({ error: 'No refresh token available' });
				return;
			}

			// Refresh the access token
			const newAccessToken = await entraAuth.refreshAccessToken(userId);

			if (!newAccessToken) {
				res.status(401).json({ error: 'Token refresh failed' });
				return;
			}

			res.json({ message: 'Token refreshed successfully' });
		}
		catch (error) {
			console.error('Token refresh error:', error);
			res.status(500).json({ error: 'Token refresh failed' });
		}
	}
);

/**
 * Login page (simple HTML)
 */
app.get('/login', (req: Request, res: Response): void => {
	const error = (req.query['error'] as string) || '';

	res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 50px; }
          .container { max-width: 400px; margin: 0 auto; }
          .error { color: red; margin-bottom: 20px; }
          a { display: inline-block; padding: 10px 20px; 
              background: #0078d4; color: white; text-decoration: none; 
              border-radius: 4px; }
          a:hover { background: #005a9e; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Login</h1>
          ${error ? `<div class="error">Error: ${error}</div>` : ''}
          <a href="/auth/entra/login">Sign in with Microsoft Entra</a>
        </div>
      </body>
    </html>
  `);
});

/**
 * Home page
 */
app.get('/', (req: Request, res: Response): void => {
	if (req.session?.userId) {
		res.redirect('/dashboard');
	}
	else {
		res.redirect('/login');
	}
});

// Start server
const port = parseInt(env.PORT, 10);

// Initialize database
async function initializeDatabase() {
	await maindb.init();
	await db.init();
	await runMigrations(db, new AuthMigrations());
	await runMigrations(db, new AuthenticationSSOMigrations());
}

async function initialize() {
	await initializeDatabase();

	app.listen(port, () => {
		console.log(`Server running on http://localhost:${port}`);
		console.log(`Login page: http://localhost:${port}/login`);
		console.log(
			`Callback URL: http://localhost:${port}/auth/entra/callback`
		);
		console.log(`Environment: ${env.NODE_ENV}`);
	});
}

initialize().catch((err) => {
	console.error('Failed to initialize application:', err);
	process.exit(1);
});

export default app;
