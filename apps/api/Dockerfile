# Repo kökünden build et:  docker build -f apps/api/Dockerfile -t github-viz-api .
# Çalıştır:                docker run -p 8787:8787 -e GITHUB_TOKEN=xxx github-viz-api
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @viz/api --include-workspace-root=false
COPY packages/core packages/core
COPY apps/api apps/api
ENV PORT=8787 CACHE_DIR=/tmp/cache NODE_ENV=production
EXPOSE 8787
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]
