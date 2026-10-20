/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/** Lines `read_file` returns at most (its `limit` default and maximum). */
export const READ_MAX_LINES = 2_000;

/** Characters `read_file` returns at most. */
export const READ_MAX_CHARS = 65_536;

/** Matches `grep` returns at most (the maximum of its `limit`). */
export const SEARCH_MAX_RESULTS = 500;

/** The default `limit` of `grep`. */
export const SEARCH_DEFAULT_RESULTS = 100;

/** Files `list_files` returns at most (the maximum of its `limit`). */
export const LIST_MAX_RESULTS = 5_000;

/** The default `limit` of `list_files`. */
export const LIST_DEFAULT_RESULTS = 1_000;

/** Characters of one `grep` match line. */
export const LINE_MAX_CHARS = 500;

/** Characters of git's stderr an error message carries. */
export const GIT_ERROR_MAX_CHARS = 2_000;
