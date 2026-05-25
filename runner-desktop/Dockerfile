FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git ca-certificates bash python3 make g++ \
    chromium curl fluxbox novnc shellinabox supervisor tini websockify x11vnc xvfb \
    fonts-liberation libnss3 libxss1 libasound2 \
  && npm install -g pnpm@10.20.0 bun \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /runner
COPY server.mjs /runner/server.mjs
COPY runner-desktop/supervisord-desktop.conf /etc/supervisor/conf.d/cloudbox.conf

ENV PORT=8080
EXPOSE 8080
CMD ["/usr/bin/tini", "--", "/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/cloudbox.conf"]
