FROM ghcr.io/puppeteer/puppeteer:22.10.0

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV MAX_ACCOUNTS=20
ENV AUTO_INIT_ACCOUNTS=0

WORKDIR /app
USER root

# System Dependencies
RUN apt-get update && apt-get install -y \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first
COPY package*.json ./

# Install Node modules as root (so pptruser can access them)
RUN npm ci --only=production --no-audit --no-fund

# Copy rest of the application
COPY . .

# Sessions folder
RUN mkdir -p ./sessions && chmod -R 755 ./sessions

# Switch to non-root
USER pptruser

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
 CMD node -e "require('http').get('http://localhost:8080/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))" || exit 1

# Start server
CMD ["node", "server.js"]
