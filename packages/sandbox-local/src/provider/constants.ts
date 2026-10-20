/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export const LOCAL_PROVIDER_NAME = 'local';

/** Folder under `os.tmpdir()` when no `root` is given. */
export const DEFAULT_ROOT_NAME = 'chamberu-workspaces';

/** `{ runId, expiresAt }` of a workspace, read by the garbage collection. */
export const WORKSPACE_RECORD = 'workspace.json';

/** The workspace root (`/workspace` for the model) inside a workspace folder. */
export const REPO_DIR = 'repo';

/**
 * After a kill, how long the output pipes may stay open (held by a process
 * that left the group) before they are closed and the exec settles.
 */
export const KILL_GRACE_MS = 2_000;

/** PATH when the host has none. */
export const FALLBACK_PATH = '/usr/local/bin:/usr/bin:/bin';

export const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
