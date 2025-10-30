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
COPY package*.json ./

# Step 2: Install dependencies
RUN npm install --omit=dev --no-audit --no-fund --verbose

# Step 3: Install Puppeteer Chrome
RUN npx puppeteer browsers install chrome

# Step 4: Copy rest of the code
COPY . ./

# Set ownership
RUN chown -R pptruser:pptruser /app

# Switch back to non-root user
USER pptruser

EXPOSE 3000
CMD ["node", "server.js"]
