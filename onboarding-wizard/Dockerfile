# Onboarding-Wizard (setup.prozesspilot.net) — Multi-Stage wie webapp/Dockerfile.
# Build der Vite-Static, dann von nginx ausgeliefert. Kein VITE_-Build-Arg:
# der Wizard ruft das Backend über den relativen Pfad /api/v1/wizard auf, den
# nginx (siehe nginx.conf) an backend:3000 weiterleitet.
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
