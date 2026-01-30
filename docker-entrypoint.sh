#!/bin/sh
set -e

SECRETS_FILE="/app/data/.secrets"

# Auto-generate secrets if not provided
if [ -z "$JWT_SECRET" ] || [ -z "$ENCRYPTION_KEY" ]; then
  # Check if we have previously generated secrets
  if [ -f "$SECRETS_FILE" ]; then
    echo "Loading existing secrets..."
    . "$SECRETS_FILE"
    export JWT_SECRET ENCRYPTION_KEY
  else
    echo "Generating new secrets..."
    JWT_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '\n')
    ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '\n')

    # Save for persistence across restarts
    mkdir -p /app/data
    cat > "$SECRETS_FILE" << EOF
JWT_SECRET="$JWT_SECRET"
ENCRYPTION_KEY="$ENCRYPTION_KEY"
EOF
    chmod 600 "$SECRETS_FILE"
    export JWT_SECRET ENCRYPTION_KEY
    echo "Secrets generated and saved."
  fi
fi

# Run database migrations and regenerate Prisma client
echo "Running database migrations..."
npx prisma db push --accept-data-loss
echo "Generating Prisma client..."
npx prisma generate

# Start the app
exec node dist-server/server.js
