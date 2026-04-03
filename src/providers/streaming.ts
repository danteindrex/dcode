function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {}
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

type TextBlockState = {
  kind: 'text'
  index: number
  text: string
}

type ToolBlockState = {
  kind: 'tool_use'
  index: number
  id: string
  name: string
  inputJson: string
}

type BlockState = TextBlockState | ToolBlockState

export class ProviderStreamAccumulator {
  private started = false
  private nextIndex = 0
  private readonly messageId = randomUUID()
  private readonly blocks = new Map<string, BlockState>()

  begin(ttftMs?: number): unknown[] {
    if (this.started) {
      return []
    }

    this.started = true
    return [
      {
        type: 'stream_event' as const,
        event: {
          type: 'message_start' as const,
          message: {
            id: this.messageId,
            usage: {
              input_tokens: 0,
              output_tokens: 0,
            },
          },
        },
        ...(ttftMs !== undefined ? { ttftMs } : {}),
      },
    ]
  }

  addTextDelta(key: string, deltaText: string, ttftMs?: number): unknown[] {
    if (!deltaText) {
      return []
    }

    const events = this.begin(ttftMs)
    let block = this.blocks.get(key)

    if (!block) {
      block = {
        kind: 'text',
        index: this.nextIndex++,
        text: '',
      }
      this.blocks.set(key, block)
      events.push({
        type: 'stream_event' as const,
        event: {
          type: 'content_block_start' as const,
          index: block.index,
          content_block: {
            type: 'text' as const,
            text: '',
          },
        },
      })
    }

    if (block.kind !== 'text') {
      return events
    }

    block.text += deltaText
    events.push({
      type: 'stream_event' as const,
      event: {
        type: 'content_block_delta' as const,
        index: block.index,
        delta: {
          type: 'text_delta' as const,
          text: deltaText,
        },
      },
    })
    return events
  }

  addToolJsonDelta(
    key: string,
    descriptor: { id: string; name: string },
    jsonDelta: string,
    ttftMs?: number,
  ): unknown[] {
    const events = this.begin(ttftMs)
    let block = this.blocks.get(key)

    if (!block) {
      block = {
        kind: 'tool_use',
        index: this.nextIndex++,
        id: descriptor.id,
        name: descriptor.name,
        inputJson: '',
      }
      this.blocks.set(key, block)
      events.push({
        type: 'stream_event' as const,
        event: {
          type: 'content_block_start' as const,
          index: block.index,
          content_block: {
            type: 'tool_use' as const,
            id: descriptor.id,
            name: descriptor.name,
            input: '',
          },
        },
      })
    }

    if (block.kind !== 'tool_use') {
      return events
    }

    if (jsonDelta) {
      block.inputJson += jsonDelta
      events.push({
        type: 'stream_event' as const,
        event: {
          type: 'content_block_delta' as const,
          index: block.index,
          delta: {
            type: 'input_json_delta' as const,
            partial_json: jsonDelta,
          },
        },
      })
    }

    return events
  }

  ensureToolUse(
    key: string,
    descriptor: { id: string; name: string; input?: Record<string, unknown> },
    ttftMs?: number,
  ): unknown[] {
    if (this.blocks.has(key)) {
      return []
    }

    const inputJson =
      descriptor.input && Object.keys(descriptor.input).length > 0
        ? JSON.stringify(descriptor.input)
        : ''

    return this.addToolJsonDelta(
      key,
      { id: descriptor.id, name: descriptor.name },
      inputJson,
      ttftMs,
    )
  }

  finish(): unknown[] {
    if (!this.started) {
      return []
    }

    return [
      {
        type: 'stream_event' as const,
        event: {
          type: 'message_stop' as const,
        },
      },
    ]
  }

  buildContent(): Record<string, unknown>[] {
    return [...this.blocks.values()]
      .sort((left, right) => left.index - right.index)
      .map(block => {
        if (block.kind === 'text') {
          return {
            type: 'text',
            text: block.text,
          }
        }

        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: parseJsonObject(block.inputJson),
        }
      })
  }
}
import { randomUUID } from 'crypto'
