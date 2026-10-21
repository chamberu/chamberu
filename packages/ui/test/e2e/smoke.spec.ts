/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { E2E_ORIGIN, E2E_TOKEN } from './demo/constants.ts';

const AUTH = { authorization: `Bearer ${E2E_TOKEN}` };

/** Console errors and uncaught page errors, checked at the end of each test. */
function watchErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => { errors.push(error.message); });
    return errors;
}

async function signIn(page: Page): Promise<void> {
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.getByLabel('Bearer token').fill(E2E_TOKEN);
    await page.getByRole('button', { name: 'Use token' }).click();
    await expect(page.getByTestId('principal')).toHaveText('e2e');
}

async function dispatch(request: APIRequestContext): Promise<string> {
    const response = await request.post(`${E2E_ORIGIN}/agents/deploy/runs`, { headers: AUTH, data: { payload: { env: 'prod' } } });
    expect(response.status()).toBe(202);
    return (await response.json() as { runId: string }).runId;
}

async function readRun(request: APIRequestContext, id: string) {
    const response = await request.get(`${E2E_ORIGIN}/runs/${id}`, { headers: AUTH });
    return await response.json() as { status: string; steps: Array<{ kind: string; output?: Record<string, unknown> }> };
}

/** The demo notifier's latest token once it names `runId`. */
async function tokenFor(request: APIRequestContext, runId: string): Promise<string> {
    let token = '';
    await expect.poll(async () => {
        const response = await request.get(`${E2E_ORIGIN}/e2e/last-token`, { headers: AUTH });
        token = ((await response.json()) as { token: string | null }).token ?? '';
        const payload = token.split('.')[0] ?? '';
        return payload ? (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { runId: string }).runId : '';
    }, { timeout: 15_000 }).toBe(runId);
    return token;
}

test('dispatch, live run, approve, completed', async ({ page, request }) => {
    const errors = watchErrors(page);
    await page.goto('');
    await signIn(page);
    // a full page load would drop this marker: every later step is a client-side navigation
    await page.evaluate(() => { (window as unknown as { marker: boolean }).marker = true; });

    const runId = await dispatch(request);
    const row = page.getByTestId('runs').locator('tr', { hasText: runId.slice(0, 8) });
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/ui/runs/${runId}$`));
    await expect(page.getByTestId('status').first()).toHaveText('waiting', { timeout: 15_000 });
    await expect(page.getByTestId('timeline').getByTestId('step').filter({ hasText: 'calls deploy' })).toBeVisible();

    await page.getByRole('link', { name: 'Approvals' }).first().click();
    const approval = page.locator(`[data-testid="approval"][data-run="${runId}"]`);
    await expect(approval).toBeVisible();
    await expect(approval.locator('pre.code')).toContainText('"env": "prod"');
    await approval.getByRole('button', { name: 'Approve' }).click();

    const decided = page.getByTestId('decided').filter({ hasText: runId.slice(0, 8) });
    await expect(decided).toContainText('Approved');
    await decided.getByRole('link', { name: runId.slice(0, 8) }).click();

    await expect(page).toHaveURL(new RegExp(`/ui/runs/${runId}$`));
    await expect(page.getByTestId('status').first()).toHaveText('completed', { timeout: 20_000 });
    await expect(page.getByTestId('decision')).toHaveText('approved by e2e');
    await expect(page.getByTestId('output')).toContainText('deployed prod');
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);

    expect((await readRun(request, runId)).status).toBe('completed');
    expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
    expect(errors).toEqual([]);
});

test('the run page follows a run live', async ({ page, request }) => {
    const errors = watchErrors(page);
    await page.goto('');
    await signIn(page);
    const runId = await dispatch(request);
    // the run page opens while the first model turn still streams
    await page.goto(`runs/${runId}`);
    await expect(page.getByTestId('status').first()).toHaveText('waiting', { timeout: 15_000 });
    await expect(page.getByTestId('live')).toHaveText('SSE');

    // answered elsewhere: the page sees the resumed turn stream and the run settle
    const run = await request.get(`${E2E_ORIGIN}/runs/${runId}`, { headers: AUTH });
    const { waiting } = await run.json() as { waiting: { approvalId: string } };
    const answer = await request.post(`${E2E_ORIGIN}/runs/${runId}/approve`, { headers: AUTH, data: { approvalId: waiting.approvalId, approved: true } });
    expect(answer.status()).toBe(202);
    await expect(page.getByTestId('live-step')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('status').first()).toHaveText('completed', { timeout: 20_000 });
    await expect(page.getByTestId('live-step')).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('a deep link (token in the fragment) answers through resume', async ({ page, request }) => {
    const errors = watchErrors(page);
    const runId = await dispatch(request);
    const token = await tokenFor(request, runId);

    await page.goto(`approvals?from=mail#token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/ui\/login\?redirect=/);
    expect(page.url()).not.toContain(token.slice(0, 20));
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/approvals?from=mail');
    await signIn(page);

    await expect(page).toHaveURL(/\/ui\/approvals\?from=mail$/);
    const link = page.getByTestId('deep-link');
    await expect(link).toContainText('deploy');
    await link.getByLabel('Reason (optional, sent to the model)').fill('not today');
    await link.getByRole('button', { name: 'Deny' }).click();
    await expect(page.getByTestId('deep-link-result')).toContainText('Denied');

    await expect.poll(async () => (await readRun(request, runId)).status, { timeout: 20_000 }).toBe('completed');
    const wait = (await readRun(request, runId)).steps.find((step) => step.kind === 'wait');
    expect(wait?.output).toMatchObject({
        approved: false,
        reason: 'not today',
        approver: { id: 'e2e' },
    });
    expect(await page.evaluate(() => sessionStorage.getItem('chamvi.resume'))).toBeNull();
    expect(errors).toEqual([]);
});
