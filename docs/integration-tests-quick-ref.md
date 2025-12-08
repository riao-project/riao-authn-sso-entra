# Quick Reference: Integration Tests

## Enable Integration Tests

1. Get your Azure credentials:
   - Client ID, Client Secret, Tenant ID from Azure Portal
   - Set up test user account (optional)

2. Update `.env.test` (in project root):
```env
ENTRA_CLIENT_ID=your-real-client-id
ENTRA_CLIENT_SECRET=your-real-client-secret
ENTRA_TENANT_ID=your-real-tenant-id
ENTRA_REDIRECT_URI=https://your-redirect-uri
ENABLE_INTEGRATION_TESTS=true
```

3. Run tests:
```bash
npm run test:dev
```

## Common Issues

| Error | Cause | Solution |
|-------|-------|----------|
| "Pending specs" | Integration disabled | Set `ENABLE_INTEGRATION_TESTS=true` |
| "Tenant not found" | Wrong tenant ID | Verify `ENTRA_TENANT_ID` in Azure Portal |
| "Application not found" | Wrong client ID | Verify `ENTRA_CLIENT_ID` matches |
| "Invalid client secret" | Wrong secret | Regenerate in Azure Portal |
| "Invalid redirect_uri" | URI mismatch | Must exactly match app registration |

## Filter Tests

```bash
# Run only integration tests
npm run test:dev -- --grep="Integration"

# Run only unit tests
npm run test:dev -- --grep="^EntraAuthentication" --invert

# Run only real credential tests
npm run test:dev -- --grep="real credentials"

# Run only security tests
npm run test:dev -- --grep="Security"
```

## Documentation

See `docs/integration-tests.md` for comprehensive guide.
