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
    await page.getByRole('link', { name: 'Runs' }).first().click();
    await expect(page).toHaveURL(/\/ui\/runs$/);

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
    await expect(approval.getByTestId('notified')).toHaveText('capture');
    await approval.getByRole('button', { name: 'Approve' }).click();

    const decided = page.getByTestId('decided').filter({ hasText: runId.slice(0, 8) });
    await expect(decided).toContainText('Approved by e2e');
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

test('open an agent and start a run from its page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('');
    await signIn(page);

    // signing in lands on the agents overview
    await expect(page).toHaveURL(/\/ui\/agents$/);
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
    const card = page.locator('[data-testid="agent-card"][data-agent="deploy"]');
    await expect(card).toContainText('http');
    await expect(page.locator('[data-testid="agent-card"][data-agent="digest"]')).toContainText('0 8 * * 1-5');
    await card.getByRole('link', { name: 'deploy', exact: true }).click();

    await expect(page).toHaveURL(/\/ui\/agents\/deploy$/);
    await expect(page.getByRole('heading', { name: 'deploy', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Start run' }).first().click();
    const form = page.getByTestId('start-run');
    await form.locator('textarea[name="payload"]').fill('{ "env": "staging" }');
    await form.getByRole('button', { name: 'Start run' }).click();
    await expect(form).toBeHidden();

    // the new run shows on the overview, newest first, and opens its page
    const recent = page.getByTestId('recent-runs').locator('a').first();
    await expect(recent).toBeVisible();
    await recent.click();
    await expect(page).toHaveURL(/\/ui\/runs\/[0-9a-f-]+$/);
    await page.getByTestId('timeline').getByText('Envelope (first user message)').click();
    await expect(page.getByTestId('timeline')).toContainText('"staging"');
    await expect(page.getByTestId('status').first()).toHaveText('waiting', { timeout: 15_000 });

    // the agent name leads back to the agent page
    await page.getByTestId('run-agent').getByRole('link', { name: 'deploy' }).click();
    await expect(page).toHaveURL(/\/ui\/agents\/deploy$/);
    await page.getByRole('tab', { name: /Runs/ }).click();
    await expect(page.getByTestId('runs').locator('tbody tr').first()).toBeVisible();

    await page.goto('agents/digest');
    await expect(page.getByRole('heading', { name: 'digest', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start run' })).toHaveCount(0);
    await page.getByRole('tab', { name: /State/ }).click();
    await expect(page.getByTestId('kv')).toContainText('last_digest_at');
    expect(errors).toEqual([]);
});

test('fonts are self-hosted, dark mode applies and phones get no sideways scroll', async ({ page }) => {
    const errors = watchErrors(page);
    const fonts: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'font') fonts.push(r.url()); });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('');
    await signIn(page);
    for (const path of ['agents', 'agents/deploy', 'runs', 'approvals', 'schedules']) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.fonts.check('700 16px "Bricolage Grotesque"'))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    // the dark page ground of the Crimson tokens
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 14, 16)');
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((url) => url.startsWith(E2E_ORIGIN))).toBe(true);
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

test('an approval link by run signs in, highlights the card and approves', async ({ page, request }) => {
    const errors = watchErrors(page);
    const runId = await dispatch(request);
    let approvalId = '';
    await expect.poll(async () => {
        const run = await readRun(request, runId) as { status: string; waiting?: { approvalId: string } };
        approvalId = run.waiting?.approvalId ?? '';
        return run.status;
    }, { timeout: 15_000 }).toBe('waiting');

    const link = `approvals?run=${runId}&approval=${approvalId}`;
    await page.goto(link);
    await expect(page).toHaveURL(/\/ui\/login\?redirect=/);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(`/${link}`);
    await signIn(page);

    await expect(page).toHaveURL(new RegExp(`/ui/approvals\\?run=${runId}&approval=${approvalId}$`));
    const card = page.locator(`[data-testid="approval"][data-run="${runId}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-linked', 'true');
    await expect(card).toHaveClass(/\blinked\b/);
    await expect(card).toBeFocused();
    await expect(card).toBeInViewport();
    await expect(page.getByTestId('link-notice')).toHaveCount(0);
    await card.getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByTestId('decided').filter({ hasText: runId.slice(0, 8) })).toContainText('Approved by e2e');
    await expect.poll(async () => (await readRun(request, runId)).status, { timeout: 20_000 }).toBe('completed');
    const wait = (await readRun(request, runId)).steps.find((step) => step.kind === 'wait');
    expect(wait?.output).toMatchObject({ approved: true, approver: { id: 'e2e' } });

    // the same link once answered: a notice linking the run, no card
    await page.reload();
    const notice = page.getByTestId('link-notice');
    await expect(notice).toContainText('no longer waits');
    await expect(card).toHaveCount(0);
    await notice.getByTestId('link-notice-run').click();
    await expect(page).toHaveURL(new RegExp(`/ui/runs/${runId}$`));
    expect(errors).toEqual([]);
});

test('a pending resume token names the approval link it hides and can be discarded', async ({ page, request }) => {
    const errors = watchErrors(page);
    const tokenRun = await dispatch(request);
    const token = await tokenFor(request, tokenRun);
    const linkRun = await dispatch(request);
    let approvalId = '';
    await expect.poll(async () => {
        const run = await readRun(request, linkRun) as { status: string; waiting?: { approvalId: string } };
        approvalId = run.waiting?.approvalId ?? '';
        return run.status;
    }, { timeout: 15_000 }).toBe('waiting');

    await page.goto(`approvals#token=${encodeURIComponent(token)}`);
    await signIn(page);
    await expect(page.getByTestId('deep-link')).toContainText('deploy');

    // a token-less link opened in the same tab while the token is pending
    await page.goto(`approvals?run=${linkRun}&approval=${approvalId}`);
    const shadowed = page.getByTestId('shadowed-link');
    await expect(shadowed).toContainText(linkRun.slice(0, 8));
    await shadowed.getByTestId('discard-token').click();

    await expect(shadowed).toHaveCount(0);
    await expect(page.getByTestId('deep-link')).toHaveCount(0);
    const card = page.locator(`[data-testid="approval"][data-run="${linkRun}"]`);
    await expect(card).toHaveAttribute('data-linked', 'true');
    expect(await page.evaluate(() => sessionStorage.getItem('chamvi.resume'))).toBeNull();
    await card.getByRole('button', { name: 'Approve' }).click();
    await expect.poll(async () => (await readRun(request, linkRun)).status, { timeout: 20_000 }).toBe('completed');

    // answer the token's run too, so later tests start from an empty inbox
    const other = page.locator(`[data-testid="approval"][data-run="${tokenRun}"]`);
    await other.getByRole('button', { name: 'Deny' }).click();
    await expect.poll(async () => (await readRun(request, tokenRun)).status, { timeout: 20_000 }).toBe('completed');
    expect(errors).toEqual([]);
});
