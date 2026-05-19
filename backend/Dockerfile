FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
# T012 Review-Fix: migrations/ wird zur Laufzeit von migrate:prod via
# join(__dirname, '..', '..', '..', 'migrations') geöffnet. Ohne diesen
# COPY würde npm run migrate:prod mit ENOENT abbrechen.
COPY migrations ./migrations
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
USER node
CMD ["node", "dist/server.js"]
