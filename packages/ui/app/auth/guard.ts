/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { NavigationGuard } from 'vue-router';
import { RouteName } from '../router/constants.ts';
import type { ISession } from './types.ts';

/**
 * Every route but the public ones (`meta.public`: login, callback) needs
 * a principal; the first navigation restores the session once. A visit
 * without one goes to login with its full path as `redirect`.
 */
export function createAuthGuard(session: ISession): NavigationGuard {
    let restored: Promise<boolean> | undefined;
    return async (to) => {
        restored ??= session.restore();
        await restored;
        if (to.meta.public === true) return true;
        if (session.principal.value) return true;
        return { name: RouteName.LOGIN, query: { redirect: to.fullPath } };
    };
}
