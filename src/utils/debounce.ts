export interface Debounced<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void
  cancel(): void
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }) as Debounced<T>

  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}
