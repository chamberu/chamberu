// #region state
// agents/triage/state/issues.ts: the collection is named issues
import { z } from 'zod';

export default z.object({
    number: z.number().int(),
    labels: z.array(z.string()),
});
// #endregion state
