# One image per app:  docker build --build-arg APP=admin-mfe --build-arg PORT=3001 .
ARG NODE_IMAGE=node:22-alpine

# ---- deps (whole workspace, cached) ----
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/admin-mfe/package.json    apps/admin-mfe/
COPY apps/company-mfe/package.json  apps/company-mfe/
COPY apps/cuetrack/package.json     apps/cuetrack/
COPY apps/cuetrack-pay/package.json apps/cuetrack-pay/
RUN npm ci

# ---- build one app ----
FROM ${NODE_IMAGE} AS build
ARG APP
# Rewrites are baked into the build, so the backend address must be known here.
ARG BACKEND_URL=http://backend:8081
ENV BACKEND_URL=${BACKEND_URL} NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=apps/${APP} \
 && mkdir -p apps/${APP}/public

# ---- runtime ----
FROM ${NODE_IMAGE}
ARG APP
ARG PORT=3000
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=${PORT} HOSTNAME=0.0.0.0 APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE ${PORT}
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
