<p align="center">
    <img src="https://raw.githubusercontent.com/chamberu/chamberu/master/.github/assets/logo.svg" alt="@chamberu/sandbox-k8s" width="128" height="128" />
</p>

<h1 align="center">@chamberu/sandbox-k8s</h1>

<p align="center">
    <b>One hardened pod per workspace, for chamberu agents on Kubernetes.</b><br>
    Non-root, a read-only root, no capabilities, no service account token, resource limits<br>
    and <code>activeDeadlineSeconds</code>: a pod that cleans up after itself.
</p>

<p align="center">
    <a href="https://www.npmjs.com/package/@chamberu/sandbox-k8s"><img src="https://img.shields.io/npm/v/@chamberu/sandbox-k8s" alt="npm version" /></a>
    <a href="https://github.com/chamberu/chamberu/actions/workflows/ci.yml"><img src="https://github.com/chamberu/chamberu/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/chamberu/chamberu/blob/master/packages/sandbox-k8s/LICENSE"><img src="https://img.shields.io/npm/l/@chamberu/sandbox-k8s" alt="License" /></a>
</p>

---

**Table of Contents**
- [Installation](#installation)
- [Usage](#usage)
- [RBAC](#rbac)
- [The pod](#the-pod)
- [Image](#image)
- [Security](#security)
- [Timeouts and abort](#timeouts-and-abort)
- [Garbage collection](#garbage-collection)
- [Options](#options)
- [API](#api)
- [License](#license)

## Installation

```bash
npm install @chamberu/sandbox-k8s @chamberu/sandbox @chamberu/core ai --save
```

ESM only, Node.js `>=22`. `@chamberu/core` and `@chamberu/sandbox` are peer dependencies. The API server is reached through [`@kubernetes/client-node`](https://www.npmjs.com/package/@kubernetes/client-node) 2 (`CoreV1Api` and `Exec` over a WebSocket). It declares `@types/node` `^26` as a runtime dependency, so a project on older Node.js types gets a nested copy; that is harmless with `skipLibCheck`.

## Usage

```typescript
import type { KubeConfig } from '@kubernetes/client-node';
import type { ISandboxProvider } from '@chamberu/sandbox';
import { createKubernetesSandbox } from '@chamberu/sandbox-k8s';

export function createSandbox(kubeConfig: KubeConfig): ISandboxProvider {
    // one pod per workspace in this namespace; nothing is contacted before the first create()
    return createKubernetesSandbox({ namespace: 'agents', kubeConfig });
}
```

Without `kubeConfig` the provider calls `loadFromDefault()`: the in-cluster service account when chamberu runs in a pod, else `KUBECONFIG` or `~/.kube/config`. Pass the provider to `createWorkspaceManager({ provider })` from `@chamberu/sandbox`. Creating it contacts nothing; `create()` creates the pod, waits until it runs (polling every second, at most two minutes, failing fast on `ErrImagePull`, `ImagePullBackOff`, `InvalidImageName`, `CreateContainerConfigError` and `CreateContainerError`), then checks out.

## RBAC

The identity chamberu runs as needs, in the sandbox namespace only:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: chamberu-sandbox
  namespace: agents
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["create", "get", "list", "delete"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["get", "create"]
```

`pods/exec` needs both verbs: the client opens the exec WebSocket with a `GET`, which the API server authorizes as `get`, while servers with the WebSocket-upgrade authorization change ask for `create`. Keep the sandbox namespace apart from chamberu's own, so the pods never share a namespace with its secrets.

## The pod

Each workspace is a bare pod `chamberu-ws-<id>` with one container `sandbox`:

| Setting | Value |
|---|---|
| Pod | `restartPolicy: Never`, `automountServiceAccountToken: false`, `enableServiceLinks: false`, `activeDeadlineSeconds: <lifetime>`, `terminationGracePeriodSeconds: 5` |
| Pod security | `runAsNonRoot`, uid and gid 1000, `fsGroup: 1000`, seccomp `RuntimeDefault` |
| Container security | `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, not privileged, all capabilities dropped |
| Command | the image's entrypoint (`tini`) with `sleep <lifetime in seconds>` |
| Resources | requests equal limits: `cpu`, `memory`, `ephemeral-storage` from `storage` |
| `/workspace` | an emptyDir with `sizeLimit` from `storage` |
| `/tmp` | a memory-backed emptyDir of 512 MiB |
| Environment | `SANDBOX_ENV` plus `env`, nothing from chamberu's pod |
| Labels | `podLabels`, then `app.kubernetes.io/managed-by=chamberu`, `app.kubernetes.io/component=sandbox`, `chamberu.dev/run=<runId>`, `chamberu.dev/workspace=<id>` (the managed labels win; `podLabels` naming one throws; a `runId` that is no label value is a `ValidationError`, engine run ids are UUIDs) |
| Annotation | `chamberu.dev/expires-at=<epoch ms>` |

A pod is used rather than a Job: exec needs a pod name known at create time, and a Job's controller, retries and generated names add nothing the pod spec does not already enforce.

`limits.pids` has no per-pod field in Kubernetes: the kubelet's `podPidsLimit` applies, so set it on the nodes that run sandboxes.

## Image

The default image is `ghcr.io/chamberu/sandbox-node:24` (`DEFAULT_SANDBOX_IMAGE`), built for `linux/amd64` and `linux/arm64` from [`images/sandbox-node`](../../images/sandbox-node); tags `24` (rebuilt on changes and weekly) and `24-<short sha>`. `imagePullPolicy` defaults to `'IfNotPresent'`; use `'Always'` to follow the mutable `24` tag, or pin a digest in production (`image: 'ghcr.io/chamberu/sandbox-node@sha256:...'`).

## Security

- **Not a network boundary.** Without a NetworkPolicy a workspace pod reaches every service in the cluster by DNS, the chamberu API and its database included, and cloud metadata. Select the pods by `app.kubernetes.io/component=sandbox` (or your `podLabels`) and deny all egress except what the work needs (GitHub, the npm registry), the chamberu namespace and `169.254.169.254` explicitly denied. The Helm chart will ship this policy.
- **No credentials**: no service account token is mounted, no service links are injected, and no chamberu environment variable reaches the pod.
- **Prompt injection**: what the model runs follows what it reads. Narrow `allowRepo` on the manager and put `bash` behind an approval where needed.

## Timeouts and abort

Every command runs as `timeout -k 5 <seconds> <argv>`, which signals its whole process group. A client-side guard stops waiting 15 s after the timeout and reports exit 137 with the output so far. Kubernetes sends an exec's exit status only once every process holding its output closed it, so the command reports its exit on stderr itself: one that exits while a background job it started holds its output (`node server.js & echo started`) returns about 2 s after its exit with its own exit code, and the job runs on until the pod is deleted. An abort (`signal`) **detaches**: the exec WebSocket closes, and the command runs on until its `timeout` fires or the pod is deleted. Every settled run disposes its workspaces (`manager.attach(engine)`), and a drain is followed by `manager.close()`. A dispose deletes the pod without a grace period.

Stdin is closed only on the `v5.channel.k8s.io` exec protocol (Kubernetes 1.30+); on `v4` it is written but never closed, so a command waiting for stdin EOF hangs until its timeout. `writeFile` does not depend on it (`head -c <bytes>`).

## Garbage collection

`collectGarbage()` lists the namespace's pods with the managed labels and deletes those past their `chamberu.dev/expires-at` annotation and those in phase `Failed` or `Succeeded` (open workspaces of this process are disposed first). The manager calls it from `acquire` at most every 10 minutes; `activeDeadlineSeconds` stops a pod at expiry even when no collection runs. A pod that cannot be removed does not stop the pass: the others go, and one `SandboxError` with the count and the first failure is thrown at the end.

## Options

`createKubernetesSandbox(options)`:

| Option | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | required | Namespace of the workspace pods |
| `kubeConfig` | `KubeConfig` | `loadFromDefault()` | Cluster access |
| `image` | `string` | `DEFAULT_SANDBOX_IMAGE` | The workspace image; pin a digest in production |
| `imagePullPolicy` | `'IfNotPresent' \| 'Always'` | `'IfNotPresent'` | `'Always'` for a mutable tag |
| `env` | `Record<string, string>` | none | Added after `SANDBOX_ENV` |
| `limits` | `SandboxLimits` | `DEFAULT_LIMITS` | `cpu`, `memory`, `storage`, `timeoutMs` (`pids`: see above) |
| `podLabels` | `Record<string, string>` | none | Extra labels, e.g. for a NetworkPolicy; may not name a managed label |
| `startTimeoutMs` | `number` | `120_000` | How long `create` waits for the pod to run |
| `pollMs` | `number` | `1_000` | Status poll interval while it waits |
| `clock` | `IClock` | `systemClock` | Polls, expiry and the exec guard |
| `client` | `IPodClient` | `createPodClient()` | Test seam |

Misconfiguration throws core `InvalidAgentDefinitionError`; API and pod failures are `SandboxError`s.

## API

| Export | Kind | Purpose |
|---|---|---|
| `createKubernetesSandbox` | function | The `ISandboxProvider` (`name: 'k8s'`) |
| `createPodClient` | function | The `IPodClient` over `@kubernetes/client-node` |
| `CONTAINER_NAME` | constant | `'sandbox'` |
| `POD_NAME_PREFIX` | constant | `'chamberu-ws-'` |
| `START_TIMEOUT_MS`, `POLL_MS` | constant | `120_000`, `1_000` |
| `FATAL_WAITING_REASONS` | constant | The container waiting reasons `create` fails on at once |

Types: `KubernetesSandboxOptions`, `IPodClient`, `PodExecInput`, `CreatePodClientInput`.

## License

Published under [Apache License 2.0](./LICENSE).
