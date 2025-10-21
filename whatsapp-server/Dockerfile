# Reliable Puppeteer + Node base image
FROM ghcr.io/puppeteer/puppeteer:22

# Create app directory
WORKDIR /app

# Install dependencies first
COPY package*.json ./

# Set env to prevent Puppeteer download
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies with clean slate
RUN rm -rf node_modules package-lock.json && npm install --production --force

# Copy source
COPY . ./

# Runtime environment
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"
# Public backend values baked in so you don't need to edit Railway Variables
ENV SUPABASE_URL="https://umizkegxybjhqucbhgth.supabase.co"
ENV SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtaXprZWd4eWJqaHF1Y2JoZ3RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NzM0MjQsImV4cCI6MjA3NjU0OTQyNH0.t_C139tgMw__bCBTUkF-kgCaG3-MKKsukmYB8FQr-k4"

EXPOSE 3000
CMD ["npm", "start"]
