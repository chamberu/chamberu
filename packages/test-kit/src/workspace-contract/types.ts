/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/**
 * The part of `@chamvi/sandbox`'s `IWorkspace` the suite drives, written out
 * structurally: an import of the type would make the kit depend on
 * `@chamvi/sandbox`, which closes a cycle (`@chamvi/sandbox` ->
 * `@chamvi/app` -> `@chamvi/test-kit`) in the graph release-please builds.
 * Every `IWorkspace` is one.
 */
export type ContractWorkspace = {
    readonly id: string;
    readonly disposed: boolean;
    exec(argv: readonly string[], options?: {
        cwd?: string;
        timeoutMs?: number;
        stdin?: string;
        signal?: AbortSignal;
    }): Promise<{
        exitCode: number;
        stdout: string;
        stderr: string;
        stdoutTruncated: boolean;
        stderrTruncated: boolean;
        timedOut: boolean;
        durationMs: number;
    }>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    dispose(): Promise<void>;
};

/** A fresh, repo-less workspace per call. */
export type WorkspaceContractFactory = () => Promise<ContractWorkspace>;
