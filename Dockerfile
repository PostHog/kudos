# The service's image: HedgeHug as one Node process on one port. The host builds this file from the repo root on every push.
FROM node:24.21.0-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /src
RUN corepack enable
COPY . .
# The commit the copy serves on /healthz: the build argument when given, else HEAD read from the checkout's .git.
ARG HEDGEHUG_COMMIT=""
RUN HEDGEHUG_COMMIT="$HEDGEHUG_COMMIT" node service/scripts/write-commit.ts .
# The website's build, which the service serves from /app/website (service/src/website/hosting.ts).
RUN pnpm install --frozen-lockfile && pnpm website:build
# The service's production dependencies only, in a folder of their own.
RUN pnpm --filter @kudos/service deploy --prod /app \
  && cp service/COMMIT /app/COMMIT \
  && cp -r website/dist /app/website

FROM node:24.21.0-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
# NODE_USE_ENV_PROXY makes fetch honour HTTPS_PROXY, the host's only way out.
ENV NODE_ENV=production NODE_USE_ENV_PROXY=1 PORT=8080
WORKDIR /app
COPY --from=build --chown=1000:1000 /app /app
USER 1000
EXPOSE 8080
CMD ["node", "src/main.ts"]
