/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCoreHandler } from 'routup';
import type { App } from 'routup';

export function registerHealthRoutes(app: App): void {
    app.get('/healthz', defineCoreHandler(() => ({ status: 'ok' })));
}
