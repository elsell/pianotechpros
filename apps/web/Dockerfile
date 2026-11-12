# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM registry.access.redhat.com/hi/nodejs:26.13.1-builder-1794445770@sha256:bea5418fc36a5e77a4497f9d71f5800ac862f7e48ec7ccbb218cac25581a3390 AS build
ENV NPM_CONFIG_PREFIX=/tmp/npm-global PATH=/tmp/npm-global/bin:$PATH
WORKDIR /app
RUN npm install --global pnpm@11.0.7
COPY --chown=65532:0 package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=65532:0 apps/web/package.json apps/web/package.json
COPY --chown=65532:0 apps/mobile/package.json apps/mobile/package.json
COPY --chown=65532:0 packages/api-client/package.json packages/api-client/package.json
COPY --chown=65532:0 packages/client-core/package.json packages/client-core/package.json
COPY --chown=65532:0 packages/i18n/package.json packages/i18n/package.json
COPY --chown=65532:0 patches patches
RUN pnpm install --frozen-lockfile
COPY --chown=65532:0 apps/web apps/web
COPY --chown=65532:0 packages/api-client packages/api-client
COPY --chown=65532:0 packages/client-core packages/client-core
COPY --chown=65532:0 packages/i18n packages/i18n
RUN pnpm --dir apps/web build
RUN pnpm --filter @pianotechpros/web deploy --legacy --prod /app/prod

FROM registry.access.redhat.com/hi/nodejs:26.13.1-fips-builder-1794445770@sha256:4d49fd123f232e6e98fb25d641250e8ee4cee01ffd6fa9cc715869972372fa35
ENV NODE_ENV=production PIANOTECHPROS_APP_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=65532:0 /app/prod ./
USER 65532
EXPOSE 3000
CMD ["node", "build"]
