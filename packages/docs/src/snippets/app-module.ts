import type { IContainer } from 'eldin';
import type { IModule } from 'orkos';
import { AppToken, ModuleName } from '@chamvi/app';

// #region module
export function auditModule(): IModule {
    let unsubscribe: (() => void) | undefined;

    return {
        name: 'audit',
        // onReady resolves ENGINE, so the engine module sets up first
        dependencies: [ModuleName.ENGINE],

        // setup contributes: every consumer (engine, http) builds in onReady
        async setup(container: IContainer) {
            container.registerMany(AppToken.HTTP_ROUTES, {
                useValue: {
                    method: 'GET',
                    path: '/audit',
                    // extra routes check their own credentials
                    handler: async () => ({ status: 200, body: { ok: true } }),
                },
            });

            const logger = container.resolve(AppToken.LOGGER);
            container.registerMany(AppToken.LIFECYCLE_HOOKS, {
                useValue: {
                    name: 'audit',
                    started: () => logger.info('audit ready'),
                    drained: () => logger.info('audit: every run drained'),
                },
            });
        },

        // onReady consumes: the engine exists, the server is not listening yet
        async onReady(container: IContainer) {
            const logger = container.resolve(AppToken.LOGGER);
            unsubscribe = container.resolve(AppToken.ENGINE).on('run.updated', ({ run }) => {
                logger.info('run updated', { run: run.id, status: run.status });
            });
        },

        // also called after an onReady that threw half-way
        async teardown() {
            unsubscribe?.();
        },
    };
}
// #endregion module
