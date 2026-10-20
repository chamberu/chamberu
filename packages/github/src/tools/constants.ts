/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Most results `github_search_issues` returns. */
export const SEARCH_MAX_RESULTS = 20;

/** Results `github_search_issues` returns without a `limit`. */
export const SEARCH_DEFAULT_RESULTS = 10;

/** `github_get_file` cuts a file's text after this many characters. */
export const FILE_MAX_CHARS = 65_536;

/** Most labels one `github_add_labels` call adds. */
export const LABELS_MAX = 20;

/** `owner/name`, as the tools take a repository. */
export const REPO_PATTERN = '^[^/\\s]+/[^/\\s]+$';

/** The code of a failed GitHub request handed to the model as a tool error. */
export const GITHUB_REQUEST_ERROR_CODE = 'github_request';
