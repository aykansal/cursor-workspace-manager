import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceMessage } from './contracts'

const forkMock = vi.fn()

vi.mock('child_process', () => ({
  fork: forkMock,
}))

class FakeChild extends EventEmitter {
  connected = true
  killed = false
  sentMessages: ServiceMessage[] = []

  send(message: ServiceMessage) {
    this.sentMessages.push(message)
  }

  kill() {
    this.killed = true
    this.connected = false
    this.emit('exit', 0, null)
  }
}

describe('service-client', () => {
  beforeEach(() => {
    forkMock.mockReset()
  })

  it('correlates request and response ids', async () => {
    const child = new FakeChild()
    forkMock.mockReturnValue(child)

    const { WorkspaceServiceClient } = await import('./service-client')
    const client = new WorkspaceServiceClient()
    client.start()

    const pending = client.request('listWorkspaces', undefined)
    const request = child.sentMessages[0] as Extract<ServiceMessage, { kind: 'request' }>
    expect(request.kind).toBe('request')

    child.emit('message', {
      kind: 'response',
      id: request.id,
      ok: true,
      result: [],
    } satisfies ServiceMessage)

    await expect(pending).resolves.toEqual([])
  })

  it('publishes service error state after unexpected exit', async () => {
    vi.useFakeTimers()

    const child = new FakeChild()
    forkMock.mockReturnValue(child)

    const { WorkspaceServiceClient } = await import('./service-client')
    const client = new WorkspaceServiceClient()
    const listener = vi.fn()
    client.on('scanState', listener)
    client.start()

    child.emit('exit', 1, null)
    await vi.runAllTimersAsync()

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      })
    )

    vi.useRealTimers()
  })
})
