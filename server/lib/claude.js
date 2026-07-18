import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let sdk = null;
try {
  sdk = require('@anthropic-ai/claude-agent-sdk');
} catch {
  console.warn(
    '[dev-hub] @anthropic-ai/claude-agent-sdk not installed — Claude features disabled.',
  );
}

const HUB_DIR = path.join(import.meta.dirname, '..', '..');

function available() {
  return !!sdk;
}

// Interactive/agentic query — caller iterates the stream
function query(prompt, options = {}) {
  if (!sdk) throw new Error('Claude Agent SDK not installed');
  return sdk.query({ prompt, options });
}

// One-shot text generation (no tools) — used by content drafts & digest
async function runText(prompt) {
  if (!sdk) throw new Error('Claude Agent SDK not installed');
  const q = sdk.query({
    prompt,
    options: {
      cwd: HUB_DIR,
      permissionMode: 'default',
      allowedTools: [],
      maxTurns: 1,
    },
  });
  let out = '';
  for await (const m of q) {
    if (m.type === 'result') {
      if (m.subtype === 'success') out = m.result;
      else throw new Error('Claude run failed: ' + m.subtype);
    }
  }
  return out;
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in Claude response');
  return JSON.parse(match[0]);
}

export { available, query, runText, extractJSON, HUB_DIR };
