/** Normalize a to-one PostgREST embed, including legacy array-shaped responses. */
export function relatedRecord<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
