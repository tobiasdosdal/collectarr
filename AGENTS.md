# AGENTS.md - Coding Guidelines for AI Agents

This file provides essential guidance for AI agents working on the Collectarr codebase.

## Project Overview

Collectarr is a self-hosted media collection manager (Fastify backend + React frontend) that syncs curated lists with Emby and integrates with Radarr/Sonarr.

## Build & Test Commands

```bash
# Development
npm run dev              # Start both server and client in dev mode
npm run dev:server       # Start only server with hot reload (tsx watch)
npm run dev:client       # Start only Vite dev server

# Building
npm run build            # Build both server and client
npm run build:server     # Compile TypeScript to dist-server/
npm run build:client     # Build Vite client to dist/

# Testing (Jest with experimental ESM)
npm test                 # Run all tests
npm test -- auth.test.js # Run single test file
npm run test:watch       # Run tests in watch mode

# Linting & Type Checking
npm run lint             # Run ESLint on client code
npm run typecheck        # Type check without emitting (tsc --noEmit)

# Database
npm run db:generate      # Generate Prisma client
npm run db:push          # Push schema changes to database
npm run db:studio        # Open Prisma Studio
```

## Code Style Guidelines

### TypeScript Configuration
- **Target**: ES2022 with NodeNext module resolution
- **Strict mode**: Enabled with `noUncheckedIndexedAccess`
- **Type imports**: Use `import type { X } from 'y.js'` for type-only imports
- **File extensions**: Always use `.js` extensions in imports (even for `.ts` files)

### Imports & Module Structure
```typescript
// 1. Node built-ins first
import { fileURLToPath } from 'url';

// 2. External packages
import type { FastifyInstance } from 'fastify';

// 3. Internal types (with .js extension)
import type { AppConfig } from './types/index.js';

// 4. Internal modules
import prismaPlugin from './plugins/prisma.js';
```

### Naming Conventions
- **Files**: Lowercase with dashes (`auth-routes.ts`, `error-handling.ts`)
- **Classes**: PascalCase (`CollectionService`, `BaseApiClient`)
- **Interfaces**: PascalCase with descriptive names (`UserRepository`, not `IUser`)
- **Functions**: camelCase, use verbs (`getUserById`, `refreshCollection`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Type aliases**: PascalCase (`type JobHandler = ...`)

### Error Handling
- **Always use custom error classes** from `modules/shared/errors.ts`:
  - `ValidationError` - Invalid input data
  - `AuthenticationError` - Auth failures
  - `NetworkError` - Network issues
  - `NotFoundError` - Resource not found
  - `ExternalServiceError` - Third-party API errors
- **Never use `as any` or `@ts-ignore`** - Fix the underlying type issue
- **Network errors**: Use `handleNetworkError()` from `utils/error-handling.ts`
- **Async errors**: Wrap external API calls with `withRetry()` from `utils/retry.ts`

### API Client Patterns
```typescript
// Use BaseApiClient from shared/http/base-client.ts
class MyClient extends BaseApiClient {
  constructor(url: string, apiKey: string) {
    super(url, apiKey, 'ServiceName', {
      apiKeyHeaderName: 'X-Api-Key',
      apiVersion: 'v3',
    });
  }
}

// Factory function pattern
export function createMyClient(url: string | undefined, apiKey: string | undefined): MyClient | null {
  if (!url || !apiKey) return null;
  return new MyClient(url, apiKey);
}
```

### Route Handler Pattern (Fastify)
```typescript
// Use type-safe route definitions
export default async function routes(fastify: FastifyInstance) {
  fastify.get('/path', async (request, reply) => {
    // Implementation
  });
}
```

### Testing
- Tests are in `/tests/` directory with `.test.js` extension
- Use Jest with ESM (`--experimental-vm-modules`)
- Use test helpers from `tests/helper.js`:
  - `buildTestApp()` - Create test Fastify instance
  - `createTestUser()` - Create authenticated test user
  - `authRequest()` - Make authenticated requests
- Tests must clean up after themselves (use `afterAll` to close app)

### Database (Prisma)
- Always generate Prisma client after schema changes: `npm run db:generate`
- Use `prisma.$transaction()` for related operations
- Access via `fastify.prisma` in routes

### Linting Rules (ESLint)
- No explicit `any` types allowed
- Unused vars: Allowed for capitalized constants (regex patterns) and underscore prefixes
- Prefer const over let (warning, not error)
- Empty object types allowed (for Fastify augmentation)

### Key Utilities Available
- `utils/error-handling.ts` - Network error handling, Result types
- `utils/retry.ts` - Exponential backoff retry logic
- `utils/date-formatters.ts` - Date/time formatting
- `utils/id-utils.ts` - ID normalization (IMDb, TMDb, TVDB)
- `utils/validators.ts` - URL, email, API key validation
- `shared/http/base-client.ts` - Base HTTP client for API integrations

### Environment Variables
Required in production:
- `JWT_SECRET` - Min 32 chars
- `ENCRYPTION_KEY` - Min 32 chars
- `DATABASE_URL` - SQLite path

Optional:
- `TMDB_API_KEY`, `MDBLIST_API_KEY`, `TRAKT_CLIENT_ID`, `TRAKT_CLIENT_SECRET`
- `PORT` - Default 7795
- `CORS_ORIGINS` - Comma-separated allowed origins

## CI/CD Pipeline

The CI runs in this order:
1. Lint (ESLint on client)
2. Type Check (`tsc --noEmit`)
3. Build (server + client)
4. Test (Jest with JWT_SECRET env var)
5. Docker Build (multi-arch if all pass)

All checks must pass before merging.
