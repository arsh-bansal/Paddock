# Paddock: one container serving the web app and the API.
# Works on Google Cloud Run, Render, Railway and Fly.io. The platform sets PORT.

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- run ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Runtime climate cache for non-preset locations (temporary disk is fine).
ENV PADDOCK_CACHE_DIR=/tmp/paddock-cache
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Preset districts' climate data, so they load instantly without calling Open-Meteo.
COPY --from=build /app/data/snapshot ./data/snapshot
USER node
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist-server/index.js"]
