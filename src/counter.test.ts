import { describe, expect, it } from 'vitest'
import { createCounter } from './counter'

describe('createCounter', () => {
  it('starts at the given initial value', () => {
    expect(createCounter(3).getValue()).toBe(3)
  })

  it('defaults to zero', () => {
    expect(createCounter().getValue()).toBe(0)
  })

  it('increments the value', () => {
    const counter = createCounter(0)
    expect(counter.increment()).toBe(1)
    expect(counter.getValue()).toBe(1)
  })

  it('decrements the value', () => {
    const counter = createCounter(5)
    expect(counter.decrement()).toBe(4)
    expect(counter.getValue()).toBe(4)
  })

  it('resets back to the initial value', () => {
    const counter = createCounter(2)
    counter.increment()
    counter.increment()
    expect(counter.reset()).toBe(2)
    expect(counter.getValue()).toBe(2)
  })
})
