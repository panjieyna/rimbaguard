import { describe, expect, it } from 'vitest'
import { readBoundedJson } from '../../server/utils/body'

function streamOf(...values: string[]) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const value of values) controller.enqueue(new TextEncoder().encode(value))
    controller.close()
  } })
}

describe('bounded JSON parsing', () => {
  it('reads valid JSON across byte chunks', async () => {
    await expect(readBoundedJson(streamOf('{"title":', '"laporan"}'))).resolves.toEqual({ title: 'laporan' })
  })
  it('rejects a chunked body over the real byte limit', async () => {
    await expect(readBoundedJson(streamOf('123', '456'), 5)).rejects.toMatchObject({ statusCode: 413 })
  })
  it('counts UTF-8 bytes rather than string length', async () => {
    await expect(readBoundedJson(streamOf('"é"'), 3)).rejects.toMatchObject({ statusCode: 413 })
  })
  it.each(['', '{broken}', 'undefined'])('rejects malformed JSON: %s', async (value) => {
    await expect(readBoundedJson(streamOf(value))).rejects.toMatchObject({ statusCode: 400 })
  })
})
