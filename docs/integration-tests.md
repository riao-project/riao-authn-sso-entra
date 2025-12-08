# Integration Tests Guide

## Overview

The Entra Authentication driver includes comprehensive integration tests that can perform real HTTP calls to Microsoft Entra ID endpoints. By default, these tests are **skipped** to avoid requiring credentials and external dependencies during routine testing.

## Unit vs Integration Tests

### Unit Tests (Default - Always Run)
- Located in: `test/spec/authentication-entra.spec.ts`
- **31 test cases** covering all driver functionality
- Use mocked HTTP calls (no external dependencies)
- Run in ~0.3 seconds
- Require no credentials
- Verify code logic and error handling

```bash
npm run test:dev
```

### Integration Tests (Optional - Requires Real Credentials)
- Located in: `test/spec/integration.spec.ts`
- **17 test cases** validating against real Entra ID
- Make real HTTP calls to Microsoft servers
- Verify configuration and OAuth 2.0 compliance
- Test security considerations
- Skipped by default (shown as "pending")

```bash
# To enable integration tests, see below
```

## Enabling Integration Tests

### 1. Prepare Entra Configuration

You need a valid Azure app registration with the following:

- **Client ID**: Application (client) ID
- **Client Secret**: Client secret value (not certificate)
- **Tenant ID**: Directory (tenant) ID or domain name
- **Redirect URI**: Must match your app registration (e.g., `https://localhost:3000/callback`)

See [Azure App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app) for details.

### 2. Set Environment Variables

Start by copying the example file:

```bash
cp .env.test.example .env.test
```

Then edit `.env.test` (in the project root) with your real Entra credentials:

```env
# Replace test values with real credentials
ENTRA_CLIENT_ID=your-actual-client-id
ENTRA_CLIENT_SECRET=your-actual-client-secret
ENTRA_TENANT_ID=your-actual-tenant-id
ENTRA_REDIRECT_URI=https://your-redirect-uri

# Enable integration tests
ENABLE_INTEGRATION_TESTS=true

# Optional: Test credentials for real user flow testing
# ENTRA_TEST_USER_UPNAME=testuser@yourtenant.onmicrosoft.com
# ENTRA_TEST_USER_PASSWORD=user-password
```

### 3. Run Integration Tests

**With all tests:**
```bash
npm run test:dev
```

**With only integration tests:**
```bash
npm run test:dev -- --grep="Integration"
```

### ⚠️ Security: Protecting Your Credentials

The `.env.test` file is **automatically gitignored** to prevent accidental commits. However:

- ✅ `.env.test.example` is committed (safe - no real values)
- ❌ `.env.test` is gitignored (you add real credentials here)

**Never commit** your `.env.test` file with real credentials.

To verify it's properly ignored:
```bash
git check-ignore .env.test
# Should output: .env.test (if properly ignored)
```

**With only real credential tests:**
```bash
npm run test:dev -- --grep="real credentials"
```

## Integration Test Coverage

The integration test suite validates:

### Configuration Validation
- ✅ All required Entra parameters are present
- ✅ Tenant ID format is valid
- ✅ Redirect URI format is valid
- ✅ Configuration values are readable from environment

### OAuth 2.0 Compliance
- ✅ Authorization URL includes all required parameters
- ✅ Scopes are properly requested
- ✅ State parameter is included for CSRF protection
- ✅ Redirect URI is secure (HTTPS for production)

### Real Entra ID Integration
- ✅ Authorization URL is valid for your tenant
- ✅ Token exchange fails gracefully with invalid codes
- ✅ User info fetch fails gracefully with invalid tokens
- ✅ Tenant ID is accessible and recognized
- ✅ Client credentials are valid for the Entra instance

### Security
- ✅ Error messages don't expose sensitive credentials
- ✅ Scopes are minimized and appropriate
- ✅ CSRF protection via state parameter
- ✅ Token refresh flow is properly implemented

### Error Handling
- ✅ Network errors are handled gracefully
- ✅ Invalid codes are rejected properly
- ✅ Invalid tokens are rejected properly
- ✅ Error messages are descriptive and helpful

## Test Results

When integration tests are **disabled** (default):
```
52 specs, 0 failures, 5 pending specs
```

The 5 pending specs are the real Entra ID tests that require credentials.

When integration tests are **enabled**:
```
52 specs, X failures, 0 pending specs
```

Tests will run against your actual Entra instance. Failures indicate configuration issues.

## Security Best Practices

### Development
- Use a **dedicated test account** with minimal permissions
- Store credentials in `.env.test` (never commit to git)
- Use `.gitignore` to prevent credential exposure
- Rotate test credentials regularly

### CI/CD Pipeline
- Use **secure environment variables** (GitHub Secrets, Azure Key Vault, etc.)
- Never commit credentials to version control
- Use separate test credentials from production
- Run integration tests in a protected CI environment

### Production
- Never run integration tests against production Entra
- Never log or expose tokens in production logs
- Use proper secret management for all credentials
- Implement token rotation strategies

## Troubleshooting

### Tests Show "Pending" - Integration Disabled
```
5) should generate valid authorization URL for real tenant
   No reason given
```

**Solution**: Set `ENABLE_INTEGRATION_TESTS=true` in `test/.env.test`

### "Tenant for tenant ID not found" Error
```
AADSTS90002: Tenant for tenant ID '<id>' not found
```

**Solution**: Verify your `ENTRA_TENANT_ID` is correct. Use format:
- UUID: `12345678-1234-1234-1234-123456789012`
- Domain: `yourtenant.onmicrosoft.com`

### "AADSTS700016: Application not found" Error
```
AADSTS700016: Application with identifier 'xxx' was not found
```

**Solution**: Verify `ENTRA_CLIENT_ID` matches your Azure app registration

### "AADSTS7000215: Invalid client secret" Error
```
AADSTS7000215: Invalid client secret provided
```

**Solution**: Verify `ENTRA_CLIENT_SECRET` is current and not expired

### "Invalid redirect_uri" Error
```
AADSTS50011: The redirect uri 'xxx' provided in the request does not match
```

**Solution**: Ensure `ENTRA_REDIRECT_URI` exactly matches your app registration

## Advanced Usage

### Environment Variable Override

You can override any configuration via environment variables:

```bash
ENTRA_CLIENT_ID=override-id npm run test:dev
```

### Filtering Tests

Run specific test suites:

```bash
# Only unit tests
npm run test:dev -- --grep="^EntraAuthentication" --invert

# Only integration tests  
npm run test:dev -- --grep="Integration"

# Only real credential tests
npm run test:dev -- --grep="real credentials"

# Only configuration validation
npm run test:dev -- --grep="Configuration"

# Only security tests
npm run test:dev -- --grep("Security")
```

### Generating Reports

```bash
# Unit test coverage
npm run test

# With coverage report
npm run test 2>&1 | grep -A 10 "Coverage summary"
```

## Next Steps

1. Create your Azure app registration
2. Enable integration tests with real credentials
3. Run the full test suite: `npm run test:dev`
4. Verify all tests pass
5. Integrate into your CI/CD pipeline

For more information:
- [Azure AD Documentation](https://docs.microsoft.com/en-us/azure/active-directory/)
- [OAuth 2.0 Protocol](https://tools.ietf.org/html/rfc6749)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/overview)
