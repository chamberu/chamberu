---
layout: page
pageClass: ch-home
title: chamberu
titleTemplate: Self-hosted, trigger-driven AI agents

hero:
    eyebrow: Self-hosted agents
    title: Agents that keep the keys.
    highlight: keep the keys
    lead: You write the agent with the AI SDK. chamberu queues its runs, checkpoints every step, pauses for approvals and resumes interrupted runs, in your own Node process and database.
    file: agents/triage.ts
    approval: close(#412) waits for the owner, resume token signed
    actions:
        -   text: Get started
            link: /getting-started/
        -   text: Run lifecycle
            link: /guide/run-lifecycle
            theme: alt

features:
    eyebrow: What the AI SDK leaves out
    title: The layer between a model call and an agent you can trust.
    items:
        -   title: One intake for every trigger
            body: A webhook, a cron tick or a manual call becomes the same envelope and the same queued run. Idempotency keys turn redeliveries into the existing run; concurrency keys keep two runs for one issue apart.
            detail: dispatch({ idempotencyKey })
        -   title: Runs survive restarts
            body: A checkpoint after every step. drain() hands unfinished runs back, and recover() continues them from the latest checkpoint on any replica, without applying a recorded effect twice.
            detail: drain() → recover()
        -   title: Ask before acting
            body: A tool call that needs a human pauses the run in waiting, with a signed resume token. Approve or deny it an hour or a day later, from any replica.
            detail: resume(token, { approved })

flow:
    eyebrow: How a run flows
    title: Seven statuses, one store.
    lead: Every run lives in your store, from dispatch to its final status. Whatever stops it halfway, the next execution starts from the latest checkpoint.
    statuses: [queued, running, waiting, interrupted, completed, failed, cancelled]
    active: running
    link:
        text: Run lifecycle
        link: /guide/run-lifecycle

packages:
    eyebrow: Packages
    title: Small today, planned in the open.
    lead: The engine and its test helpers ship now. The scheduler, the HTTP API, the Postgres store and the rest are designed milestone by milestone.
    shipped:
        -   name: '@chamberu/core'
            body: Agents, triggers, the run engine, checkpoints, budgets, effect tools, approvals, agent state and the in-memory store.
            link: /reference/
        -   name: '@chamberu/test-kit'
            body: ControllableClock and the store contract suite every IStore implementation must pass.
            link: /reference/test-kit
    planned:
        -   name: '@chamberu/store-typeorm'
            milestone: M1
            body: Postgres store through TypeORM, passing the store contract suite.
        -   name: '@chamberu/scheduler'
            milestone: M1
            body: Fires cron() triggers once per tick across replicas.
        -   name: '@chamberu/http'
            milestone: M1
            body: REST control API, server-sent events, webhook intake and an MCP endpoint.
        -   name: '@chamberu/github'
            milestone: M1
            body: GitHub App auth, webhook triggers and issue tools with reconciliation.
        -   name: '@chamberu/sandbox-*'
            milestone: M1
            body: Disposable workspaces, local for development and a pod per workspace in production.
        -   name: '@chamberu/ui'
            milestone: M1
            body: A dashboard with live steps, an approvals inbox, agent state and schedules.
    link:
        text: Roadmap
        link: /roadmap

cta:
    title: Start with one agent.
    lead: Define an agent, dispatch a run and watch it settle. MemoryStore needs no database, so the quick start runs in a single file.
    command: npm install @chamberu/core ai zod
    actions:
        -   text: Quick start
            link: /getting-started/quick-start
        -   text: GitHub
            link: https://github.com/chamberu/chamberu
            theme: alt
---

<script setup>
import CHome from './.vitepress/components/home/CHome.vue';
</script>

<CHome>
<template #code>

<<< @/snippets/hero.ts#agent

</template>
</CHome>
