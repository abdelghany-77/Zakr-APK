/**
 * Shared backup schema validation — single source of truth for browser runtime & Node tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TazkeerStorageSchema = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var BACKUP_SCHEMA_VERSION = 1;

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function validateBackupPayload(payload) {
    if (!isPlainObject(payload)) {
      return { valid: false, reason: "Backup must be an object." };
    }

    if (payload.type !== "tazkeer-progress-backup") {
      return { valid: false, reason: "Unsupported backup type." };
    }

    if (payload.version !== BACKUP_SCHEMA_VERSION) {
      return { valid: false, reason: "Unsupported backup version." };
    }

    if (!isPlainObject(payload.keys)) {
      return { valid: false, reason: "Backup keys are missing or invalid." };
    }

    var invalidKey = Object.keys(payload.keys).find(function (key) {
      return typeof key !== "string" || typeof payload.keys[key] !== "string";
    });
    if (invalidKey) {
      return { valid: false, reason: "Backup value is invalid for key: " + invalidKey };
    }

    return { valid: true, reason: null };
  }

  function createBackupPayload(keys, exportedAt) {
    if (!isPlainObject(keys)) throw new TypeError("Backup keys must be an object.");
    var copy = {};
    Object.keys(keys).forEach(function (k) {
      copy[k] = keys[k];
    });
    return {
      app: "tazkeer",
      type: "tazkeer-progress-backup",
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: exportedAt || new Date().toISOString(),
      keys: copy,
    };
  }

  return {
    BACKUP_SCHEMA_VERSION: BACKUP_SCHEMA_VERSION,
    validateBackupPayload: validateBackupPayload,
    createBackupPayload: createBackupPayload,
  };
});
