/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as app from '@chamvi/app';
import * as authup from '@chamvi/app/authup';
import * as github from '@chamvi/app/github';
import * as openclaw from '@chamvi/app/openclaw';
import * as sandbox from '@chamvi/app/sandbox';
import * as testing from '@chamvi/app/testing';
import * as ui from '@chamvi/app/ui';

describe('public api', () => {
    it.each([
        'createApp',
        'isApp',
        'readConfig',
        'approvalUrlOf',
        'createLogger',
        'createModelRegistry',
        'installDefaultProvider',
        'runHooks',
        'throwIfStopped',
        'envString',
        'envInteger',
        'envBoolean',
        'envUrl',
        'envList',
        'envJson',
        'envOneOf',
        'configModule',
        'storeModule',
        'staticTokensModule',
        'consoleNotifierModule',
        'engineModule',
        'schedulerModule',
        'httpModule',
        // the common surface of @chamvi/core and @chamvi/http
        'defineAgent',
        'cron',
        'http',
        'webhook',
        'defineTool',
        'defineEffectTool',
        'effectMarker',
        'requireToolPermission',
        'consoleNotifier',
        'defineContextKey',
        'inject',
        'tryInject',
        'agentPermission',
    ])('exports %s', (name) => {
        expect(app).toHaveProperty(name);
        expect(app[name as keyof typeof app]).toBeTypeOf('function');
    });

    it('exports the timer limit of the ms variables', () => {
        expect(app.TIMER_MAX_MS).toBe(2_147_483_647);
    });

    it('exports the tokens', () => {
        expect(Object.keys(app.AppToken).sort()).toEqual([
            'AUTHENTICATORS',
            'CLOCK',
            'CONFIG',
            'CONTEXT',
            'DATA_SOURCE',
            'ENGINE',
            'HTTP_ROUTES',
            'LIFECYCLE_HOOKS',
            'LOGGER',
            'NOTIFIERS',
            'SCHEDULER',
            'SERVER',
            'SHUTDOWN',
            'STORE',
        ]);
    });

    it('exports the module names and codes', () => {
        expect(app.ModuleName).toEqual({
            CONFIG: 'chamvi:config',
            STORE: 'chamvi:store',
            STATIC_TOKENS: 'chamvi:static-tokens',
            ENGINE: 'chamvi:engine',
            SCHEDULER: 'chamvi:scheduler',
            HTTP: 'chamvi:http',
        });
        expect(app.APP_ERROR_CODE).toEqual({
            STOPPED: 'app_stopped',
            IN_USE: 'app_in_use',
            STOP_FAILED: 'app_stop_failed',
        });
        expect(app.AUTHENTICATOR_ORDER).toEqual({
            STATIC_TOKENS: 0,
            AUTHUP: 10,
            OIDC: 20,
        });
    });

    it('exports the built-in providers', () => {
        expect(app.BUILTIN_PROVIDERS.map((provider) => provider.id).sort()).toEqual([
            'anthropic',
            'google',
            'mistral',
            'openai',
            'xai',
        ]);
    });

    it('exports the app brand', () => {
        expect(app.APP_BRAND).toBe(Symbol.for('chamvi.app'));
    });

    it('exports the http permissions', () => {
        expect(app.Permission).toBeTypeOf('object');
    });

    it.each([
        ['github', github, ['githubModule', 'githubNotifierModule']],
        ['sandbox', sandbox, ['sandboxModule']],
        ['openclaw', openclaw, ['openclawModule']],
        ['ui', ui, ['uiModule']],
        ['authup', authup, ['authupModule', 'oidcModule']],
    ] as const)('@chamvi/app/%s exports its modules', (_, entry, names) => {
        for (const name of names) {
            expect(entry).toHaveProperty(name);
            expect((entry as Record<string, unknown>)[name]).toBeTypeOf('function');
        }
    });

    it.each([
        'reportingModule',
        'createPurgeTimer',
        'createLazyProvider',
        'githubModule',
        'sandboxModule',
        'buildModuleHarness',
        'createModuleHarness',
    ])('keeps %s out of the main entry', (name) => {
        expect(app).not.toHaveProperty(name);
    });

    it.each([
        'buildModuleHarness',
        'createModuleHarness',
    ])('@chamvi/app/testing exports %s', (name) => {
        expect(testing).toHaveProperty(name);
        expect(testing[name as keyof typeof testing]).toBeTypeOf('function');
    });
});
