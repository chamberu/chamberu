/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import tailwindcss from '@tailwindcss/vite';
import type { UserConfig } from 'vitepress';
import { defineConfig, postcssIsolateStyles } from 'vitepress';
import { chamberuCodeTheme } from './shiki-theme';

// a plugin as the vite bundled with VitePress types it
type VitePressVitePlugin = NonNullable<NonNullable<UserConfig['vite']>['plugins']>[number];

export default defineConfig({
    title: 'chamberu',
    description: 'A TypeScript framework for self-hosted, trigger-driven AI agents on the Vercel AI SDK: durable runs, checkpoints, approvals and a pluggable store.',
    base: '/',
    sitemap: { hostname: 'https://chamberu.dev' },
    cleanUrls: true,
    lastUpdated: true,

    vite: {
        // @tailwindcss/vite is typed against the workspace's newer vite (via
        // vitest), VitePress bundles vite 5; the plugin supports both at runtime.
        plugins: [tailwindcss() as unknown as VitePressVitePlugin],
        css: {
            postcss: {
                plugins: [
                    // VitePress base + doc styles are unlayered and would override
                    // Tailwind utilities, so exclude them inside `.vp-raw` subtrees.
                    postcssIsolateStyles({ includeFiles: [/base\.css/, /vp-doc\.css/] }),
                ],
            },
        },
    },

    markdown: {
        // code blocks sit on a fixed-dark surface in both color modes
        theme: chamberuCodeTheme,
    },

    head: [
        ['link', {
            rel: 'icon',
            type: 'image/svg+xml',
            href: '/logo.svg',
        }],
        ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
        ['link', {
            rel: 'preconnect', 
            href: 'https://fonts.gstatic.com', 
            crossorigin: '', 
        }],
        ['link', {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap',
        }],
        ['meta', { name: 'theme-color', content: '#19171a' }],
        ['meta', { property: 'og:type', content: 'website' }],
        ['meta', { property: 'og:url', content: 'https://chamberu.dev/' }],
        ['meta', { property: 'og:title', content: 'chamberu' }],
        ['meta', {
            property: 'og:description',
            content: 'Self-hosted, trigger-driven AI agents on the Vercel AI SDK.',
        }],
    ],

    themeConfig: {
        logo: {
            light: '/logo-light.svg', 
            dark: '/logo-dark.svg', 
            alt: 'chamberu', 
        },

        nav: [
            {
                text: 'Getting Started',
                link: '/getting-started/',
                activeMatch: '/getting-started/',
            },
            {
                text: 'Guide',
                link: '/guide/',
                activeMatch: '/guide/',
            },
            {
                text: 'Stores',
                link: '/stores/',
                activeMatch: '/stores/',
            },
            {
                text: 'Deployment',
                link: '/deployment/',
                activeMatch: '/deployment/',
            },
            {
                text: 'Reference',
                link: '/reference/',
                activeMatch: '/reference/',
            },
            {
                text: 'Roadmap',
                link: '/roadmap',
            },
        ],

        sidebar: {
            '/getting-started/': [
                {
                    text: 'Getting Started',
                    items: [
                        { text: 'Introduction', link: '/getting-started/' },
                        { text: 'Installation', link: '/getting-started/installation' },
                        { text: 'Quick Start', link: '/getting-started/quick-start' },
                    ],
                },
            ],
            '/guide/': [
                {
                    text: 'Concepts',
                    items: [
                        { text: 'Overview', link: '/guide/' },
                        { text: 'Agents', link: '/guide/agents' },
                        { text: 'Triggers & the Envelope', link: '/guide/triggers' },
                        { text: 'Run Lifecycle', link: '/guide/run-lifecycle' },
                    ],
                },
                {
                    text: 'Execution',
                    items: [
                        { text: 'Execution & Checkpoints', link: '/guide/execution' },
                        { text: 'Budgets & Timeouts', link: '/guide/budgets' },
                        { text: 'Tools & Tool Errors', link: '/guide/tools' },
                        { text: 'Effect Tools & Reconciliation', link: '/guide/effect-tools' },
                        { text: 'Approvals & Resume Tokens', link: '/guide/approvals' },
                        { text: 'Agent State', link: '/guide/state' },
                    ],
                },
                {
                    text: 'Operations',
                    items: [
                        { text: 'Concurrency, Leases & Multi-Replica', link: '/guide/concurrency' },
                        { text: 'Cancel, Drain & Recovery', link: '/guide/recovery' },
                        { text: 'Cron Scheduling', link: '/guide/scheduler' },
                        { text: 'HTTP API & MCP', link: '/guide/http' },
                        { text: 'Notifiers', link: '/guide/notifiers' },
                        { text: 'Errors', link: '/guide/errors' },
                    ],
                },
            ],
            '/stores/': [
                {
                    text: 'Stores',
                    items: [
                        { text: 'Store Contract', link: '/stores/' },
                        { text: 'MemoryStore', link: '/stores/memory' },
                        { text: 'Writing a Store', link: '/stores/writing-a-store' },
                        { text: 'TypeORM', link: '/stores/typeorm' },
                    ],
                },
            ],
            '/deployment/': [
                {
                    text: 'Deployment (planned)',
                    items: [
                        { text: 'Overview', link: '/deployment/' },
                        { text: 'Docker Image', link: '/deployment/docker' },
                        { text: 'Kubernetes & Flux', link: '/deployment/kubernetes' },
                        { text: 'Multiple Replicas', link: '/deployment/replicas' },
                        { text: 'OpenClaw', link: '/deployment/openclaw' },
                        { text: 'GitHub App', link: '/deployment/github-app' },
                    ],
                },
            ],
            '/reference/': [
                {
                    text: 'Reference',
                    items: [
                        { text: '@chamberu/core', link: '/reference/' },
                        { text: '@chamberu/http', link: '/reference/http' },
                        { text: '@chamberu/scheduler', link: '/reference/scheduler' },
                        { text: '@chamberu/test-kit', link: '/reference/test-kit' },
                    ],
                },
            ],
        },

        socialLinks: [
            { icon: 'github', link: 'https://github.com/chamberu/chamberu' },
        ],

        editLink: {
            pattern: 'https://github.com/chamberu/chamberu/edit/master/packages/docs/src/:path',
            text: 'Edit this page on GitHub',
        },

        search: { provider: 'local' },
    },
});
