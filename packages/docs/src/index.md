---
layout: home

hero:
    name: chamberu
    text: Self-hosted, trigger-driven AI agents
    tagline: Write agents with the Vercel AI SDK. chamberu queues their runs, checkpoints every step, pauses for approvals and picks interrupted runs up again, in a plain Node process.
    image:
        src: /logo.svg
        alt: chamberu
    actions:
        -   theme: brand
            text: Get Started
            link: /getting-started/
        -   theme: alt
            text: Quick Start
            link: /getting-started/quick-start
        -   theme: alt
            text: GitHub
            link: https://github.com/chamberu/chamberu

features:
    -   title: Triggers first
        details: Every run starts from a trigger envelope (cron, HTTP, GitHub, MCP or manual), with idempotency keys against redeliveries and concurrency keys against races.
    -   title: Durable runs
        details: A checkpoint after every step. A crashed or drained run continues from the latest checkpoint on any replica.
    -   title: No orchestrator server
        details: The engine is a library. Runs, leases and locks live in your store, so there is no hosted console, queue service or Redis to run.
    -   title: The AI SDK, unwrapped
        details: Models, messages and tools stay AI SDK types. defineAgent() takes a LanguageModel and your tools come from tool().
    -   title: Effects at most once
        details: defineEffectTool() records each side effect per effect key and can check the remote system before it acts again.
    -   title: Approvals that wait
        details: A tool call that needs a human pauses the run with a signed resume token. Answer it hours later, from any replica.
---
