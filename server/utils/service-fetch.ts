/** Bound server service calls without exposing request URLs or abort reasons. */
export function createServiceFetch(fetcher: typeof globalThis.fetch = globalThis.fetch, timeoutMs = 15_000): typeof globalThis.fetch {
  return async (input, init) => {
    try {
      const signals = [AbortSignal.timeout(timeoutMs)]
      if (input instanceof Request) signals.push(input.signal)
      if (init?.signal) signals.push(init.signal)
      const signal = AbortSignal.any(signals)
      return await fetcher(input, { ...init, signal })
    }
    catch {
      // Fetch/abort errors can contain token URLs or a caller-supplied reason.
      // Keep the original exception out of both the message and error cause.
      throw new Error('Permintaan layanan belum dapat diselesaikan. Silakan coba kembali.')
    }
  }
}
