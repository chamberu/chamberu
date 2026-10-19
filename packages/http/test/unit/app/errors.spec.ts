/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import {
    BadRequestError,
    RequestEntityTooLargeError,
    UnauthorizedError,
} from '@ebec/http';
import { App, defineCoreHandler } from 'routup';
import { describe, expect, it } from 'vitest';
import {
    InvalidAgentDefinitionError,
    InvalidRunStateError,
    RunNotFoundError,
    ValidationError,
    defineAgent,
    http,
} from '@chamberu/core';
import { textModel } from '../../utils/model.ts';
import { call, createTestApp } from '../../utils/app.ts';

function appThrowing(error: unknown, onError?: (error: unknown) => void) {
    // the app ends in a catch-all, so the throwing route goes in front of it
    const { app } = createTestApp({ onError });
    const outer = new App();
    outer.get('/boom', defineCoreHandler(() => {
        throw error;
    }));
    outer.use(app);
    return outer;
}

async function bodyOf(response: Response) {
    return await response.json() as Record<string, unknown>;
}

describe('error handler', () => {
    it('maps RunNotFoundError to 404', async () => {
        const response = await call(appThrowing(new RunNotFoundError('r1')), 'GET', '/boom');
        expect(response.status).toBe(404);
        expect(response.headers.get('content-type')).toMatch(/application\/json/);
        expect(await bodyOf(response)).toEqual({
            status: 404,
            code: 'run_not_found',
            message: 'Run "r1" was not found.',
        });
    });

    it('maps InvalidRunStateError to 409', async () => {
        const response = await call(appThrowing(new InvalidRunStateError('nope')), 'GET', '/boom');
        expect(response.status).toBe(409);
        expect(await bodyOf(response)).toMatchObject({ code: 'invalid_run_state' });
    });

    it('maps core ValidationError to 400 with issues', async () => {
        const issue = {
            type: 'item' as const,
            code: 'value_invalid',
            path: ['n'],
            message: 'bad',
        };
        const response = await call(appThrowing(new ValidationError('bad', [issue])), 'GET', '/boom');
        expect(response.status).toBe(400);
        const body = await bodyOf(response);
        expect(body.code).toBe('validation_error');
        expect(body.issues).toHaveLength(1);
    });

    it('maps an ebec HTTP error to its status and a lower-case code', async () => {
        const response = await call(appThrowing(new BadRequestError({ message: 'x' })), 'GET', '/boom');
        expect(response.status).toBe(400);
        expect(await bodyOf(response)).toEqual({
            status: 400,
            code: 'bad_request',
            message: 'x',
        });

        const tooLarge = await call(appThrowing(new RequestEntityTooLargeError()), 'GET', '/boom');
        expect(tooLarge.status).toBe(413);
        expect(await bodyOf(tooLarge)).toMatchObject({ code: 'request_entity_too_large' });
    });

    it('never sends the cause', async () => {
        const error = new BadRequestError({ message: 'x', cause: new Error('inner secret') });
        const response = await call(appThrowing(error), 'GET', '/boom');
        const text = await response.text();
        expect(text).not.toContain('inner secret');
        expect(JSON.parse(text)).not.toHaveProperty('cause');
    });

    it('answers 500 for anything else and reports it', async () => {
        const errors: unknown[] = [];
        const error = new Error('secret detail');
        const response = await call(appThrowing(error, (e) => {
            errors.push(e);
        }), 'GET', '/boom');
        expect(response.status).toBe(500);
        const text = await response.text();
        expect(text).not.toContain('secret detail');
        expect(JSON.parse(text)).toEqual({
            status: 500,
            code: 'internal_error',
            message: 'Internal Server Error',
        });
        expect(errors).toEqual([error]);
    });

    it('sets WWW-Authenticate on every 401', async () => {
        const response = await call(appThrowing(new UnauthorizedError({ message: 'no' })), 'GET', '/boom');
        expect(response.status).toBe(401);
        expect(response.headers.get('www-authenticate')).toBe('Bearer');
        expect(await bodyOf(response)).toMatchObject({ message: 'no' });
    });

    it('answers unknown routes with a JSON 404', async () => {
        const { app } = createTestApp();
        const response = await call(app, 'GET', '/nope');
        expect(response.status).toBe(404);
        expect(await bodyOf(response)).toEqual({
            status: 404,
            code: 'not_found',
            message: 'The requested route does not exist.',
        });
    });

    it('answers unknown routes under basePath with a JSON 404', async () => {
        const { app } = createTestApp({ basePath: '/api' });
        const response = await call(app, 'GET', '/api/nope');
        expect(response.status).toBe(404);
        expect(await bodyOf(response)).toEqual({
            status: 404,
            code: 'not_found',
            message: 'The requested route does not exist.',
        });
    });
});

describe('createHttpApp', () => {
    it('rejects duplicate agent names', () => {
        const agent = defineAgent({
            name: 'a',
            model: textModel(),
            instructions: 'x',
            triggers: [http()],
        });
        expect(() => createTestApp({ agents: [agent, agent] })).toThrow(InvalidAgentDefinitionError);
    });

    it('rejects an empty auth chain', () => {
        expect(() => createTestApp({ auth: [] })).toThrow(InvalidAgentDefinitionError);
    });
});
