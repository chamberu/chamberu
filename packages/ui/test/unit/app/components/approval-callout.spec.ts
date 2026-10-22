/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RunWire } from '../../../../app/api/types.ts';
import ApprovalCallout from '../../../../app/components/approval-callout/ApprovalCallout.vue';
import { RouteName } from '../../../../app/router/constants.ts';
import { wireRun } from '../../../utils/runs.ts';

async function render(run: RunWire): Promise<string> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: { render: () => null } },
            {
                path: '/agents/:name',
                name: RouteName.AGENT,
                component: { render: () => null },
            },
            {
                path: '/runs/:id',
                name: RouteName.RUN,
                component: { render: () => null },
            },
        ],
    });
    await router.push('/');
    await router.isReady();
    const app = createSSRApp(ApprovalCallout, { run, canAnswer: false });
    app.use(router);
    // the vuecs components are global in the app; here they render as nothing
    for (const name of ['VCCountdown', 'VCTimeago', 'VCButton', 'VCFormTextarea']) {
        app.component(name, { render: () => null });
    }
    return renderToString(app);
}

const waiting = {
    kind: 'approval' as const,
    approvalId: 'call-1:0',
    toolName: 'deploy',
    toolCallId: 'call-1',
    title: 'Deploy <prod>?',
    expiresAt: '2026-10-22T10:00:00.000Z',
    tokenId: 't1',
};

describe('ApprovalCallout', () => {
    it('the approval callout shows title and body', async () => {
        const html = await render(wireRun({
            status: 'waiting',
            waiting: { ...waiting, body: 'Rolls out v2.3.1 to every region.\nTakes ten minutes.' },
        }));
        expect(html).toContain('data-testid="approval-title"');
        expect(html).toContain('Deploy &lt;prod&gt;?');
        expect(html).toContain('data-testid="approval-body"');
        expect(html).toContain('Rolls out v2.3.1 to every region.\nTakes ten minutes.');
        expect(html).toContain('data-testid="approval-tool"');
        expect(html).not.toContain('Tool input');
    });

    it('leaves the body out when the request has none', async () => {
        const html = await render(wireRun({ status: 'waiting', waiting }));
        expect(html).toContain('Deploy &lt;prod&gt;?');
        expect(html).not.toContain('data-testid="approval-body"');
    });
});
