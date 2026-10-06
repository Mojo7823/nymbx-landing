/// <reference lib="webworker" />
import { expose } from 'comlink'
import { validateJsonSchema } from './validate'

const api = { validate: validateJsonSchema }

export type SchemaWorkerApi = typeof api

expose(api)
