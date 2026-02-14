// Convert snake_case DB rows <-> camelCase TypeScript objects

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function rowToModel<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value
  }
  return result as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function modelToRow(model: any): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(model)) {
    result[camelToSnake(key)] = value
  }
  return result
}

export function rowsToModels<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => rowToModel<T>(r))
}
