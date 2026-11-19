FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/ui
WORKDIR /app
COPY --from=build /app/dist/relay.cjs /app/relay.cjs
COPY --from=build /app/dist/ui /app/ui
USER node
EXPOSE 8080
CMD ["node", "relay.cjs"]
