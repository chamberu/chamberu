# Kubernetes & Flux <Badge type="warning" text="Planned" />

::: warning Planned
The Helm chart and the template's Flux manifests do not exist yet.
:::

## Helm chart

One shared chart, published to an OCI registry and used by every agent app. Planned contents:

- **Deployment** with liveness (`/healthz`), readiness (`/readyz`) and startup probes, a long `terminationGracePeriodSeconds` (about 120 s) and a short `preStop` sleep, so the app fails readiness, drains and exits cleanly.
- **Service** and an optional **Ingress** for webhooks, the API and the UI.
- **`envFrom`** for one or more Secrets.
- Optional **CronJobs** for the one-shot `run-job` mode.
- When sandboxes are enabled: a **ServiceAccount and Role** to create, exec into and delete sandbox pods, and a **NetworkPolicy** that limits sandbox egress to DNS, the npm registry and GitHub.
- An optional **ServiceMonitor** for Prometheus.

The values stay small: image, environment, Secrets, ingress, replicas, sandbox and cron jobs.

## Graceful shutdown

On `SIGTERM` the app fails readiness first, stops the scheduler, stops intake, then calls `engine.drain()` within its budget. Runs still in progress are marked `interrupted` and recovered by another replica or the next pod. The drain deadline must be shorter than the grace period. This part already works in core: see [Cancel, Drain & Recovery](/guide/recovery#drain).

## Flux

Each agent repository gets:

- an `OCIRepository` for the chart and a `HelmRelease` with its values,
- an `ImageRepository` and an `ImagePolicy` that select the newest `main-<sha>-<timestamp>` tag (or a semver range),
- an image update marker in the `HelmRelease`, so Flux commits new tags back to the repository.

## Sandboxes in the cluster

Untrusted code runs in one pod per workspace: non-root, a read-only root filesystem except the workspace, CPU, memory and time limits, no service account token, no agent Secrets, and the egress-limiting NetworkPolicy. A short-lived, narrowly scoped GitHub token is injected only when a tool must push. Orphaned sandbox pods are garbage-collected.

## Replicas

See [Multiple Replicas](/deployment/replicas).
