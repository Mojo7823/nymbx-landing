import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Small typed key-value store for app/tool preferences.
 * NEVER store user file content here — settings and drafts only.
 */
export interface SettingsSchema {
  theme: 'light' | 'dark'
  // Future tools extend this interface with their preference keys.
  [key: string]: unknown
}

interface SettingsDB extends DBSchema {
  settings: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<SettingsDB>> | undefined

function db(): Promise<IDBPDatabase<SettingsDB>> {
  dbPromise ??= openDB<SettingsDB>('nymbx', 1, {
    upgrade(database) {
      database.createObjectStore('settings')
    },
  })
  return dbPromise
}

export async function getSetting<K extends keyof SettingsSchema & string>(
  key: K,
): Promise<SettingsSchema[K] | undefined> {
  return (await (await db()).get('settings', key)) as SettingsSchema[K] | undefined
}

export async function setSetting<K extends keyof SettingsSchema & string>(
  key: K,
  value: SettingsSchema[K],
): Promise<void> {
  await (await db()).put('settings', value, key)
}

export async function deleteSetting(key: keyof SettingsSchema & string): Promise<void> {
  await (await db()).delete('settings', key)
}
