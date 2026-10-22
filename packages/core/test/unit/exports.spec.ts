/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    describe,
    expect,
    expectTypeOf,
    it,
} from 'vitest';
import * as core from '@chamvi/core';

describe('public api', () => {
    it.each([
        'defineAgent',
        'cron',
        'http',
        'webhook',
        'Engine',
        'MemoryStore',
        'defineEffectTool',
        'defineTool',
        'effectMarker',
        'createResumeToken',
        'verifyResumeToken',
        'ChamviError',
        'InvalidResumeTokenError',
        'BudgetExceededError',
        'ArtifactNotFoundError',
        'ToolNotAllowedError',
        'IncompleteResponseError',
        'SandboxError',
        'hasPermission',
        'matchesPermission',
        'toolPermission',
        'requireToolPermission',
        'isArtifactMediaType',
        'assertTriggerKey',
        'consoleNotifier',
        'defineContextKey',
        'inject',
        'tryInject',
        'ContextNotProvidedError',
    ])('exports %s', (name) => {
        expect(core).toHaveProperty(name);
        expect(core[name as keyof typeof core]).toBeTypeOf('function');
    });

    it('keeps the artifact uri prefix internal', () => {
        expect(core).not.toHaveProperty('ARTIFACT_URI_PREFIX');
    });

    it('exports the tool context schema', () => {
        expect(core.toolContextSchema['~standard'].vendor).toBe('chamvi');
    });

    it('exports the trigger key bound', () => {
        expect(core.TRIGGER_KEY_MAX_LENGTH).toBe(255);
    });

    it('exports the sandbox error code', () => {
        expect(core.ErrorCode.SANDBOX).toBe('sandbox_error');
    });

    it('exports the context error code', () => {
        expect(core.ErrorCode.CONTEXT_NOT_PROVIDED).toBe('context_not_provided');
    });

    it('keeps the context binding internal', () => {
        expect(core).not.toHaveProperty('isContextKey');
        expect(core).not.toHaveProperty('bindProvided');
        expect(core).not.toHaveProperty('providedOf');
        expect(core).not.toHaveProperty('registerContextKey');
    });

    it('exports the RunStatus enum', () => {
        expect(core.RunStatus.QUEUED).toBe('queued');
    });

    it('exports the ApprovalAnswer type', () => {
        expectTypeOf<core.ApprovalAnswer>().toEqualTypeOf<core.ResumeDecision & { approvalId: string }>();
    });
});
