import { createDockerSandbox } from '@chamberu/sandbox-docker';
import { createKubernetesSandbox } from '@chamberu/sandbox-k8s';

export function docker() {
    // #region docker
    const provider = createDockerSandbox({
        // pin a digest in production
        image: 'ghcr.io/chamberu/sandbox-node:24',
        // a bridge without inter-container traffic, firewalled from the host
        network: 'chamberu-sandbox',
        limits: {
            cpu: '2', 
            memory: '4Gi', 
            pids: 1024, 
        },
    });
    // #endregion docker
    return provider;
}

export function kubernetes() {
    // #region k8s
    // in-cluster service account or KUBECONFIG
    const provider = createKubernetesSandbox({
        namespace: 'agents-sandbox',
        podLabels: { 'example.com/egress': 'restricted' },
        limits: {
            cpu: '2', 
            memory: '4Gi', 
            storage: '8Gi', 
        },
    });
    // #endregion k8s
    return provider;
}
