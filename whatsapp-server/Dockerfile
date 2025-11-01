FROM ghcr.io/puppeteer/puppeteer:22.10.0

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

# Wechsel zu pptruser, dann npm install
RUN chown -R pptruser:pptruser /app
USER pptruser
RUN npm ci --only=production

# Copy rest of app
COPY --chown=pptruser:pptruser . .

# Sessions folder
RUN mkdir -p ./sessions && chmod -R 755 ./sessions

EXPOSE 8080

CMD ["node", "server.js"]
