import { describe, it, expect } from 'vitest'
import { escapeHtml, isValidEmail, sanitizeString, parseBody } from '../_shared/utils'

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('escapes less-than', () => {
    expect(escapeHtml('a<b')).toBe('a&lt;b')
  })

  it('escapes greater-than', () => {
    expect(escapeHtml('a>b')).toBe('a&gt;b')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('a"b')).toBe('a&quot;b')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("a'b")).toBe('a&#39;b')
  })

  it('escapes backticks', () => {
    expect(escapeHtml('a`b')).toBe('a&#96;b')
  })

  it('escapes all dangerous chars in one string', () => {
    expect(escapeHtml('<script>"alert(\'xss\')&`</script>')).toBe(
      '&lt;script&gt;&quot;alert(&#39;xss&#39;)&amp;&#96;&lt;/script&gt;'
    )
  })

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
    expect(escapeHtml(123)).toBe('')
    expect(escapeHtml({})).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})

describe('isValidEmail', () => {
  it('accepts standard email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('first.last@domain.org')).toBe(true)
    expect(isValidEmail('user+tag@sub.domain.com')).toBe(true)
  })

  it('rejects strings without @', () => {
    expect(isValidEmail('userexample.com')).toBe(false)
  })

  it('rejects strings without domain', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  it('rejects strings without local part', () => {
    expect(isValidEmail('@example.com')).toBe(false)
  })

  it('rejects strings with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false)
    expect(isValidEmail('user@ example.com')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(undefined)).toBe(false)
    expect(isValidEmail(123)).toBe(false)
  })

  it('rejects emails exceeding 254 characters', () => {
    const longLocal = 'a'.repeat(245)
    const longEmail = `${longLocal}@example.com`
    expect(longEmail.length).toBeGreaterThan(254)
    expect(isValidEmail(longEmail)).toBe(false)
  })

  it('accepts emails at exactly 254 characters', () => {
    // Build an email that is exactly 254 chars
    const domain = '@example.com' // 12 chars
    const local = 'a'.repeat(254 - domain.length)
    const email = local + domain
    expect(email.length).toBe(254)
    expect(isValidEmail(email)).toBe(true)
  })
})

describe('sanitizeString', () => {
  it('strips HTML tags', () => {
    expect(sanitizeString('<b>bold</b>')).toBe('bold')
    expect(sanitizeString('<script>alert("xss")</script>')).toBe('alert("xss")')
  })

  it('strips nested HTML tags', () => {
    expect(sanitizeString('<div><p>text</p></div>')).toBe('text')
  })

  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello')
  })

  it('truncates to default max length (500)', () => {
    const longStr = 'a'.repeat(600)
    const result = sanitizeString(longStr)
    expect(result.length).toBe(500)
  })

  it('truncates to custom max length', () => {
    const result = sanitizeString('abcdefghij', 5)
    expect(result).toBe('abcde')
  })

  it('returns empty string for non-string input', () => {
    expect(sanitizeString(null)).toBe('')
    expect(sanitizeString(undefined)).toBe('')
    expect(sanitizeString(123)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(sanitizeString('')).toBe('')
  })

  it('passes through safe strings unchanged', () => {
    expect(sanitizeString('hello world')).toBe('hello world')
  })
})

describe('parseBody', () => {
  it('parses valid JSON body', () => {
    const event = { body: '{"email":"test@example.com","name":"Test"}' }
    const result = parseBody(event)
    expect(result).toEqual({ email: 'test@example.com', name: 'Test' })
  })

  it('returns null for invalid JSON', () => {
    const event = { body: '{invalid json' }
    expect(parseBody(event)).toBeNull()
  })

  it('returns empty object for null body', () => {
    const event = { body: null }
    const result = parseBody(event)
    expect(result).toEqual({})
  })

  it('returns empty object for undefined body', () => {
    const event = {}
    const result = parseBody(event)
    expect(result).toEqual({})
  })

  it('returns empty object for empty string body', () => {
    const event = { body: '' }
    const result = parseBody(event)
    expect(result).toEqual({})
  })

  it('handles nested JSON objects', () => {
    const event = { body: '{"data":{"nested":true},"count":5}' }
    const result = parseBody(event)
    expect(result).toEqual({ data: { nested: true }, count: 5 })
  })

  it('handles JSON arrays', () => {
    const event = { body: '[1,2,3]' }
    const result = parseBody(event)
    expect(result).toEqual([1, 2, 3])
  })
})
