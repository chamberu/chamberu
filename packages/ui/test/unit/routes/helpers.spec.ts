/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import {
    buildCsp,
    defaultRoot,
    loadBuild,
    renderIndex,
    resolveBuildPath,
} from '../../../src/routes/helpers.ts';
import { FIXTURE_BUILD } from '../../utils/app.ts';

describe('resolveBuildPath', () => {
    it('maps a subpath to a build key', () => {
        expect(resolveBuildPath('')).toBe('');
        expect(resolveBuildPath('/')).toBe('');
        expect(resolveBuildPath('/assets/app.js')).toBe('assets/app.js');
        expect(resolveBuildPath('/a%20b.txt')).toBe('a b.txt');
    });

    it('refuses traversal, NUL, empty segments and backslashes', () => {
        for (const path of [
            '/..',
            '/../x',
            '/a/./b',
            '/%2e%2e/x',
            '/%252e%252e/x',
            '/a%2f..%2fb',
            '/a\u0000b',
            '/a%00b',
            '/a//b',
            '/a\\b',
            '/a%5cb',
            '/%E0%A4%A',
            'relative',
        ]) {
            expect(resolveBuildPath(path), JSON.stringify(path)).toBeUndefined();
        }
    });
});

describe('renderIndex', () => {
    it('replaces the marker with the base and the escaped config', () => {
        const html = renderIndex('<head><!--chamvi-config--></head>', {
            apiBase: '',
            uiBase: '/ui',
            auth: { tokens: true, authup: { url: 'https://a', clientId: '<>&\u2028\u2029' } },
        });
        expect(html).toBe(
            '<head><base href="/ui/"><script type="application/json" id="chamvi-config">' +
            '{"apiBase":"","uiBase":"/ui","auth":{"tokens":true,"authup":{"url":"https://a","clientId":"\\u003c\\u003e\\u0026\\u2028\\u2029"}}}' +
            '</script></head>',
        );
    });
});

describe('buildCsp', () => {
    it('adds the authup origin only when configured', () => {
        expect(buildCsp({
            apiBase: '', 
            uiBase: '/ui', 
            auth: { tokens: true }, 
        })).not.toContain('https');
        expect(buildCsp({
            apiBase: '',
            uiBase: '/ui',
            auth: { tokens: true, authup: { url: 'http://localhost:3010/api', clientId: 'c' } },
        })).toContain("connect-src 'self' http://localhost:3010;");
    });
});

describe('loadBuild', () => {
    it('walks the build once and marks assets immutable', async () => {
        const files = await loadBuild(FIXTURE_BUILD);
        expect(files.keys().toArray().sort()).toEqual([
            'assets/app-1a2b3c4d.css',
            'assets/app-1a2b3c4d.js',
            'favicon.svg',
            'index.html',
        ]);
        expect(files.get('assets/app-1a2b3c4d.js')).toMatchObject({ type: 'text/javascript; charset=utf-8', immutable: true });
        expect(files.get('favicon.svg')).toMatchObject({ immutable: false });
    });
});

describe('defaultRoot', () => {
    it('is a folder named app', () => {
        expect(defaultRoot()).toMatch(/[/\\]app[/\\]?$/);
    });
});
