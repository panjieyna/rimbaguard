import { describe, expect, it } from 'vitest'
import { createServiceFetch } from '../../server/utils/service-fetch'

const safeMessage = 'Permintaan layanan belum dapat diselesaikan. Silakan coba kembali.'

function waitingTransport() {
  let observedSignal: AbortSignal | null | undefined
  let requests = 0
  const fetcher: typeof globalThis.fetch = async (_input, init) => {
    requests++
    observedSignal = init?.signal
    return new Promise<Response>((_resolve, reject) => {
      if (!observedSignal) { reject(new Error('Missing cancellation signal')); return }
      const fail = () => reject(new Error('private fixture URL and abort detail'))
      if (observedSignal.aborted) fail()
      else observedSignal.addEventListener('abort', fail, { once: true })
    })
  }
  return { fetcher, signal: () => observedSignal, requests: () => requests }
}

describe('bounded service transport', () => {
  it('aborts a stalled transport and returns only a static safe exception', async () => {
    const pending = waitingTransport()
    let failure: unknown
    try { await createServiceFetch(pending.fetcher, 20)('https://service.example.invalid/private') }
    catch (error) { failure = error }
    expect(pending.signal()?.aborted).toBe(true)
    expect(pending.requests()).toBe(1)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(safeMessage)
    expect((failure as Error).cause).toBeUndefined()
    expect(String(failure)).not.toContain('private')
    expect(String(failure)).not.toContain('https://')
  })

  it.each(['request', 'init'] as const)('preserves cancellation from the %s signal when both are present', async (source) => {
    const requestAbort = new AbortController()
    const initAbort = new AbortController()
    const request = new Request('https://service.example.invalid/rpc', { signal: requestAbort.signal })
    const pending = waitingTransport()
    const result = createServiceFetch(pending.fetcher)(request, { signal: initAbort.signal })
    const failure = expect(result).rejects.toThrow(safeMessage)
    ;(source === 'request' ? requestAbort : initAbort).abort(new Error('private caller abort reason'))
    await failure
    expect(pending.signal()?.aborted).toBe(true)
    expect(pending.requests()).toBe(1)
  })

  it('preserves an already-aborted caller signal', async () => {
    const controller = new AbortController()
    controller.abort('private caller reason')
    const pending = waitingTransport()
    await expect(createServiceFetch(pending.fetcher)('https://service.example.invalid/rpc', { signal: controller.signal })).rejects.toThrow(safeMessage)
    expect(pending.signal()?.aborted).toBe(true)
  })

  it('returns non-success responses unchanged without retrying or discarding request options', async () => {
    const response = new Response('{"code":"rate_limited"}', { status: 429, headers: { 'retry-after': '30' } })
    const input = new Request('https://service.example.invalid/rpc', { method: 'POST', body: '{}' })
    const options = { headers: { 'content-type': 'application/json' }, body: '{"fixture":true}', cache: 'no-store' as const }
    let observedInput: Parameters<typeof fetch>[0] | undefined
    let observedOptions: RequestInit | undefined
    let requests = 0
    const fetcher: typeof globalThis.fetch = async (request, init) => {
      requests++; observedInput = request; observedOptions = init
      return response
    }
    const result = await createServiceFetch(fetcher)(input, options)
    expect(result).toBe(response)
    expect(result.status).toBe(429)
    expect(result.headers.get('retry-after')).toBe('30')
    expect(await result.json()).toEqual({ code: 'rate_limited' })
    expect(requests).toBe(1)
    expect(observedInput).toBe(input)
    expect(observedOptions).toMatchObject(options)
    expect(observedOptions?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sanitizes a rejected network error without retaining its cause', async () => {
    const fetcher: typeof globalThis.fetch = async () => { throw new Error('private transport detail') }
    try { await createServiceFetch(fetcher)('https://service.example.invalid/rpc') }
    catch (error) {
      expect((error as Error).message).toBe(safeMessage)
      expect((error as Error).cause).toBeUndefined()
      expect(String(error)).not.toContain('private')
      return
    }
    throw new Error('Expected the failed transport to reject.')
  })
})
