/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';
import { writeFile } from 'node:fs/promises';
import { InvalidAgentDefinitionError, loadAgent } from '@chamvi/app';
import { createTempDir, writeTree } from '../../utils/folder.ts';

const SCHEMA = 'export default { \'~standard\': { version: 1, vendor: \'test\', validate: (value) => ({ value }) } };\n';
const agentTs = () => 'export default { model: \'test:model\', instructions: \'x\' };\n';
const TOOL = 'export default { description: \'Says hi.\', inputSchema: { type: \'object\' }, execute: async () => \'hi\' };\n';

describe('loadAgent', () => {
    let root: { path: string; remove: () => Promise<void> };

    beforeEach(async () => {
        root = await createTempDir();
    });

    afterEach(async () => {
        await root.remove();
    });

    async function expectRefused(files: Record<string, string>, message: RegExp, name = 'triage') {
        await writeTree(join(root.path, name), files);
        const promise = loadAgent(join(root.path, name));
        await expect(promise).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await expect(promise).rejects.toThrow(message);
    }

    it('loads agent.mjs plus instructions.md, a tool, a YAML cron trigger, a state schema and YAML approvals', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.mjs': 'export default { model: \'test:model\', budget: { maxSteps: 3 } };\n',
            'instructions.md': 'Sort the inbox.\n',
            'tools/say_hi.mjs': TOOL,
            'tools/_helper.ts': 'export const helper = 1;\n',
            'tools/README.md': '# notes\n',
            'triggers/daily.yaml': 'cron: \'0 9 * * *\'\ntimezone: Europe/Berlin\noverlap: allow\npayload:\n  kind: daily\n',
            'state/notes.mjs': SCHEMA,
            'approvals.yaml': 'say_hi: user\n',
            '.hidden/agent.mjs': 'throw new Error("never loaded");\n',
            '_drafts/x.ts': 'throw new Error("never loaded");\n',
        });

        const loaded = await loadAgent(dir);

        expect(loaded.dir).toBe(dir);
        expect(loaded.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(loaded.agent.name).toBe('triage');
        expect(loaded.agent.definition.instructions).toBe('Sort the inbox.\n');
        expect(loaded.agent.definition.model).toBe('test:model');
        expect(loaded.agent.definition.budget.maxSteps).toBe(3);
        expect(Object.keys(loaded.agent.definition.tools as object)).toEqual(['say_hi']);
        expect(loaded.agent.definition.triggers?.map((t) => t.id)).toEqual(['cron:0 9 * * *']);
        expect(loaded.agent.definition.triggers?.[0]?.options).toEqual({
            expression: '0 9 * * *',
            timezone: 'Europe/Berlin',
            overlap: 'allow',
            payload: { kind: 'daily' },
        });
        expect(Object.keys(loaded.agent.definition.state ?? {})).toEqual(['notes']);
        expect(loaded.agent.definition.approvals).toEqual({ say_hi: 'user' });
    });

    it('prefers agent.ts over agent.mjs and keeps config instructions without instructions.md', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.ts': 'const config: { model: string; instructions: string } = { model: \'test:model\', instructions: \'from ts\' };\nexport default config;\n',
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'from mjs\' };\n',
        });

        const loaded = await loadAgent(dir);

        expect(loaded.agent.definition.instructions).toBe('from ts');
    });

    it('loads http and webhook data triggers, module triggers and approvals after config.triggers', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.mjs': [
                'export default {',
                '    model: \'test:model\',',
                '    instructions: \'x\',',
                '    triggers: [{ source: \'cron\', id: \'cron:* * * * *\', options: {} }],',
                '    approvals: { a: \'user\' },',
                '};',
                '',
            ].join('\n'),
            'triggers/a.json': '{ "http": true }',
            'triggers/b.yml': 'webhook: /incoming\n',
            'triggers/c.mjs': 'export default { source: \'webhook\', id: \'webhook:/other\', options: { path: \'/other\' } };\n',
            'approvals.mjs': 'export default { b: () => \'allow\' };\n',
        });

        const loaded = await loadAgent(dir);

        expect(loaded.agent.definition.triggers?.map((t) => t.id)).toEqual([
            'cron:* * * * *',
            'http',
            'webhook:/incoming',
            'webhook:/other',
        ]);
        expect(Object.keys(loaded.agent.definition.approvals ?? {})).toEqual(['a', 'b']);
    });

    it('merges a tool factory file into a plain config.tools set as a factory', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\', tools: { base: { description: \'b\' } } };\n',
            'tools/runner.mjs': 'export default (ctx) => ({ description: \'run \' + ctx.run.runId });\n',
        });

        const loaded = await loadAgent(dir);
        const { tools } = loaded.agent.definition;

        expect(tools).toBeTypeOf('function');
        const set = (tools as (ctx: unknown) => Record<string, { description: string }>)({ run: { runId: 'r1' } });
        expect(Object.keys(set)).toEqual(['base', 'runner']);
        expect(set.runner?.description).toBe('run r1');
    });

    it('merges tool files into a factory config.tools and refuses a clash at execution', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, {
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\', tools: (ctx) => ctx.tools };\n',
            'tools/say_hi.mjs': TOOL,
        });

        const loaded = await loadAgent(dir);
        const factory = loaded.agent.definition.tools as (ctx: unknown) => Record<string, unknown>;

        expect(Object.keys(factory({ tools: { other: {} } }))).toEqual(['other', 'say_hi']);
        expect(() => factory({ tools: { say_hi: {} } })).toThrow(InvalidAgentDefinitionError);
        expect(() => factory({ tools: { say_hi: {} } })).toThrow(/say_hi/);
    });

    it('a name key is refused', async () => {
        await expectRefused({ 'agent.mjs': 'export default { name: \'other\', model: \'test:model\', instructions: \'x\' };\n' }, /name/);
    });

    it('a folder without agent file is refused', async () => {
        await expectRefused({ 'instructions.md': 'x' }, /agent\.\{ts,mts,js,mjs\}/);
    });

    it('a config that is no object is refused', async () => {
        await expectRefused({ 'agent.mjs': 'export default 42;\n' }, /agent\.mjs/);
    });

    it('an agent file without a default export is refused', async () => {
        await expectRefused({ 'agent.mjs': 'export const config = {};\n' }, /default export/);
    });

    it('instructions in both places are refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'instructions.md': 'y',
        }, /instructions/);
    });

    it('missing instructions are refused', async () => {
        await expectRefused({ 'agent.mjs': 'export default { model: \'test:model\' };\n' }, /instructions/);
    });

    it('a tool clashing with config.tools is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\', tools: { say_hi: {} } };\n',
            'tools/say_hi.mjs': TOOL,
        }, /say_hi/);
    });

    it('a tool file name that is no tool name is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'tools/say.hi.mjs': TOOL,
        }, /say\.hi/);
    });

    it('a tool that is neither a Tool nor a factory is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'tools/say_hi.mjs': 'export default "nope";\n',
        }, /tools\/say_hi\.mjs/);
    });

    it('an unknown key in a YAML trigger is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/daily.yaml': 'cron: \'0 9 * * *\'\nschedule: daily\n',
        }, /schedule/);
    });

    it('a data trigger naming two forms is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/both.json': '{ "http": true, "webhook": "/x" }',
        }, /exactly one/);
    });

    it('an invalid data trigger value is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/bad.yaml': 'webhook: no-slash\n',
        }, /webhook/);
    });

    it('a cron data trigger with a bad overlap is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/bad.yaml': 'cron: \'0 9 * * *\'\noverlap: sometimes\n',
        }, /overlap/);
    });

    it('a module trigger that is no TriggerDefinition is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/bad.mjs': 'export default { id: 1 };\n',
        }, /triggers\/bad\.mjs/);
    });

    it('a duplicate trigger id is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'triggers/a.json': '{ "http": true }',
            'triggers/b.json': '{ "http": true }',
        }, /duplicate trigger id/);
    });

    it('a state file that is no Standard Schema is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'state/notes.mjs': 'export default {};\n',
        }, /state\/notes\.mjs/);
    });

    it('a state collection clashing with config.state is refused', async () => {
        await expectRefused({
            'agent.mjs': 'const s = { \'~standard\': {} };\nexport default { model: \'test:model\', instructions: \'x\', state: { notes: s } };\n',
            'state/notes.mjs': SCHEMA,
        }, /notes/);
    });

    it('an approval clashing with config.approvals is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\', approvals: { say_hi: \'user\' } };\n',
            'approvals.yaml': 'say_hi: user\n',
        }, /say_hi/);
    });

    it('a data approval other than user is refused', async () => {
        await expectRefused({
            'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n',
            'approvals.json': '{ "say_hi": "allow" }',
        }, /say_hi/);
    });

    it('a folder name that is no agent name is refused', async () => {
        await expectRefused({ 'agent.mjs': 'export default { model: \'test:model\', instructions: \'x\' };\n' }, /Bad_Name/, 'Bad_Name');
    });

    it('a syntax error names the file relative to the agents dir, without an absolute path', async () => {
        await writeTree(join(root.path, 'triage'), { 'agent.mjs': 'export default {\n' });
        const error = await loadAgent(join(root.path, 'triage')).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidAgentDefinitionError);
        expect((error as Error).message).toMatch(/^triage\/agent\.mjs: /);
        expect((error as Error).message).not.toContain(root.path);
    });

    it('takes an injected module reader', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, { 'agent.mjs': '', 'instructions.md': 'x' });
        const seen: string[] = [];

        const loaded = await loadAgent(dir, {
            load: async (path) => {
                seen.push(path);
                return { default: { model: 'test:model' } };
            },
        });

        expect(seen).toEqual([join(dir, 'agent.mjs')]);
        expect(loaded.agent.definition.instructions).toBe('x');
    });

    it('refuses a load that a change of the folder straddles', async () => {
        const dir = join(root.path, 'triage');
        await writeTree(dir, { 'agent.mjs': '', 'instructions.md': 'x' });

        const promise = loadAgent(dir, {
            load: async (path) => {
                await writeFile(path, 'export default { model: \'test:other\' };\n');
                return { default: { model: 'test:model' } };
            },
        });

        await expect(promise).rejects.toBeInstanceOf(InvalidAgentDefinitionError);
        await expect(promise).rejects.toThrow('triage: changed while loading; load it again.');
    });

    it.each([
        ['a .mjs helper', '_text.mjs'],
        ['a .js helper', 'lib/text.js'],
        ['a .cjs helper', '_text.cjs'],
    ])('refuses %s, which a reload would not see fresh', async (_label, file) => {
        await expectRefused({
            'agent.ts': agentTs(),
            [file]: 'export const text = 1;\n',
        }, new RegExp(`^triage/${file.replace('.', '\\.')}: a JavaScript helper is not reloaded fresh`));
    });

    it.each([
        ['the agent folder', 'triage/node_modules/x/index.js', 'triage holds a node_modules folder'],
        ['the agents dir', 'node_modules/x/index.js', 'the agents dir holds a node_modules folder'],
    ])('refuses a node_modules folder in %s', async (_label, file, message) => {
        await writeTree(root.path, {
            'triage/agent.ts': agentTs(),
            [file]: 'module.exports = 1;\n',
        });

        await expect(loadAgent(join(root.path, 'triage'))).rejects.toThrow(`triage: ${message}`);
    });
});
