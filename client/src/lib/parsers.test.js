import { describe, it, expect } from 'vitest';
import {
  parseNamedLines,
  serializeNamedLines,
  parseServices,
  serializeServices,
  parseEnvTargets,
  parsePreviews,
  parseLinks,
} from './parsers.js';

describe('parseNamedLines', () => {
  it('splits "name: value" pairs and trims whitespace', () => {
    expect(parseNamedLines('web:  yarn dev \n  api : node .')).toEqual([
      { name: 'web', value: 'yarn dev' },
      { name: 'api', value: 'node .' },
    ]);
  });

  it('skips blank lines', () => {
    expect(parseNamedLines('web: a\n\n   \napi: b')).toHaveLength(2);
  });

  it('only splits on the first colon', () => {
    expect(parseNamedLines('url: http://localhost:4000')).toEqual([
      { name: 'url', value: 'http://localhost:4000' },
    ]);
  });

  it('uses the line as both name and value when no colon and no default', () => {
    expect(parseNamedLines('bareword')).toEqual([{ name: 'bareword', value: 'bareword' }]);
  });

  it('applies defaultName as the name when a line has no colon', () => {
    expect(parseNamedLines('just/a/path', { defaultName: 'default' })).toEqual([
      { name: 'default', value: 'just/a/path' },
    ]);
  });
});

describe('parseServices', () => {
  it('parses name and command', () => {
    expect(parseServices('web: yarn dev')).toEqual([
      { name: 'web', cmd: 'yarn dev', autoRestart: false },
    ]);
  });

  it('reads a trailing "*" as auto-restart and strips it from the name', () => {
    expect(parseServices('api*: node .')).toEqual([
      { name: 'api', cmd: 'node .', autoRestart: true },
    ]);
  });

  it('round-trips through serializeServices', () => {
    const text = 'web: yarn dev\napi*: node .';
    expect(serializeServices(parseServices(text))).toBe(text);
  });
});

describe('serializeNamedLines', () => {
  it('rebuilds "name: value" lines from a chosen value key', () => {
    expect(serializeNamedLines([{ name: 'a', file: 'x' }], 'file')).toBe('a: x');
  });

  it('treats null/undefined as an empty list', () => {
    expect(serializeNamedLines(undefined, 'file')).toBe('');
  });
});

describe('domain wrappers', () => {
  // The default name only applies to a colon-less line; any line with a colon
  // (including a "web: localhost:4000" entry) splits on the first colon.
  it('parseEnvTargets splits "name: file", else defaults the name to "default"', () => {
    expect(parseEnvTargets('dev: .env.dev')).toEqual([{ name: 'dev', file: '.env.dev' }]);
    expect(parseEnvTargets('.env.dev')).toEqual([{ name: 'default', file: '.env.dev' }]);
  });

  it('parsePreviews splits "service: url", else defaults the service to "app"', () => {
    expect(parsePreviews('web: localhost:4000')).toEqual([{ name: 'web', url: 'localhost:4000' }]);
    expect(parsePreviews('mysite')).toEqual([{ name: 'app', url: 'mysite' }]);
  });

  it('parseLinks splits "label: url", else uses a colon-less line as both', () => {
    expect(parseLinks('Repo: https://example.com')).toEqual([
      { name: 'Repo', url: 'https://example.com' },
    ]);
    expect(parseLinks('README')).toEqual([{ name: 'README', url: 'README' }]);
  });
});
