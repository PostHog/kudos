# Spike only, never merged: HedgeHug on the open-source Convex backend in one container,
# shaped for an app host that gives one port, 512 MiB, 0.5 CPU, uid 1000, scratch disk only, and Postgres.
# Build from the repository root: docker build -f spike/self-host/Dockerfile -t kudos-spike .

FROM node:24-bookworm AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY website/package.json website/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --dir website build
RUN mkdir /pgclient && cd /pgclient && printf '{"name":"spike-pg","private":true}' > package.json && pnpm add pg@8.16.3
ARG EMBED_FONTS=1
ARG CARD_RENDER=executor
RUN if [ "$CARD_RENDER" = outside ]; then node spike/self-host/card-render-outside.mjs; elif [ "$EMBED_FONTS" = 1 ]; then node spike/self-host/embed-fonts.mjs; fi

# Bundle at build time: run the CLI once against a throwaway backend and keep the push request it would send,
# with every module in it, so the running container replays it without the CLI or esbuild.
FROM ghcr.io/convex/convex-backend@sha256:e9c084e8bd6c1f249012c672193f0988c748824f55a24cdad45f6185a8462f9a AS push
COPY --from=build /src /src
WORKDIR /src
RUN secret=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n') \
 && (/convex/convex-local-backend --instance-name push-build --instance-secret "$secret" --interface 127.0.0.1 --port 3290 --site-proxy-port 3291 --disable-beacon --local-storage /tmp/push-storage /tmp/push.sqlite3 > /tmp/push-backend.log 2>&1 &) \
 && for i in $(seq 1 100); do node -e 'fetch("http://127.0.0.1:3290/version").then(r=>process.exit(r.ok?0:1),()=>process.exit(1))' && break; sleep 0.3; done \
 && key=$(/convex/convex-local-backend keygen admin-key --instance-name push-build --instance-secret "$secret" | tail -1) \
 && CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3290 CONVEX_SELF_HOSTED_ADMIN_KEY="$key" node node_modules/convex/bin/main.js deploy --yes --typecheck disable --codegen disable --push-all-modules --write-push-request /src/push \
 && node -e 'const r=require("/src/push.json"); r.adminKey=""; require("fs").writeFileSync("/src/push.json", JSON.stringify(r)); console.log("modules", r.appDefinition.changedModules.length, "components", r.componentDefinitions.length, "deps", JSON.stringify(r.nodeDependencies))'

# The backend image's index digest, the same one the research measured; it carries arm64 and amd64.
FROM ghcr.io/convex/convex-backend@sha256:e9c084e8bd6c1f249012c672193f0988c748824f55a24cdad45f6185a8462f9a
RUN chmod 755 /convex/convex-local-backend /convex/generate_key /convex/*.sh
COPY --from=push --chown=1000:1000 /src/push.json /app/push.json
COPY --from=build --chown=1000:1000 /src/website/dist /app/website/dist
COPY --from=build --chown=1000:1000 /src/spike/self-host/supervisor.mjs /src/spike/self-host/push.mjs /src/spike/self-host/mirror.mjs /app/spike/
COPY --from=build --chown=1000:1000 /pgclient/node_modules /app/spike/node_modules
WORKDIR /app
USER 1000
ENV DATA_DIR=/tmp/convex HOME=/tmp/home NODE_ENV=production
ENTRYPOINT ["node", "/app/spike/supervisor.mjs"]
