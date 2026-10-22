// #region trigger
// agents/triage/triggers/issues.ts: any TriggerDefinition, key functions included
import { webhook } from '@chamvi/app';

export default webhook({
    path: '/issues',
    idempotencyKey: (payload) => (payload as { delivery?: string }).delivery,
});
// #endregion trigger
