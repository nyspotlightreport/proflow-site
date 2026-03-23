import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock bcryptjs before importing the handler
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
}))

// Mock the shared auth module
vi.mock('../_shared/auth', () => ({
  signToken: vi.fn(() => 'mock-jwt-token'),
}))

import bcrypt from 'bcryptjs'
import { signToken } from '../_shared/auth'

// We need to require the handler after mocks are set up
// But since the module uses require(), we use dynamic import pattern
let handler

beforeEach(async () => {
  // Set required env vars
  process.env.ADMIN_EMAIL = 'admin@example.com'
  process.env.ADMIN_PASSWORD_HASH = '$2a$10$hashedpassword'
  process.env.JWT_SECRET = 'test-secret'
  process.env.ALLOWED_ORIGIN = 'https://nyspotlightreport.com'

  // Reset mocks
  vi.resetModules()
  vi.clearAllMocks()

  // Re-mock after resetModules
  vi.doMock('bcryptjs', () => ({
    compare: bcrypt.compare,
  }))
  vi.doMock('../_shared/auth', () => ({
    signToken: signToken,
  }))

  // Re-import handler with fresh module state
  const mod = await import('../auth-login.js')
  handler = mod.handler
})

afterEach(() => {
  delete process.env.ADMIN_EMAIL
  delete process.env.ADMIN_PASSWORD_HASH
  delete process.env.JWT_SECRET
  vi.restoreAllMocks()
})

function makeEvent(method, body) {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    headers: {},
  }
}

describe('auth-login', () => {
  describe('OPTIONS request', () => {
    it('returns CORS headers with 204 status', async () => {
      const result = await handler(makeEvent('OPTIONS'))
      expect(result.statusCode).toBe(204)
      expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST')
    })
  })

  describe('non-POST/OPTIONS request', () => {
    it('returns 405 for GET', async () => {
      const result = await handler(makeEvent('GET'))
      expect(result.statusCode).toBe(405)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Method not allowed')
    })
  })

  describe('input validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const event = { httpMethod: 'POST', body: 'not-json', headers: {} }
      const result = await handler(event)
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid JSON')
    })

    it('returns 400 for invalid email format', async () => {
      const result = await handler(makeEvent('POST', { email: 'not-email', password: 'password123' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid email')
    })

    it('returns 400 for missing email', async () => {
      const result = await handler(makeEvent('POST', { password: 'password123' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid email')
    })

    it('returns 400 for missing password', async () => {
      const result = await handler(makeEvent('POST', { email: 'admin@example.com' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Password required')
    })

    it('returns 400 for password shorter than 4 characters', async () => {
      const result = await handler(makeEvent('POST', { email: 'admin@example.com', password: 'abc' }))
      expect(result.statusCode).toBe(400)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Password required')
    })
  })

  describe('valid admin login', () => {
    it('returns JWT token on correct credentials', async () => {
      bcrypt.compare.mockResolvedValue(true)
      signToken.mockReturnValue('mock-jwt-token')

      const result = await handler(makeEvent('POST', {
        email: 'admin@example.com',
        password: 'correctpassword',
      }))

      expect(result.statusCode).toBe(200)
      const body = JSON.parse(result.body)
      expect(body.token).toBe('mock-jwt-token')
      expect(body.email).toBe('admin@example.com')
      expect(body.name).toBe('S.C. Thomas')
      expect(body.plan).toBe('agency')
      expect(body.role).toBe('chairman')

      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', '$2a$10$hashedpassword')
      expect(signToken).toHaveBeenCalledWith({
        email: 'admin@example.com',
        name: 'S.C. Thomas',
        plan: 'agency',
        role: 'chairman',
      })
    })

    it('normalizes email to lowercase', async () => {
      bcrypt.compare.mockResolvedValue(true)
      signToken.mockReturnValue('mock-jwt-token')

      const result = await handler(makeEvent('POST', {
        email: 'ADMIN@EXAMPLE.COM',
        password: 'correctpassword',
      }))

      expect(result.statusCode).toBe(200)
      expect(bcrypt.compare).toHaveBeenCalled()
    })
  })

  describe('invalid credentials', () => {
    it('returns 401 for wrong password', async () => {
      bcrypt.compare.mockResolvedValue(false)

      const result = await handler(makeEvent('POST', {
        email: 'admin@example.com',
        password: 'wrongpassword',
      }))

      expect(result.statusCode).toBe(401)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid credentials')
    })

    it('returns 401 for unknown email', async () => {
      const result = await handler(makeEvent('POST', {
        email: 'unknown@example.com',
        password: 'password123',
      }))

      expect(result.statusCode).toBe(401)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Invalid credentials')
      // bcrypt.compare should NOT be called for non-admin emails
      expect(bcrypt.compare).not.toHaveBeenCalled()
    })
  })

  describe('server configuration', () => {
    it('returns 500 when ADMIN_EMAIL is not set', async () => {
      delete process.env.ADMIN_EMAIL
      vi.resetModules()
      vi.doMock('bcryptjs', () => ({ compare: bcrypt.compare }))
      vi.doMock('../_shared/auth', () => ({ signToken }))
      const mod = await import('../auth-login.js')

      const result = await mod.handler(makeEvent('POST', {
        email: 'admin@example.com',
        password: 'password123',
      }))

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Server configuration error')
    })

    it('returns 500 when ADMIN_PASSWORD_HASH is not set', async () => {
      delete process.env.ADMIN_PASSWORD_HASH
      vi.resetModules()
      vi.doMock('bcryptjs', () => ({ compare: bcrypt.compare }))
      vi.doMock('../_shared/auth', () => ({ signToken }))
      const mod = await import('../auth-login.js')

      const result = await mod.handler(makeEvent('POST', {
        email: 'admin@example.com',
        password: 'password123',
      }))

      expect(result.statusCode).toBe(500)
      const body = JSON.parse(result.body)
      expect(body.error).toBe('Server configuration error')
    })
  })
})
