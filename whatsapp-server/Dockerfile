# Reliable Puppeteer + Node base image
FROM ghcr.io/puppeteer/puppeteer:22

# Create app directory
WORKDIR /app

# Copy entire context (works whether context is repo root or whatsapp-server subdir)
COPY . ./

# Environment
ENV NODE_ENV=production
# Force Puppeteer to download bundled Chromium during npm install
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"
# Public backend values baked in so you don't need to edit Railway Variables
ENV SUPABASE_URL="https://umizkegxybjhqucbhgth.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4"

# Use root for installation to avoid EACCES, then give ownership back
USER root

# Install dependencies depending on where package.json is (ensure browser is installed)
RUN set -eux; \
    if [ -f ./whatsapp-server/package.json ]; then \
      cd ./whatsapp-server && npm install --omit=dev --force && npx puppeteer browsers install chrome; \
    elif [ -f ./package.json ]; then \
      npm install --omit=dev --force && npx puppeteer browsers install chrome; \
    else \
      echo "No package.json found" && ls -la && exit 1; \
    fi && \
    chown -R pptruser:pptruser /app

# Create start script that selects the correct working directory
RUN printf "#!/bin/sh\nset -e\n\nif [ -f '/app/whatsapp-server/server.js' ]; then\n  cd /app/whatsapp-server\nelif [ -f '/app/server.js' ]; then\n  cd /app\nelse\n  echo 'server.js not found in /app or /app/whatsapp-server'\n  ls -la /app\n  exit 1\nfi\n\nexec node server.js\n" > /app/start.sh \
  && chmod +x /app/start.sh

# Run as non-root for security
USER pptruser

EXPOSE 3000
CMD ["sh", "/app/start.sh"]
