FROM node:24-trixie-slim

LABEL org.opencontainers.image.source="https://github.com/chamberu/chamberu" \
      org.opencontainers.image.description="chamberu sandbox workspace: Node.js 24, git, tini, uid 1000" \
      org.opencontainers.image.licenses="Apache-2.0"

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir /workspace && chown 1000:1000 /workspace

# SANDBOX_ENV of @chamberu/sandbox, plus npm and corepack state under the
# writable /tmp (the root filesystem is read-only in a workspace).
ENV HOME=/tmp \
    GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=safe.directory \
    GIT_CONFIG_VALUE_0=/workspace \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    CI=true \
    NPM_CONFIG_CACHE=/tmp/.npm \
    NPM_CONFIG_PREFIX=/tmp/.npm-global \
    COREPACK_HOME=/tmp/.corepack \
    PATH=/tmp/.npm-global/bin:$PATH

# the image's node user
USER 1000:1000

WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["sleep", "infinity"]
