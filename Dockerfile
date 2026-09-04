# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# YooLab Studio — container image.
#
# The repo already has two deployment targets wired into `vite.config.ts`:
# Cloudflare (the local / OpenAI Sites path) and Nitro (the Vercel path). A
# container is a third, and it needs neither a new config nor a new plugin —
# it is the same Nitro path pointed at a different preset. `NITRO_PRESET` is
# Nitro's own variable and `vite.config.ts` reads it before falling back to
# Vercel detection, so setting it to `node-server` is the whole switch: the
# Cloudflare plugin is never imported, and Nitro emits a self-contained Node
# server into `.output/`.
#
# That output is why the runner stage carries no `node_modules` and no
# lockfile. Nitro bundles the server's dependencies into `.output/server`
# and the client assets into `.output/public`, so the runtime image is Node
# plus a directory.
#
#   docker build -t yoolab-studio .
#   docker run --init -p 3000:3000 yoolab-studio
#
# `--init` is worth the six characters: it gives PID 1 to a reaper that
# forwards SIGTERM, so `docker stop` is immediate rather than a ten-second
# timeout.
# ---------------------------------------------------------------------------

# Debian slim rather than Alpine on both stages. The build installs `wrangler`
# and `@cloudflare/vite-plugin` — they are unused on this path but they are
# still in `devDependencies`, and workerd's prebuilt binaries are glibc-linked.
# Keeping one base for both stages also keeps the runtime byte-identical to
# what the build was verified against.
ARG NODE_VERSION=22-bookworm-slim


# --- deps ------------------------------------------------------------------
# Split from the build so that a source-only change reuses the install layer.
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# `npm ci`, not `npm install`: it installs exactly the tree in the lockfile and
# fails rather than silently rewriting it. Dev dependencies are required —
# vite, vinext and nitro all live there.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci


# --- build -----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# `NEXT_PUBLIC_*` values are inlined into the client bundle at build time, and
# the `/` route is prerendered during this build, so these have to be present
# here — setting them at `docker run` is too late and silently produces an app
# pointing at nothing. Each defaults to empty, which is what `app/lib/auth/
# config.ts` already falls back to, so an unconfigured build still succeeds.
ARG NEXT_PUBLIC_SITE_URL=https://yoolab.vn
ARG NEXT_PUBLIC_BASE_URL=
ARG NEXT_PUBLIC_DOMAIN=
ARG NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID=
ARG NEXT_PUBLIC_FACEBOOK_APP_ID=
ARG NEXT_PUBLIC_FACEBOOK_CLIENT_ID=
ARG NEXT_PUBLIC_REDIRECT_URI_APPLE_LOGIN=
ARG NEXT_PUBLIC_URL_SHARE_HOTSPOT360=
ARG NEXT_PUBLIC_URL_SHARE_TOUR360=
ARG NEXT_PUBLIC_URL_SHARE_MODEL3D=

ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_BASE_URL=${NEXT_PUBLIC_BASE_URL} \
    NEXT_PUBLIC_DOMAIN=${NEXT_PUBLIC_DOMAIN} \
    NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_AUTH_CLIENT_ID} \
    NEXT_PUBLIC_FACEBOOK_APP_ID=${NEXT_PUBLIC_FACEBOOK_APP_ID} \
    NEXT_PUBLIC_FACEBOOK_CLIENT_ID=${NEXT_PUBLIC_FACEBOOK_CLIENT_ID} \
    NEXT_PUBLIC_REDIRECT_URI_APPLE_LOGIN=${NEXT_PUBLIC_REDIRECT_URI_APPLE_LOGIN} \
    NEXT_PUBLIC_URL_SHARE_HOTSPOT360=${NEXT_PUBLIC_URL_SHARE_HOTSPOT360} \
    NEXT_PUBLIC_URL_SHARE_TOUR360=${NEXT_PUBLIC_URL_SHARE_TOUR360} \
    NEXT_PUBLIC_URL_SHARE_MODEL3D=${NEXT_PUBLIC_URL_SHARE_MODEL3D}

ENV NODE_ENV=production \
    NITRO_PRESET=node-server

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Plain `vite build`, which is what vinext's Nitro path documents and what
# `scripts/build-vercel.mjs` ultimately spawns. That script is not reused here
# because its only job is setting `NITRO_PRESET` in Node instead of the shell —
# a Windows workaround, irrelevant in a Linux image where `ENV` above does it.
RUN ./node_modules/.bin/vite build


# --- runtime ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# The `node` user ships with the base image; using it avoids running the
# server as root without needing to create anything.
COPY --from=build --chown=node:node /app/.output ./.output
USER node

EXPOSE 3000

# No curl or wget in a slim image, and installing one to poll a port is a poor
# trade. Node 22 has a global `fetch`, so the runtime already has everything
# this needs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
