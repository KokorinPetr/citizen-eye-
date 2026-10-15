# Civic Eye web app: build static files with Node, serve them with nginx.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The API URL is baked into the static files at build time.
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/locations.conf /etc/nginx/snippets/civic-eye-locations.conf
COPY nginx/tls.conf /etc/nginx/optional/tls.conf
# Executable bit comes from git (chmod +x), no BuildKit-only flags needed.
COPY nginx/40-enable-tls.sh /docker-entrypoint.d/40-enable-tls.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
