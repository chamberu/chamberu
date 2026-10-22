/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import type { AgentIssue } from '@chamvi/http';
import { messageOf, relativize } from '../../loader/helpers.ts';
import { hashAgentFolder, listAgentFolders, loadAgent } from '../../loader/module.ts';
import type { LoadedAgent } from '../../loader/types.ts';
import { isDirectory } from './helpers.ts';
import type { AgentsWatcherOptions, IAgentsWatcher } from './types.ts';

/**
 * The agents dir's loader and polling watcher. Per folder it keeps the hash
 * its agent is registered at (`applied`), the hash it last tried to load
 * (`attempted`, so a broken folder is tried once per content) and the hash
 * the previous poll saw (`seen`): a folder whose hash differs from the
 * attempted one is loaded once a poll sees the same hash as the poll before
 * (stable for one interval). A folder absent on two consecutive polls is
 * removed from the engine. A failed load keeps the registered agent and
 * writes no revision marker.
 */
export function createAgentsWatcher(options: AgentsWatcherOptions): IAgentsWatcher {
    const {
        root,
        engine,
        codeNames,
        check,
        clock,
        logger,
        pollMs,
        signal,
    } = options;

    const issues = new Map<string, AgentIssue>();
    const applied = new Map<string, string>();
    const attempted = new Map<string, string>();
    const seen = new Map<string, string>();
    const missing = new Set<string>();

    let timer: { clear(): void } | undefined;
    let started = false;
    let stopped = false;
    let inFlight: Promise<void> | undefined;
    let rootGone = false;

    const record = (agent: string, message: string) => {
        issues.set(agent, {
            agent,
            message,
            at: clock.now(),
        });
        logger.warn('agent load failed', { agent, message });
    };

    /** Loads the folder (hashed to `hash` just before) and registers its agent, unless that is refused. */
    const apply = async (name: string, hash: string): Promise<void> => {
        attempted.set(name, hash);
        if (codeNames.has(name)) {
            record(name, `${name}: a code agent has this name; the folder is not loaded.`);
            return;
        }

        let loaded: LoadedAgent;
        try {
            loaded = await loadAgent(join(root, name));
        } catch (error) {
            record(name, relativize(messageOf(error), root));
            return;
        }
        // the content read, which an edit while loading may have moved past `hash`
        attempted.set(name, loaded.hash);

        try {
            check(loaded.agent);
        } catch (error) {
            record(name, relativize(messageOf(error), root));
            return;
        }

        await engine.putAgent(loaded.agent, { revision: loaded.hash });
        applied.set(name, loaded.hash);
        issues.delete(name);
    };

    const poll = async (): Promise<void> => {
        if (!await isDirectory(root)) {
            // an unmounted volume must not remove every agent
            if (!rootGone) logger.warn('the agents dir is gone; its agents stay loaded until it is back');
            rootGone = true;
            return;
        }
        rootGone = false;

        const names = await listAgentFolders(root);
        const present = new Set(names);
        for (const name of names) {
            missing.delete(name);
            let hash: string;
            try {
                hash = await hashAgentFolder(join(root, name));
            } catch {
                // removed while polling: the next poll sees it gone
                continue;
            }
            const previous = seen.get(name);
            seen.set(name, hash);
            if (hash === attempted.get(name) || hash !== previous) continue;
            if (hash === applied.get(name)) {
                // back to the registered content: nothing to reload
                attempted.set(name, hash);
                issues.delete(name);
                continue;
            }

            try {
                await apply(name, hash);
            } catch (error) {
                // the store failed: try again on a later poll
                attempted.delete(name);
                logger.error('agent reload failed', error, { agent: name });
            }
        }

        const tracked = new Set([...seen.keys(), ...applied.keys(), ...issues.keys()]);
        for (const name of tracked) {
            if (present.has(name)) continue;
            if (!missing.has(name)) {
                missing.add(name);
                continue;
            }

            if (!codeNames.has(name)) {
                try {
                    await engine.removeAgent(name);
                } catch (error) {
                    // still missing on the next poll: removed then
                    logger.error('agent removal failed', error, { agent: name });
                    continue;
                }
            }
            missing.delete(name);
            seen.delete(name);
            attempted.delete(name);
            applied.delete(name);
            issues.delete(name);
        }
    };

    const arm = () => {
        if (stopped) return;
        timer = clock.setTimeout(() => {
            timer = undefined;
            inFlight = poll()
                .catch((error: unknown) => {
                    logger.error('agents dir poll failed', error);
                })
                .finally(() => {
                    inFlight = undefined;
                    arm();
                });
        }, pollMs, { keepAlive: false });
    };

    return {
        async boot() {
            const names = await listAgentFolders(root);
            for (const name of names) {
                if (signal?.aborted) throw signal.reason;
                let hash: string;
                try {
                    hash = await hashAgentFolder(join(root, name));
                } catch (error) {
                    record(name, relativize(messageOf(error), root));
                    continue;
                }
                seen.set(name, hash);
                await apply(name, hash);
            }

            const folders = new Set(names);
            for (const marker of await engine.store.listAgentRevisions()) {
                if (folders.has(marker.agent) || codeNames.has(marker.agent)) continue;
                await engine.removeAgent(marker.agent);
            }
        },
        start() {
            if (started || stopped) return;
            started = true;
            arm();
        },
        async stop() {
            stopped = true;
            timer?.clear();
            timer = undefined;
            await inFlight;
        },
        async idle() {
            await inFlight;
        },
        issues() {
            return issues.values().toArray().map((issue) => ({ ...issue }));
        },
    };
}
