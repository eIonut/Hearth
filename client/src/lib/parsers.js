// Shared parsing/serialization for the "name: value" textareas in the project
// form. Each config field (services, env targets, previews, links) is one entry
// per line as "name: value", with a per-field fallback when the colon is omitted.

// Parse "name: value" lines into { name, value } pairs; blank lines are skipped.
// For a line with no colon: if `defaultName` is given it becomes the name and the
// whole line is the value; otherwise the line is used as both name and value.
export function parseNamedLines(text, { defaultName } = {}) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(':');
      if (i === -1) return { name: defaultName ?? l, value: l };
      return { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() };
    });
}

// Serialize { name, [valueKey] } entries back into "name: value" lines.
export function serializeNamedLines(items, valueKey) {
  return (items || []).map((it) => `${it.name}: ${it[valueKey]}`).join('\n');
}

// Services support a trailing "*" on the name for auto-restart on crash,
// e.g. "api*: yarn start". A line without a colon is used as both name and command.
export function parseServices(text) {
  return parseNamedLines(text).map(({ name, value }) => {
    let n = name;
    let autoRestart = false;
    if (n.endsWith('*')) {
      autoRestart = true;
      n = n.slice(0, -1).trim();
    }
    return { name: n, cmd: value, autoRestart };
  });
}

export function serializeServices(services) {
  return (services || []).map((s) => `${s.name}${s.autoRestart ? '*' : ''}: ${s.cmd}`).join('\n');
}

// Env targets: "name: relative/path", defaulting a bare path to the "default" preset.
export function parseEnvTargets(text) {
  return parseNamedLines(text, { defaultName: 'default' }).map(({ name, value }) => ({
    name,
    file: value,
  }));
}

// Preview URLs: "service: url", defaulting a bare URL to the "app" service.
export function parsePreviews(text) {
  return parseNamedLines(text, { defaultName: 'app' }).map(({ name, value }) => ({
    name,
    url: value,
  }));
}

// Links: "name: url"; a bare URL becomes both the label and the target.
export function parseLinks(text) {
  return parseNamedLines(text).map(({ name, value }) => ({ name, url: value }));
}
