/**
 * Minimal stand-ins for Next's req/res, enough for the API routes and for
 * getServerSideProps pages that write their own response body.
 */

export function mockRequest(method = 'GET', body?: unknown) {
  return { method, body, headers: {}, query: {} } as any
}

export interface MockResponse {
  statusCode: number
  headers: Record<string, string>
  /** What `write` received — the body of a getServerSideProps text route. */
  body: string
  /** What `json` or `send` received — the body of an API route. */
  payload: any
  ended: boolean
  setHeader(name: string, value: string): MockResponse
  status(code: number): MockResponse
  json(payload: unknown): MockResponse
  send(payload: unknown): MockResponse
  write(chunk: string): boolean
  end(): void
}

export function mockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    payload: undefined,
    ended: false,
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.payload = payload
      res.ended = true
      return res
    },
    send(payload) {
      res.payload = payload
      res.ended = true
      return res
    },
    write(chunk) {
      res.body += chunk
      return true
    },
    end() {
      res.ended = true
    },
  }
  return res
}

export function gssp(req = mockRequest(), res: MockResponse = mockResponse()) {
  return { req, res, query: {}, resolvedUrl: '/', params: {} } as any
}
