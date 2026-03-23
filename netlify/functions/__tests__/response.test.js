import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let responseModule

beforeEach(async () => {
  vi.resetModules()
  // Set the ALLOWED_ORIGIN before importing so the module picks it up
  process.env.ALLOWED_ORIGIN = 'https://nyspotlightreport.com'
  responseModule = await import('../_shared/response.js')
})

afterEach(() => {
  delete process.env.ALLOWED_ORIGIN
  vi.restoreAllMocks()
})

describe('success', () => {
  it('returns 200 status by default', () => {
    const result = responseModule.success({ message: 'ok' })
    expect(result.statusCode).toBe(200)
  })

  it('returns custom status code', () => {
    const result = responseModule.success({ created: true }, 201)
    expect(result.statusCode).toBe(201)
  })

  it('returns JSON content type header', () => {
    const result = responseModule.success({ data: 'test' })
    expect(result.headers['Content-Type']).toBe('application/json')
  })

  it('includes CORS headers', () => {
    const result = responseModule.success({ data: 'test' })
    expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
    expect(result.headers['Access-Control-Allow-Methods']).toBeDefined()
    expect(result.headers['Access-Control-Allow-Headers']).toBeDefined()
  })

  it('serializes data as JSON body', () => {
    const data = { name: 'test', count: 42 }
    const result = responseModule.success(data)
    expect(JSON.parse(result.body)).toEqual(data)
  })

  it('merges extra headers', () => {
    const result = responseModule.success({ ok: true }, 200, { 'X-Custom': 'value' })
    expect(result.headers['X-Custom']).toBe('value')
    expect(result.headers['Content-Type']).toBe('application/json')
  })
})

describe('error', () => {
  it('returns 400 status by default', () => {
    const result = responseModule.error('Bad request')
    expect(result.statusCode).toBe(400)
  })

  it('returns custom status code', () => {
    const result = responseModule.error('Not found', 404)
    expect(result.statusCode).toBe(404)
  })

  it('returns 401 for auth errors', () => {
    const result = responseModule.error('Unauthorized', 401)
    expect(result.statusCode).toBe(401)
  })

  it('returns 500 for server errors', () => {
    const result = responseModule.error('Internal error', 500)
    expect(result.statusCode).toBe(500)
  })

  it('wraps message in error field', () => {
    const result = responseModule.error('Something broke')
    const body = JSON.parse(result.body)
    expect(body.error).toBe('Something broke')
  })

  it('includes JSON content type', () => {
    const result = responseModule.error('fail')
    expect(result.headers['Content-Type']).toBe('application/json')
  })

  it('includes CORS headers', () => {
    const result = responseModule.error('fail')
    expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
  })
})

describe('cors', () => {
  it('returns 204 status', () => {
    const result = responseModule.cors()
    expect(result.statusCode).toBe(204)
  })

  it('returns empty body', () => {
    const result = responseModule.cors()
    expect(result.body).toBe('')
  })

  it('includes Access-Control-Allow-Origin header', () => {
    const result = responseModule.cors()
    expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
  })

  it('includes Access-Control-Allow-Methods header', () => {
    const result = responseModule.cors()
    expect(result.headers['Access-Control-Allow-Methods']).toContain('GET')
    expect(result.headers['Access-Control-Allow-Methods']).toContain('POST')
    expect(result.headers['Access-Control-Allow-Methods']).toContain('OPTIONS')
  })

  it('includes Access-Control-Allow-Headers header', () => {
    const result = responseModule.cors()
    expect(result.headers['Access-Control-Allow-Headers']).toContain('Content-Type')
    expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization')
  })
})

describe('CORS origin configuration', () => {
  it('uses ALLOWED_ORIGIN env var for origin header', () => {
    const result = responseModule.success({ ok: true })
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://nyspotlightreport.com')
  })

  it('defaults to nyspotlightreport.com when env var is not set', async () => {
    delete process.env.ALLOWED_ORIGIN
    vi.resetModules()
    const mod = await import('../_shared/response.js')
    const result = mod.success({ ok: true })
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://nyspotlightreport.com')
  })

  it('uses custom origin from env var', async () => {
    process.env.ALLOWED_ORIGIN = 'https://custom-domain.com'
    vi.resetModules()
    const mod = await import('../_shared/response.js')
    const result = mod.success({ ok: true })
    expect(result.headers['Access-Control-Allow-Origin']).toBe('https://custom-domain.com')
  })
})

describe('html', () => {
  it('returns 200 status by default', () => {
    const result = responseModule.html('<h1>Hello</h1>')
    expect(result.statusCode).toBe(200)
  })

  it('returns custom status code', () => {
    const result = responseModule.html('<h1>Error</h1>', 500)
    expect(result.statusCode).toBe(500)
  })

  it('returns text/html content type', () => {
    const result = responseModule.html('<p>Test</p>')
    expect(result.headers['Content-Type']).toBe('text/html')
  })

  it('includes CORS origin header', () => {
    const result = responseModule.html('<p>Test</p>')
    expect(result.headers['Access-Control-Allow-Origin']).toBeDefined()
  })

  it('returns HTML body as-is', () => {
    const htmlContent = '<div><p>Hello World</p></div>'
    const result = responseModule.html(htmlContent)
    expect(result.body).toBe(htmlContent)
  })
})
