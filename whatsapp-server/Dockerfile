# Reliable Puppeteer + Node base image
FROM ghcr.io/puppeteer/puppeteer:22

# Create app directory
WORKDIR /app

# Install dependencies first (leverage Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --only=production

# Copy source
COPY . .

# Environment optimizations for Puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Common chromium flags for containers (also set in code)
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

EXPOSE 3000
CMD ["npm", "start"]
