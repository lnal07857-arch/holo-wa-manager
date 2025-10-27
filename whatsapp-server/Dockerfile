# Reliable Puppeteer + Node base image
FROM ghcr.io/puppeteer/puppeteer:22

# Environment variables
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"
ENV SUPABASE_URL="https://umizkegxybjhqucbhgth.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4"

# Set working directory
WORKDIR /app

# Switch to root for installation
USER root

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --force && \
    npx puppeteer browsers install chrome && \
    chown -R pptruser:pptruser /app

# Copy application files
COPY . ./

# Ensure correct ownership
RUN chown -R pptruser:pptruser /app

# Switch back to non-root user
USER pptruser

EXPOSE 3000
CMD ["node", "server.js"]
