/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { HttpAppOptions } from '@chamvi/http';

/**
 * `createHttpApp` options the module passes through; `engine`, `auth`,
 * `shutdown`, `routes`, `basePath` and `onError` come from the app.
 */
export type HttpModuleOptions = Omit<HttpAppOptions, 'engine' | 'auth' | 'shutdown' | 'routes' | 'basePath' | 'onError'>;
