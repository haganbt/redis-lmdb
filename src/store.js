import { open } from "lmdb";
import fs from 'fs';
import path from 'path';

// Get database path from environment variable or use default
const dbPath = process.env.LMDB_PATH || "./db";
const mapSize = parseInt(process.env.LMDB_MAP_SIZE) || 1024 * 1024 * 1024 * 2; // Default 2 GiB

// Make sure DB directory exists
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

// Database configuration
const dbConfig = {
  path: dbPath,
  compression: true,
  mapSize: mapSize,
  encoding: "utf8", // Use UTF-8 encoding for proper string handling
  // Enable autoFlush to ensure writes are immediately persisted to disk
  autoFlush: true
};

// Initialize the database
let db = open(dbConfig);

// Cache to handle test transaction integrity
const cache = new Map();

// Active transaction tracking
let activeTransactions = new Map(); // Maps clientId to transaction state

// Add a Map to store active scan cursors - key is cursor ID, value is internal state
let scanCursors = new Map();
let nextCursorId = 1;

/**
 * Queue an operation in a transaction or execute immediately
 * @param {String} type - Operation type ('put' or 'remove')
 * @param {String} key - The key to operate on
 * @param {*} value - The value (for put operations)
 * @param {String} clientId - Client identifier for transactions
 */
const queueOrExecute = (type, key, value, clientId) => {
  const txnState = clientId ? activeTransactions.get(clientId) : null;

  if (txnState && txnState.active) {
    // Queue operation for later execution in transaction
    txnState.operations.push({ type, key, value });
    return Promise.resolve(true); // Return true to indicate operation was queued
  } else {
    // Execute immediately
    return new Promise((resolve, reject) => {
      try {
        if (type === "put") {
          db.put(key, value);
          // Update cache
          cache.set(key, value);
        } else if (type === "remove") {
          db.remove(key);
          // Update cache
          cache.delete(key);
        }
        // Explicitly sync the database to ensure writes are persisted
        db.sync();
        resolve(true);
      } catch (error) {
        console.error(`Error in queueOrExecute: ${error.message}`);
        reject(error);
      }
    });
  }
};

export const store = {
  /**
   * Reset the database by clearing all data and reinitializing
   * This is primarily used for testing
   */
  reset: async () => {
    try {
      // Close the current database
      if (db) {
        db.close();
      }
      
      // Clear all transaction state
      activeTransactions.clear();
      
      // Clear cache
      cache.clear();
      
      // Clear scan cursors
      scanCursors.clear();
      
      // Create the directory if it doesn't exist
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }
      
      // Delete LMDB data files if they exist
      const dataFile = path.join(dbPath, 'data.mdb');
      const lockFile = path.join(dbPath, 'lock.mdb');
      
      if (fs.existsSync(dataFile)) {
        fs.unlinkSync(dataFile);
      }
      
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
      
      // Reinitialize the database
      db = open(dbConfig);
      
      return true;
    } catch (error) {
      console.error(`Error resetting database: ${error.message}`);
      return false;
    }
  },

  /**
   * Start a transaction for a client
   * @param {String} clientId - Client identifier
   * @returns {Object} Transaction object
   */
  beginTransaction: (clientId) => {
    if (activeTransactions.has(clientId)) {
      return null; // Transaction already exists
    }

    // Create transaction state object
    const txnState = {
      operations: [], // Store operations to be executed
      active: true,
    };

    activeTransactions.set(clientId, txnState);
    return txnState;
  },

  /**
   * Execute the stored operations within a transaction
   * @param {String} clientId - Client identifier
   * @returns {Boolean} Success status
   */
  commitTransaction: (clientId) => {
    const txnState = activeTransactions.get(clientId);
    if (!txnState || !txnState.active) {
      return false;
    }

    // Execute transaction using LMDB's transaction API
    try {
      db.transaction(() => {
        for (const op of txnState.operations) {
          if (op.type === "put") {
            db.put(op.key, op.value);
            // Update cache
            cache.set(op.key, op.value);
          } else if (op.type === "remove") {
            db.remove(op.key);
            // Update cache
            cache.delete(op.key);
          }
        }
      });
      
      // Explicitly sync after transaction
      db.sync();

      // Clear transaction
      txnState.active = false;
      activeTransactions.delete(clientId);
      return true;
    } catch (error) {
      console.error(`Transaction commit failed: ${error.message}`);
      // LMDB automatically aborts on error
      txnState.active = false;
      activeTransactions.delete(clientId);
      return false;
    }
  },

  /**
   * Abort a transaction
   * @param {String} clientId - Client identifier
   * @returns {Boolean} Success status
   */
  abortTransaction: (clientId) => {
    const txnState = activeTransactions.get(clientId);
    if (!txnState || !txnState.active) {
      return false;
    }

    // Just clear the transaction state without executing
    txnState.active = false;
    activeTransactions.delete(clientId);
    return true;
  },

  /**
   * Set a key to hold a string value
   * @param {String} key - Key to set
   * @param {String} value - Value to set
   * @param {String} clientId - Client identifier for transactions
   */
  set: async (key, value, clientId) => {
    return queueOrExecute("put", key, value, clientId);
  },

  /**
   * Get the value of a key
   * @param {String} key - Key to get
   * @param {String} clientId - Client identifier for transactions
   */
  get: async (key, clientId) => {
    try {
      // Check cache first for better test reliability
      if (cache.has(key)) {
        return cache.get(key);
      }
      
      // Otherwise get from db
      const value = db.get(key);
      
      // Update cache if value is found
      if (value !== undefined) {
        cache.set(key, value);
      }
      
      return value;
    } catch (error) {
      console.error(`Error getting key ${key}: ${error.message}`);
      return undefined;
    }
  },

  /**
   * Delete a key
   * @param {String} key - Key to delete
   * @param {String} clientId - Client identifier for transactions
   * @returns {Boolean} True if the key was deleted, false if it didn't exist
   */
  del: async (key, clientId) => {
    try {
      const exists = await store.exists(key, clientId);
      if (!exists) {
        return false; // Key doesn't exist
      }
      
      // Queue operation if in transaction
      const txnState = clientId ? activeTransactions.get(clientId) : null;
      if (txnState && txnState.active) {
        txnState.operations.push({ type: "remove", key });
        return true;
      }
      
      // Execute immediately
      db.remove(key);
      // Update cache
      cache.delete(key);
      // Explicitly sync to ensure persistence
      db.sync();
      
      return true;
    } catch (error) {
      console.error(`Error deleting key ${key}: ${error.message}`);
      return false;
    }
  },

  /**
   * Check if a key exists
   * @param {String} key - Key to check
   * @param {String} clientId - Client identifier for transactions
   */
  exists: async (key, clientId) => {
    try {
      // Check cache first
      if (cache.has(key)) {
        return true;
      }
      
      // Otherwise check db
      const exists = (await db.get(key)) !== undefined;
      
      // Update cache if value exists
      if (exists) {
        const value = await db.get(key);
        cache.set(key, value);
      }
      
      return exists;
    } catch (error) {
      console.error(`Error checking if key ${key} exists: ${error.message}`);
      return false;
    }
  },

  /**
   * Find all keys matching a pattern
   * @param {String} pattern - Pattern to match against
   * @param {String} clientId - Client identifier for transactions
   */
  keys: async (pattern = "*", clientId) => {
    const txnState = clientId ? activeTransactions.get(clientId) : null;

    if (txnState && txnState.active) {
      // Queue a keys operation for transaction
      txnState.operations.push({ type: "keys", pattern });
      return [];
    }

    try {
      // Use the same pattern matching logic as scan
      const regex = store._globToRegex(pattern);
      const result = [];

      // Use a cursor-based approach for efficiency
      let cursor = db.getRange();
      for (const { key } of cursor) {
        if (regex.test(key)) {
          result.push(key);
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting keys with pattern ${pattern}: ${error.message}`);
      return [];
    }
  },

  /**
   * Convert Redis glob pattern to regular expression
   * @param {String} pattern - Redis glob pattern
   * @returns {RegExp} - Regular expression
   * @private
   */
  _globToRegex: (pattern) => {
    // Standard Redis glob pattern to regex conversion
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
      .replace(/\*/g, ".*")                 // * matches any sequence
      .replace(/\?/g, ".");                // ? matches single char
      
    return new RegExp("^" + regexPattern + "$");
  },

  /**
   * Scan the keyspace using a cursor-based iteration
   * @param {Number} cursor - The cursor value to continue from or 0 to start a new scan
   * @param {String} pattern - Glob-style pattern to match keys
   * @param {Number} count - Hint for how many keys to return per call
   * @returns {Object} - { nextCursor, keys }
   */
  scan: async (cursor, pattern = '*', count = 10) => {
    try {
      const result = { nextCursor: 0, keys: [] };
      
      // Convert count to number if it's a string
      const pageSize = typeof count === 'string' ? parseInt(count, 10) : count;
      const effectiveCount = isNaN(pageSize) ? 10 : pageSize;
      
      // Convert pattern to regex for matching
      const regex = store._globToRegex(pattern);

      // Initialize position tracking
      let position = 0;
      let currentKey = null;

      // Handle cursor based on input
      if (cursor === 0 || cursor === '0') {
        // Start a new scan
        result.nextCursor = 0;
      } else {
        // Parse cursor if it's a string
        const cursorId = typeof cursor === 'string' ? parseInt(cursor, 10) : cursor;
        
        // Retrieve the cursor state if valid
        if (!isNaN(cursorId) && cursorId > 0) {
          const cursorState = scanCursors.get(cursorId);
          if (cursorState) {
            // Continue from saved position
            position = cursorState.position;
            currentKey = cursorState.lastKey;
            
            // Remove used cursor to prevent memory leaks
            scanCursors.delete(cursorId);
          }
        }
        // If cursor is invalid or not found, we'll start fresh
      }
      
      // Get all keys efficiently - don't load all values, just keys
      const allKeys = Array.from(db.getKeys());
      
      // Skip to the position we left off at
      let startIndex = 0;
      if (position > 0 && currentKey) {
        const resumeIndex = allKeys.findIndex(key => key === currentKey) + 1;
        startIndex = resumeIndex >= 0 ? resumeIndex : 0;
      }
      
      // Collect matching keys with pagination
      let collected = 0;
      let i = startIndex;
      
      for (; i < allKeys.length && collected < effectiveCount; i++) {
        const key = allKeys[i];
        if (regex.test(key)) {
          result.keys.push(key);
          collected++;
        }
      }
      
      // If we haven't reached the end, create a new cursor
      if (i < allKeys.length) {
        // Create new cursor with position information
        const newCursorId = nextCursorId++;
        scanCursors.set(newCursorId, {
          position: i,
          lastKey: allKeys[i - 1],
          pattern: pattern, // Store pattern for validation
          createdAt: Date.now() // For potential cursor expiration
        });
        result.nextCursor = newCursorId;
      }
      
      // Periodically clean up old cursors (older than 5 minutes)
      if (Math.random() < 0.05) { // ~5% chance to run cleanup
        const now = Date.now();
        const CURSOR_TTL = 5 * 60 * 1000; // 5 minutes
        for (const [id, state] of scanCursors.entries()) {
          if (now - state.createdAt > CURSOR_TTL) {
            scanCursors.delete(id);
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error(`Error in scan operation: ${error.message}`);
      // Return empty result set with cursor 0 on error
      return { nextCursor: 0, keys: [] };
    }
  },

  /**
   * Clean up all transactions and close the database
   */
  close: () => {
    try {
      // Clear all transaction states
      activeTransactions.clear();
      
      // Clear cache
      cache.clear();
      
      // Clear scan cursors
      scanCursors.clear();

      // Close the database
      db.close();
      return true;
    } catch (error) {
      console.error(`Error closing database: ${error.message}`);
      return false;
    }
  },
};
