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
- When sandboxes are enabled: a **ServiceAccount and Role** for the sandbox pods (the verbs below), and a **NetworkPolicy** that limits sandbox egress to DNS, the npm registry and GitHub.
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

[`@chamberu/sandbox-k8s`](/reference/sandbox#chamberu-sandbox-k8s) ships today; only the chart that wires it up is planned. Untrusted code runs in one bare pod per workspace (`chamberu-ws-<id>`):

- `runAsNonRoot` as uid 1000, seccomp `RuntimeDefault`, a read-only root filesystem, no capabilities, no privilege escalation
- `automountServiceAccountToken: false`, `enableServiceLinks: false`, no chamberu Secrets or environment
- requests equal to limits for `cpu`, `memory` and `ephemeral-storage`; `/workspace` an emptyDir with a `sizeLimit`, `/tmp` a 512 MiB memory emptyDir; pids through the kubelet's `podPidsLimit`
- `restartPolicy: Never` and `activeDeadlineSeconds` set to the workspace lifetime, so a pod stops itself at expiry
- labels `app.kubernetes.io/managed-by=chamberu`, `app.kubernetes.io/component=sandbox`, `chamberu.dev/run=<runId>`, `chamberu.dev/workspace=<id>` plus your `podLabels`; the expiry as the annotation `chamberu.dev/expires-at`

Expired, failed and finished sandbox pods are garbage-collected by the provider. Run the pods in their own namespace and give chamberu's service account this Role there:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: chamberu-sandbox
  namespace: agents-sandbox
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["create", "get", "list", "delete"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["get", "create"]
```

`pods/exec` needs both `get` (the exec WebSocket opens with a GET) and `create` (API servers with the WebSocket-upgrade authorization change).

::: danger Not a network boundary yet
Without a NetworkPolicy a workspace pod reaches every service in the cluster, the chamberu API and its database included, and cloud metadata. Until the chart ships its policy, add one that selects `app.kubernetes.io/component=sandbox` and denies all egress except DNS, GitHub and the npm registry, with the chamberu namespace and `169.254.169.254` denied explicitly.
:::

A short-lived, narrowly scoped GitHub token for a sandbox that must push is planned.

## Replicas

See [Multiple Replicas](/deployment/replicas).
