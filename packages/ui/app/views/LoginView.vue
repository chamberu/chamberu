<script setup lang="ts">
/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/error.ts';
import { safeReturnPath } from '../auth/helpers.ts';
import BrandLogo from '../components/brand-logo/BrandLogo.vue';
import { useAppContext } from '../context/module.ts';

const { config, session } = useAppContext();
const route = useRoute();
const router = useRouter();

const token = ref('');
const error = ref<string>();
const busy = ref(false);

const returnTo = computed(() => safeReturnPath(route.query.redirect));
const authupHost = computed(() => (config.auth.authup ? new URL(config.auth.authup.url).host : ''));

async function useToken(): Promise<void> {
    if (!token.value.trim()) {
        error.value = 'Paste a token first.';
        return;
    }
    busy.value = true;
    error.value = undefined;
    try {
        await session.signInWithToken(token.value.trim());
        token.value = '';
        await router.replace(returnTo.value);
    } catch (e) {
        error.value = e instanceof ApiError && e.status === 401 ?
            'The API refused this token.' :
            `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
        busy.value = false;
    }
}

async function useAuthup(): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try {
        await session.startAuthup(returnTo.value);
    } catch (e) {
        error.value = `Sign-in failed: ${e instanceof Error ? e.message : String(e)}`;
        busy.value = false;
    }
}
</script>

<template>
    <div class="login-a">
        <div class="card login-card">
            <BrandLogo />
            <div>
                <p class="eyebrow">
                    Dashboard
                </p>
                <h1 class="display">
                    Sign in
                </h1>
            </div>
            <template v-if="config.auth.authup">
                <VCButton
                    class="w-full"
                    :loading="busy"
                    @click="useAuthup"
                >
                    Continue with authup
                </VCButton>
                <p
                    class="hint"
                    style="text-align: center"
                >
                    Redirects to {{ authupHost }} and back (OIDC code flow).
                </p>
            </template>
            <div
                v-if="config.auth.authup && config.auth.tokens"
                class="or"
            >
                or paste a token
            </div>
            <form
                v-if="config.auth.tokens"
                style="display: grid; gap: 18px"
                @submit.prevent="useToken"
            >
                <label class="field">
                    <span class="field-label">Bearer token</span>
                    <VCFormInput
                        v-model="token"
                        class="mono"
                        type="password"
                        placeholder="paste a static token"
                        autocomplete="off"
                        name="token"
                    />
                </label>
                <VCButton
                    type="submit"
                    class="w-full"
                    :variant="config.auth.authup ? 'outline' : 'solid'"
                    :color="config.auth.authup ? 'neutral' : 'primary'"
                    :loading="busy"
                >
                    Use token
                </VCButton>
                <p class="hint">
                    A static token from <span class="mono">staticTokens()</span>. Kept in sessionStorage for this tab only.
                </p>
            </form>
            <p
                v-if="error"
                class="form-error"
                role="alert"
            >
                {{ error }}
            </p>
        </div>
    </div>
</template>
