/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

/*
 * Shape of the landing page frontmatter (`index.md`). The copy lives there,
 * not in the components, so it can be edited without touching Vue.
 */

export type HomeAction = {
    text: string;
    link: string;
    theme?: 'brand' | 'alt';
};

export type HomeHero = {
    eyebrow: string;
    title: string;
    highlight?: string;
    lead: string;
    file?: string;
    approval?: string;
    actions: HomeAction[];
};

export type HomeFeature = {
    title: string;
    body: string;
    detail?: string;
};

export type HomeFeatures = {
    eyebrow: string;
    title: string;
    items: HomeFeature[];
};

export type HomeFlow = {
    eyebrow: string;
    title: string;
    lead: string;
    statuses: string[];
    active?: string;
    link: HomeAction;
};

export type HomePackage = {
    name: string;
    body: string;
    link?: string;
    milestone?: string;
};

export type HomePackages = {
    eyebrow: string;
    title: string;
    lead: string;
    shipped: HomePackage[];
    planned: HomePackage[];
    link: HomeAction;
};

export type HomeCta = {
    title: string;
    lead: string;
    command: string;
    actions: HomeAction[];
};

export type HomeFrontmatter = {
    hero: HomeHero;
    features: HomeFeatures;
    flow: HomeFlow;
    packages: HomePackages;
    cta: HomeCta;
};
