# @chamvi/chat

Chat channels for chamvi. Every [Chat SDK](https://github.com/vercel/chat) adapter (Slack, Teams, Discord, Google Chat, Telegram, WhatsApp, Linear, ...) becomes a trigger, an approval inbox and a reply tool, self-hosted and on your own Postgres.

```bash
npm install @chamvi/chat chat @chat-adapter/slack @chat-adapter/state-pg --save
```

```typescript
import { Engine, defineAgent } from '@chamvi/core';
import { createHttpApp } from '@chamvi/http';
import { REPLY_TOOL_NAME, chatTrigger, createChatBridge } from '@chamvi/chat';
import { createSlackAdapter } from '@chat-adapter/slack';
import { createPostgresState } from '@chat-adapter/state-pg';
import { Chat } from 'chat';

const chat = new Chat({
    userName: 'chamvi',
    adapters: { slack: createSlackAdapter() },
    state: createPostgresState({ url: process.env.DATABASE_URL }),
    // the handlers only dispatch; chamvi orders a thread's runs. The default 'drop' would discard messages.
    concurrency: 'concurrent',
});

const bridge = createChatBridge({
    chat,
    // platform user -> invoker; without it chat runs carry none and approval buttons are refused
    resolveInvoker: (author) => (author.userId === 'U0OWNER' ?
        { id: author.userId, kind: 'slack', name: author.fullName, permissions: ['agent:*:approve'] } :
        undefined),
    approvalUrl: ({ runId, approvalId }) => `https://chamvi.example/ui/approvals?run=${runId}&approval=${approvalId}`,
});

const helper = defineAgent({
    name: 'helper',
    model,
    instructions: `Answer the message in the trigger payload with ${REPLY_TOOL_NAME}.`,
    triggers: [chatTrigger({ on: ['mention', 'message'] })],
    tools: () => ({ ...bridge.tools(), deploy }),
    approvals: { deploy: 'user' },
    notify: 'chat',
});

const engine = new Engine({ store, agents: [helper], notifiers: { chat: bridge.notifier }, resumeSecret });
bridge.attach(engine);
const app = createHttpApp({ engine, auth, routes: bridge.routes() }); // POST /channels/chat/slack
```

- **Inbound**: a mention, a message in a thread the bot follows, or a direct message dispatches one run per agent with a matching `chatTrigger()`. The platform message is the idempotency key (a redelivery returns the first run), and the platform thread is the concurrency key and `thread`, so runs of one thread queue behind each other. `history` (default 20) puts earlier thread messages into the payload.
- **Approvals**: name the bridge in `notify`. The card carries Approve and Deny buttons with the run and approval ids (never the resume token); a click answers through `engine.approve()` when `resolveInvoker` maps the user to an invoker with `agent:<name>:approve`, else the user gets a private hint to answer in the UI.
- **Replies**: `chat_reply` is an effect tool. A recovered run reuses the recorded reply, and a reply whose effect record was lost is found again in the Chat SDK state.
- Notifications of runs no chat message started (cron, http) go to `target` (`{ channelId }` or `{ threadId }`).
