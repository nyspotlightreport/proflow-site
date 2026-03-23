import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let handler

beforeEach(async () => {
  process.env.ALLOWED_ORIGIN = 'https://nyspotlightreport.com'
  // No HubSpot key so it won't make real HTTP requests
  delete process.env.HUBSPOT_API_KEY

  vi.resetModules()
  const mod = await import('../subscribe.js')
  handler = mod.handler
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeEvent(method, body) {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    headers: {},
  }
}

describe('subscribe', () => {
  describe('OPTIONS request', () => {
    it('returns 204 with CORS headers', async () => {
      const result = await handler(makeEvent('OPTIONS'))
      expect(result.statusCode).toBe(204)
      expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST')
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Content-Type')
    })
  })

  describe('non-POST methods', () => {
    it('returns 405 for GET', async () => {
      const result = await handler(makeEvent('GET'))
      expect(result.statusCode).toBe(405)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Method not allowed')
    })

    it('returns 405 for PUT', async () => {
      const result = await handler(makeEvent('PUT'))
      expect(result.statusCode).toBe(405)
    })

    it('returns 405 for DELETE', async () => {
      const result = await handler(makeEvent('DELETE'))
      expect(result.statusCode).toBe(405)
    })
  })

  describe('input validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const event = { httpMethod: 'POST', body: '{broken', headers: {} }
      const result = await handler(event)
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid JSON')
    })

    it('returns 400 for invalid email', async () => {
      const result = await handler(makeEvent('POST', { email: 'not-an-email' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid email')
    })

    it('returns 400 for missing email', async () => {
      const result = await handler(makeEvent('POST', { name: 'Test User' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid email')
    })

    it('returns 400 for empty email string', async () => {
      const result = await handler(makeEvent('POST', { email: '' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid email')
    })

    it('returns 400 for email without domain', async () => {
      const result = await handler(makeEvent('POST', { email: 'user@' }))
      expect(result.statusCode).toBe(400)
    })
  })

  describe('valid subscription', () => {
    it('accepts a valid email and returns success', async () => {
      const result = await handler(makeEvent('POST', {
        email: 'subscriber@example.com',
        name: 'Test User',
      }))

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.success).toBe(true)
      expect(body.email).toBe('subscriber@example.com')
      expect(body.results).toBeDefined()
      // Without HUBSPOT_API_KEY, hubspot result should be "no_key"
      expect(body.results.hubspot).toBe('no_key')
    })

    it('normalizes email to lowercase', async () => {
      const result = await handler(makeEvent('POST', {
        email: 'USER@EXAMPLE.COM',
      }))

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.email).toBe('user@example.com')
    })

    it('accepts subscription without name', async () => {
      const result = await handler(makeEvent('POST', {
        email: 'noname@example.com',
      }))

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.success).toBe(true)
    })

    it('sanitizes name field (strips HTML)', async () => {
      const result = await handler(makeEvent('POST', {
        email: 'test@example.com',
        name: '<script>alert("xss")</script>John',
      }))

      expect(result.statusCode).toBe(200)
      // The subscribe function uses sanitizeString which strips HTML tags
      // We just verify it doesn't crash and succeeds
      const body = JSON.parse(result.body)
      expect(body.success).toBe(true)
    })
  })

  describe('HubSpot integration', () => {
    it('reports no_key when HUBSPOT_API_KEY is not set', async () => {
      delete process.env.HUBSPOT_API_KEY
      vi.resetModules()
      const mod = await import('../subscribe.js')

      const result = await mod.handler(makeEvent('POST', {
        email: 'test@example.com',
      }))

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.results.hubspot).toBe('no_key')
    })
  })
})
