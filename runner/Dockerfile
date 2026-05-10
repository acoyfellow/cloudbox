FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates bash python3 make g++ \
  && npm install -g pnpm@10.20.0 bun \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /runner
COPY server.mjs /runner/server.mjs

ENV PORT=8080
EXPOSE 8080
CMD ["node", "/runner/server.mjs"]
