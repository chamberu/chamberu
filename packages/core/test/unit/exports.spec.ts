/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as core from '@chamberu/core';

describe('public api', () => {
    it.each([
        'defineAgent',
        'cron',
        'http',
        'webhook',
        'RunEngine',
        'MemoryStore',
        'defineEffectTool',
        'defineTool',
        'effectMarker',
        'createResumeToken',
        'verifyResumeToken',
        'ChamberuError',
        'InvalidResumeTokenError',
        'BudgetExceededError',
        'ArtifactNotFoundError',
        'ToolNotAllowedError',
        'IncompleteResponseError',
        'hasPermission',
        'matchesPermission',
        'toolPermission',
        'requireToolPermission',
        'isArtifactMediaType',
    ])('exports %s', (name) => {
        expect(core).toHaveProperty(name);
        expect(core[name as keyof typeof core]).toBeTypeOf('function');
    });

    it('keeps the artifact uri prefix internal', () => {
        expect(core).not.toHaveProperty('ARTIFACT_URI_PREFIX');
    });

    it('exports the tool context schema', () => {
        expect(core.toolContextSchema['~standard'].vendor).toBe('chamberu');
    });

    it('exports the RunStatus enum', () => {
        expect(core.RunStatus.QUEUED).toBe('queued');
    });
});
