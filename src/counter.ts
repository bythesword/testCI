export interface Counter {
  getValue(): number
  increment(): number
  decrement(): number
  reset(): number
}

export function createCounter(initial = 0): Counter {
  let value = initial

  return {
    getValue: () => value,
    increment: () => ++value,
    decrement: () => --value,
    reset: () => {
      value = initial
      return value
    },
  }
}
