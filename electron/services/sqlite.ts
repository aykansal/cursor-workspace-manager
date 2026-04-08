import { createRequire } from 'module'
import type DatabaseType from 'better-sqlite3'

const require = createRequire(import.meta.url)

export const Database = require('better-sqlite3') as typeof DatabaseType
