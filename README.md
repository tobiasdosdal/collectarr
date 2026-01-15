# Collectarr

A self-hosted media collection manager that syncs curated lists with your Emby library and integrates with Radarr/Sonarr for requesting missing content.

## Features

- **Emby Integration** - Connect your Emby server to track which items from your collections are in your library
- **List Imports** - Import collections from MDBList, Trakt, and Letterboxd
- **Radarr/Sonarr Integration** - Request missing movies and TV shows directly to your download managers
- **Multi-User Support** - Each user can connect their own servers and API keys
- **Automatic Sync** - Schedule collection syncs to keep everything up to date
- **Dark Cinema UI** - Sleek, cinematic interface designed for media enthusiasts

## Quick Start

### Docker (Recommended)

1. Create a `.env` file:
```bash
# Required
JWT_SECRET=your-secure-random-string  # Generate with: openssl rand -base64 32

# Optional API keys
MDBLIST_API_KEY=
TMDB_API_KEY=
TRAKT_CLIENT_ID=
TRAKT_CLIENT_SECRET=
```

2. Run with Docker Compose:
```bash
docker compose up -d
```

3. Access at `http://localhost:3000`

### Manual Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Initialize database
npx prisma db push

# Build
npm run build

# Start
npm start
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Secret key for JWT tokens |
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_URL` | No | SQLite database path |
| `MDBLIST_API_KEY` | No | Default MDBList API key |
| `TMDB_API_KEY` | No | TMDb API for poster fallback |
| `TRAKT_CLIENT_ID` | No | Trakt OAuth client ID |
| `TRAKT_CLIENT_SECRET` | No | Trakt OAuth client secret |

### Integrations

#### Emby
Connect your Emby server in Settings. Requires:
- Server URL (e.g., `http://192.168.1.100:8096`)
- API Key (generate in Emby Dashboard → API Keys)

#### Radarr / Sonarr
Add your Radarr/Sonarr servers in Settings. Requires:
- Server URL (e.g., `http://192.168.1.100:7878`)
- API Key (found in Settings → General)

#### MDBList
Get your API key from [mdblist.com/preferences](https://mdblist.com/preferences)

#### Trakt
Create an application at [trakt.tv/oauth/applications](https://trakt.tv/oauth/applications) to enable Trakt list imports.

## Development

```bash
# Start dev server with hot reload
npm run dev

# Run with Docker (dev mode)
docker compose -f docker-compose.dev.yml up

# Type check
npm run typecheck

# Run tests
npm test
```

## Tech Stack

- **Backend**: Fastify, Prisma, TypeScript
- **Frontend**: React, Vite, TailwindCSS
- **Database**: SQLite
- **Auth**: JWT

## License

MIT
