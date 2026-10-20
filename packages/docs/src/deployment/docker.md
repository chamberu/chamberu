# Docker Image <Badge type="warning" text="Planned" />

::: warning Planned
Neither the base image nor the CLI build command exists yet. The [sandbox image](#sandbox-image) does.
:::

## Base image

A base runtime image, planned as `ghcr.io/chamberu/node`: Node 24, slim or distroless, running as a non-root user. It is built for several architectures and referenced by digest from the template repository.

## Agent images

Agent repositories use a two-stage Dockerfile from the template:

1. **Build stage:** install dependencies and bundle the app entry with `chamberu build`.
2. **Runtime stage:** copy the bundle onto the base image and start it with an exec-form `CMD`, so `SIGTERM` reaches Node directly and the engine can [drain](/guide/recovery#drain).

The same image serves every mode: the long-running app, and a one-shot `chamberu run-job <agent> <trigger>` for clusters that prefer Kubernetes CronJobs over in-process scheduling.

## Tags for Flux

The template's CI pushes images tagged `main-<sha>-<unix timestamp>` for every push to the main branch, plus semver tags for releases. Flux image automation picks the newest tag and updates the `HelmRelease`. See [Kubernetes & Flux](/deployment/kubernetes).

## Sandbox image

Agents that run untrusted code (reproducing a bug, running tests) do it in [workspaces](/guide/workspaces) from a separate image, `ghcr.io/chamberu/sandbox-node`, built from [`images/sandbox-node`](https://github.com/chamberu/chamberu/tree/master/images/sandbox-node). It runs as its own container (`@chamberu/sandbox-docker`) or pod (`@chamberu/sandbox-k8s`), never inside the agent's container.

- **Contents:** `node:24-trixie-slim` (Node.js 24, npm, corepack), git, ca-certificates, `tini` as the entrypoint, GNU coreutils `timeout`; `/workspace` owned by uid 1000, `USER 1000:1000`. npm's cache, global prefix and corepack live under `/tmp`, so everything works on the read-only root filesystem the providers enforce.
- **Platforms:** `linux/amd64` and `linux/arm64`.
- **Tags:** `24`, rebuilt on every change under `images/` on `master` and weekly for base image security updates, and `24-<short sha>`, one immutable tag per build. Pull requests that touch the image build and smoke-test it without pushing.
- **Pinning:** reference a digest in production (`ghcr.io/chamberu/sandbox-node@sha256:...`), or follow the mutable `24` tag with `pull: 'always'` (Docker) or `imagePullPolicy: 'Always'` (Kubernetes).
- **Extending:** build `FROM ghcr.io/chamberu/sandbox-node:24`, install packages as root, switch back to `USER 1000:1000` and pass the image as `image` to the provider. The providers need `sh`, `cat`, `head`, `mkdir`, `dirname`, GNU `timeout` and `git`.

On a Docker host, the agent needs access to the Docker API to start sandbox containers. That access is root on the host: give the agent a socket proxy that allows only containers, exec and images, or run rootless Docker. See [`@chamberu/sandbox-docker`](/reference/sandbox#chamberu-sandbox-docker).
