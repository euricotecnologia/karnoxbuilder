declare module 'node-firebird' {
  interface Database {
    query(sql: string, callback: (error: Error | null, result: unknown) => void): void
    query(sql: string, params: unknown[], callback: (error: Error | null, result: unknown) => void): void
    detach(callback?: () => void): void
  }

  interface Options {
    host: string
    port: number
    database: string
    user: string
    password: string
    lowercase_keys?: boolean
    role?: string | null
    pageSize?: number
  }

  function attach(options: Options, callback: (error: Error | null, database: Database) => void): void
  function create(options: Options, callback: (error: Error | null, database: Database) => void): void
}
