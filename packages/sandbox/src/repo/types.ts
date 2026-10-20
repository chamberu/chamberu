/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export type NormalizeRepoOptions = {
    /** Accept `file:///absolute/path` (local development and tests). Default false. */
    allowFileRepos?: boolean;
    /** Narrows the accepted repositories further; gets the normalized URL. */
    allowRepo?: (url: string) => boolean;
};
