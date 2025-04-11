import { store } from '../store.js';
import { respInteger } from '../resp.js';

/**
 * Check if a key exists
 * @param {Object} clientState - Client state object
 * @param {String} key - Key to check
 * @returns {String} RESP integer response
 */
export default async function exists(clientState, key) {
  try {
    // If in transaction, queue the command
    if (clientState.inTransaction) {
      clientState.commandQueue.push({
        command: 'EXISTS',
        args: [key]
      });
      return '+QUEUED\r\n';
    }

    // Execute immediately if not in transaction
    const exists = await store.exists(key, clientState?.clientId);
    return respInteger(exists ? 1 : 0);
  } catch (error) {
    console.error('EXISTS command error:', error);
    return '-ERR ' + error.message + '\r\n';
  }
} 