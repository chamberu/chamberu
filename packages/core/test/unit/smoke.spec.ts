import { describe, expect, it } from 'vitest';
import * as core from '@chamberu/core';

describe('@chamberu/core', () => {
    it('resolves the package entry', () => {
        expect(typeof core).toBe('object');
    });
});
