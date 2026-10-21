/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { BuiltinProvider } from './types.ts';

export const BUILTIN_PROVIDERS: readonly BuiltinProvider[] = [
    {
        id: 'anthropic',
        package: '@ai-sdk/anthropic',
        factory: 'createAnthropic',
        apiKey: 'ANTHROPIC_API_KEY',
        baseUrl: 'ANTHROPIC_BASE_URL',
    },
    {
        id: 'openai',
        package: '@ai-sdk/openai',
        factory: 'createOpenAI',
        apiKey: 'OPENAI_API_KEY',
        baseUrl: 'OPENAI_BASE_URL',
    },
    {
        id: 'google',
        package: '@ai-sdk/google',
        factory: 'createGoogleGenerativeAI',
        apiKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    },
    {
        id: 'mistral',
        package: '@ai-sdk/mistral',
        factory: 'createMistral',
        apiKey: 'MISTRAL_API_KEY',
    },
    {
        id: 'xai',
        package: '@ai-sdk/xai',
        factory: 'createXai',
        apiKey: 'XAI_API_KEY',
    },
];

export const MODEL_SEPARATOR = ':';
