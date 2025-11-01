# Reliable Puppeteer + Node base image
FROM ghcr.io/puppeteer/puppeteer:22

# Environment variables - NO SECRETS HERE!
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# Set working directory
WORKDIR /app

# Switch to root for installation
USER root

# Step 1: Copy package files first (for Docker layer caching)
COPY whatsapp-server/package*.json ./

# Step 2: Install dependencies
RUN npm install --omit=dev --no-audit --no-fund --verbose

# Step 3: Verify whatsapp-web.js installation and install Puppeteer Chrome
RUN npm ls whatsapp-web.js || npm install whatsapp-web.js@^1.23.0 --no-audit --no-fund --verbose && \
    node_modules/.bin/puppeteer browsers install chrome || npx --yes puppeteer@22.10.0 browsers install chrome

# Step 4: Copy rest of the code
COPY whatsapp-server/. ./

# Step 5: Ensure dependencies after full copy (safety)
RUN npm install --omit=dev --no-audit --no-fund --verbose && \
    npm ls express && npm ls whatsapp-web.js

# Set ownership
RUN chown -R pptruser:pptruser /app

# Switch back to non-root user
USER pptruser

EXPOSE 3000
CMD ["node", "server.js"]
