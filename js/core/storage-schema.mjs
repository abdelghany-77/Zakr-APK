import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const storageSchema = require("./storage-schema.js");

export const {
  BACKUP_SCHEMA_VERSION,
  validateBackupPayload,
  createBackupPayload,
} = storageSchema;
