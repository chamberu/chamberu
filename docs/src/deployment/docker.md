# Docker Image <Badge type="warning" text="Planned" />

::: warning Planned
Neither the base image nor the CLI build command exists yet.
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

Agents that run untrusted code (reproducing a bug, running tests) use a separate sandbox image, planned as `ghcr.io/chamberu/sandbox-node`: Node 24, git and npm, a non-root user and a read-only root filesystem except the workspace. It runs as its own pod, never inside the agent's container.
