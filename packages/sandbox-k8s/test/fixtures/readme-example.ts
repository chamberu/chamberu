import type { KubeConfig } from '@kubernetes/client-node';
import type { ISandboxProvider } from '@chamberu/sandbox';
import { createKubernetesSandbox } from '@chamberu/sandbox-k8s';

export function createSandbox(kubeConfig: KubeConfig): ISandboxProvider {
    // one pod per workspace in this namespace; nothing is contacted before the first create()
    return createKubernetesSandbox({ namespace: 'agents', kubeConfig });
}
