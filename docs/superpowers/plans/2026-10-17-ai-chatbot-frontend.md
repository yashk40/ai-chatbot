# AI Chatbot Frontend for Website (Cloudflare Workers AI Ready) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern, responsive AI chatbot frontend layout for a website with an expandable floating widget and embeddable view, complete with message formatting, quick prompt chips, and a modular client ready to connect to Cloudflare Workers AI.

**Architecture:** Pure Vanilla HTML/CSS/JavaScript with zero build-step overhead for maximum portability into any website. A decoupled state manager (`chat-state.js`) manages conversation history and UI state, a formatter (`formatter.js`) handles markdown rendering and code highlighting, an API adapter (`cf-client.js`) interfaces with Cloudflare Workers AI (with local fallback mock streaming), and a companion Cloudflare Worker script (`worker/cloudflare-worker.js`) provides a turn-key backend.

**Tech Stack:** HTML5, Modern Vanilla CSS (custom design system, glassmorphism, responsive variables), ES Modules JavaScript, Node.js `node:test` for unit testing, and Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`).

**Spec:** Defined from user request ("build a basic ai chatbot layout for my website make frontend first i will using cloudflare workers ai for the ai") and modern web application design guidelines.

## Global Constraints

- No external UI framework lock-in: vanilla HTML, CSS, and JS so the chatbot can be dropped into any website via a script/link tag.
- Visual excellence: dark mode aesthetic, glassmorphism, glowing accents, modern typography (Google Fonts Inter), fluid transitions, and micro-animations.
- Mobile and desktop responsive: compact floating widget (380px wide on desktop, full-screen adaptive on mobile) plus expand/collapse toggle.
- Cloudflare Workers AI compatibility: client formatted for `env.AI.run('@cf/meta/llama-3.1-8b-instruct')` payloads with SSE streaming support and fallback JSON parsing.
- Zero extra install dependencies required for running the frontend (works directly with any static server or file open).

## Review Focus

1. **Empty / whitespace messages:** Submitting empty input or whitespace must be prevented, keeping input enabled.
2. **Network failure / worker down:** When Cloudflare worker endpoint is unreachable, show a clear inline error badge with a "Retry" button rather than breaking the chat.
3. **Rapid repeated sends:** While the bot is generating/streaming, disable the send button or queue appropriately to prevent race conditions.
4. **Code block & special character sanitization:** User and AI messages containing HTML tags must be safely escaped while allowing legitimate markdown and code blocks to render without XSS.
5. **Widget responsiveness on small mobile screens:** On screens < 480px, the chat widget should fill the viewport comfortably without overflow or hiding the input behind virtual keyboards.

---

### Task 1: Chat State & Message Store

**Files:**
- Create: `src/chat-state.js`
- Test: `test/chat-state.test.js`

**Interfaces:**
- Consumes: none
- Produces: `ChatState` class with methods:
  - `addMessage({ role, content, id? }) -> Message`
  - `updateMessage(id, partialUpdates) -> Message`
  - `getMessages() -> Message[]`
  - `clearMessages() -> void`
  - `setLoading(boolean) -> void`
  - `subscribe(listenerFn) -> unsubscribeFn`

- [ ] **Step 1: Write the failing unit test for `ChatState`**

```javascript
// test/chat-state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatState } from '../src/chat-state.js';

test('ChatState initializes with empty messages and manages message lifecycle', () => {
  const state = new ChatState();
  assert.deepEqual(state.getMessages(), []);
  
  const msg = state.addMessage({ role: 'user', content: 'Hello bot' });
  assert.equal(msg.role, 'user');
  assert.equal(msg.content, 'Hello bot');
  assert.ok(msg.id);
  assert.ok(msg.timestamp);
  
  state.updateMessage(msg.id, { content: 'Hello updated' });
  assert.equal(state.getMessages()[0].content, 'Hello updated');
  
  state.clearMessages();
  assert.deepEqual(state.getMessages(), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chat-state.test.js`
Expected: FAIL (Cannot find module '../src/chat-state.js')

- [ ] **Step 3: Implement `ChatState` in `src/chat-state.js`**

Implement `ChatState` with subscription listener pattern, message ID generator, timestamping, local persistence in `localStorage` (optional fallback for non-browser Node environments), and loading state flag.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/chat-state.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-state.js test/chat-state.test.js
git commit -m "feat: add chat state management with subscriber pattern"
```

---

### Task 2: Message Formatter & Markdown Renderer

**Files:**
- Create: `src/formatter.js`
- Test: `test/formatter.test.js`

**Interfaces:**
- Consumes: Raw text string with markdown, code blocks, bold/italics, and URLs.
- Produces:
  - `escapeHtml(str: string) -> string`
  - `renderMarkdown(markdown: string) -> string`
  - `formatTimestamp(date: Date|string|number) -> string`

- [ ] **Step 1: Write failing test for `renderMarkdown` and `escapeHtml`**

```javascript
// test/formatter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, escapeHtml } from '../src/formatter.js';

test('escapeHtml prevents XSS injections', () => {
  const dangerous = '<script>alert("xss")</script>';
  assert.equal(escapeHtml(dangerous), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('renderMarkdown handles code blocks, bold, lists, and inline code', () => {
  const input = "Here is **bold** and `code`:\n```js\nconst x = 1;\n```";
  const output = renderMarkdown(input);
  assert.ok(output.includes('<strong>bold</strong>'));
  assert.ok(output.includes('<code>code</code>'));
  assert.ok(output.includes('<pre><code class="language-js">'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/formatter.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `src/formatter.js`**

Implement secure HTML sanitization, lightweight client-side markdown parsing (headers, bold, italic, inline code, fenced code blocks with language tag and copy-to-clipboard metadata, lists, linebreaks).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/formatter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/formatter.js test/formatter.test.js
git commit -m "feat: add secure markdown renderer and html escaper"
```

---

### Task 3: Cloudflare Workers AI Client Adapter

**Files:**
- Create: `src/cf-client.js`
- Test: `test/cf-client.test.js`

**Interfaces:**
- Consumes: `messages` array `[{ role, content }]` and configuration options `{ endpointUrl, model, systemPrompt, onToken, onError }`
- Produces: `CloudflareAIClient` with:
  - `sendChat({ messages, onToken, signal }) -> Promise<{ content: string }>`
  - `setEndpoint(url: string) -> void`
  - `setMockMode(boolean) -> void`

- [ ] **Step 1: Write failing test for `CloudflareAIClient` mock & payload builder**

```javascript
// test/cf-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareAIClient } from '../src/cf-client.js';

test('CloudflareAIClient formats messages payload for Cloudflare Workers AI', () => {
  const client = new CloudflareAIClient({ mockMode: true });
  const payload = client.buildPayload([
    { role: 'user', content: 'Tell me a joke' }
  ], 'You are a helpful assistant.');
  
  assert.equal(payload.messages[0].role, 'system');
  assert.equal(payload.messages[1].role, 'user');
  assert.equal(payload.messages[1].content, 'Tell me a joke');
});

test('CloudflareAIClient mock mode streams responses', async () => {
  const client = new CloudflareAIClient({ mockMode: true });
  const tokens = [];
  const result = await client.sendChat({
    messages: [{ role: 'user', content: 'hello' }],
    onToken: (chunk) => tokens.push(chunk)
  });
  assert.ok(tokens.length > 0);
  assert.equal(result.content, tokens.join(''));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cf-client.test.js`
Expected: FAIL

- [ ] **Step 3: Implement `CloudflareAIClient` in `src/cf-client.js`**

Implement payload formatting matching Cloudflare Workers AI schema (`{ messages: [{ role, content }] }`), support for Server-Sent Events (SSE) streaming (`data: {"response": "..."}`), standard JSON response handling, abort signal handling, and a realistic mock streamer for zero-config testing.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cf-client.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cf-client.js test/cf-client.test.js
git commit -m "feat: add Cloudflare Workers AI client adapter with streaming support"
```

---

### Task 4: Modern Chatbot UI Layout & Styling

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `src/app.js`

**Interfaces:**
- Consumes: `ChatState`, `renderMarkdown`, `CloudflareAIClient`
- Produces: Fully interactive web page containing:
  - Background showcase website with mock hero section and documentation cards.
  - Floating launcher button with glowing pulse ring, tooltip, and unread indicator.
  - Chat widget window:
    - Header with avatar, status badge ("Online", "Workers AI"), minimize, expand/fullscreen, settings, and clear actions.
    - Welcome hero with bot introduction and suggested prompt pills.
    - Message history scroll area with auto-scroll and scroll-to-bottom anchor.
    - Typing indicator with animated dots.
    - Input footer with auto-resizing textarea, character counter, send button, and voice/audio toggles.
    - Settings modal to enter custom Cloudflare Worker URL, model name, and toggle mock mode.

- [ ] **Step 1: Create `style.css` with comprehensive design system**
  - Modern dark mode color tokens (slate-900 background, violet/cyan gradient accents, glassmorphic cards with `backdrop-filter: blur(16px)`).
  - Modern typography (`Inter` via Google Fonts).
  - Animations: pulse rings, message slide-in, bounce dots, spring expand/collapse for the widget.
  - Full mobile responsiveness.

- [ ] **Step 2: Create `index.html` structure**
  - Semantic HTML5 structure with unique IDs for all interactive elements.
  - Proper meta tags, viewport settings, and SEO markup.

- [ ] **Step 3: Implement `src/app.js` UI controller**
  - Wire up widget launcher open/close toggles.
  - Wire up auto-resizing textarea and Enter-to-send (Shift+Enter for newline).
  - Wire up suggestion chip clicks to trigger message sends.
  - Render messages reactively on state updates with markdown formatting and copy-code buttons.
  - Handle streaming token updates dynamically in the UI.
  - Provide settings modal for live Cloudflare Worker URL configuration.

- [ ] **Step 4: Verify with a simple local server and test suite**
  - Verify all unit tests still pass: `node --test test/*.test.js`

- [ ] **Step 5: Commit**

```bash
git add index.html style.css src/app.js
git commit -m "feat: create modern chatbot UI layout, glassmorphic styles, and interactive app controller"
```

---

### Task 5: Cloudflare Worker Backend Template & Deployment Guide

**Files:**
- Create: `worker/cloudflare-worker.js`
- Create: `worker/wrangler.toml`
- Create: `README.md`

**Interfaces:**
- Consumes: HTTP POST request with `{ messages: [{ role, content }], stream?: boolean }`
- Produces: Cloudflare Worker script that runs `@cf/meta/llama-3.1-8b-instruct` via `env.AI.run()`, handles CORS preflight, and returns streamed or JSON response.

- [ ] **Step 1: Create `worker/cloudflare-worker.js`**
  - Handle CORS headers (`Access-Control-Allow-Origin: *`, `OPTIONS` preflight).
  - Validate request payload.
  - Call `env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages, stream: true })`.
  - Return streaming response with `content-type: text/event-stream`.

- [ ] **Step 2: Create `worker/wrangler.toml`**
  - Configuration file with `name = "cf-ai-chatbot"`, `main = "cloudflare-worker.js"`, and `[ai] binding = "AI"`.

- [ ] **Step 3: Create `README.md`**
  - Step-by-step setup guide for both:
    1. Using the frontend right now (with built-in simulated Workers AI).
    2. Deploying the Cloudflare Worker in 2 minutes using Wrangler (`npx wrangler deploy`).
    3. Connecting the frontend to the deployed Worker endpoint.

- [ ] **Step 4: Commit**

```bash
git add worker/ README.md
git commit -m "docs: add ready-to-deploy Cloudflare Worker script and guide"
```

---

### Task 6: Visual & Interactive Verification with Browser Subagent

**Files:**
- Test: browser verification

- [ ] **Step 1: Start local dev server on port 3000 or 5173**
  - Run `npx -y serve . -l 3000` or Node built-in HTTP server.

- [ ] **Step 2: Launch `browser_subagent` to test UI**
  - Open `http://localhost:3000`.
  - Verify floating launcher button is visible and animated.
  - Click launcher to expand the chat widget.
  - Click a suggestion prompt chip and verify user message appears, typing indicator activates, and streaming response generates.
  - Test sending custom message via input bar.
  - Verify copy code button works on code snippets.
  - Verify settings modal can be opened and closed.
  - Capture recording/screenshots to confirm high visual appeal.

- [ ] **Step 3: Final polish and cleanup**
  - Clean up any temporary test artifacts.
  - Verify clean git status.
