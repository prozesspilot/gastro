# Web-Chat-Widget (chat.prozesspilot.net) — Multi-Stage wie onboarding-wizard/Dockerfile.
# Vite-Static-Build, dann von nginx ausgeliefert. Kein VITE_-Build-Arg: das Widget
# ruft das Backend relativ über /api/v1/chat auf, das nginx (nginx.conf) an
# backend:3000 weiterleitet (inkl. SSE).
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:1.25-alpine AS runtime
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
