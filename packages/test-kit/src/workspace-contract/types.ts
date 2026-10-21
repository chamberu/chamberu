/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { IWorkspace } from '@chamvi/sandbox';

/** A fresh, repo-less workspace per call. */
export type WorkspaceContractFactory = () => Promise<IWorkspace>;
