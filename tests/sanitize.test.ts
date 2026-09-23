import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/utils/sanitize';

describe('Sanitization utility (Finding 3 - XSS Prevention)', () => {
  it('escapes dangerous HTML tags and script elements', () => {
    const malicious = '<script>alert("XSS")</script>';
    expect(escapeHtml(malicious)).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  it('escapes inline event handlers and payload characters', () => {
    const input = '<img src=x onerror=\'alert(1)\'> & "test"';
    expect(escapeHtml(input)).toBe('&lt;img src=x onerror=&#039;alert(1)&#039;&gt; &amp; &quot;test&quot;');
  });

  it('safely handles non-string and falsy types', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(12345)).toBe('12345');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
  });
});
