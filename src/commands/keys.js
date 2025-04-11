import { store } from '../store.js';
import { respArray } from '../resp.js';

/**
 * Find all keys matching a pattern
 * @param {Object} clientState - Client state object
 * @param {String} pattern - Pattern to match against
 * @returns {String} RESP array response
 */
export default async function keys(clientState, pattern = "*") {
  try {
    // If in transaction, queue the command
    if (clientState.inTransaction) {
      clientState.commandQueue.push({
        command: 'KEYS',
        args: [pattern]
      });
      return '+QUEUED\r\n';
    }

    // Execute immediately if not in transaction
    const matchedKeys = await store.keys(pattern, clientState?.clientId);
    return respArray(matchedKeys);
  } catch (error) {
    console.error('KEYS command error:', error);
    return '-ERR ' + error.message + '\r\n';
  }
}
