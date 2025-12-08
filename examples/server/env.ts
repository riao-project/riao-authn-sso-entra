import { AppConfig, configure } from 'ts-appconfig';

/**
 * Application configuration with strong typing
 * Loads and validates environment variables
 */
class Environment extends AppConfig {
	// Entra OAuth credentials (required)
	readonly ENTRA_CLIENT_ID: string = '';
	readonly ENTRA_CLIENT_SECRET: string = '';
	readonly ENTRA_TENANT_ID: string = '';

	// Entra OAuth configuration (optional with defaults)
	readonly ENTRA_REDIRECT_URI: string =
		'http://localhost:3000/auth/entra/callback';

	// Session configuration (required)
	readonly SESSION_SECRET: string = '';

	// Server configuration (optional with defaults)
	readonly PORT: string = '3000';
	override NODE_ENV: string = 'development';

	// Optional: Database connection
	readonly DATABASE_URL: string = '';
}

/**
 * Configured environment with variables loaded from .env,
 * 	process.env, and defaults
 */
export const env = configure(Environment, {
	relativePath: './examples/server/.env',
});
