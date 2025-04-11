import { store } from '../store.js';
import { respBulk } from '../resp.js';

/**
 * Get the value of a key
 * @param {Object} clientState - Client state object
 * @param {String} key - Key to get
 * @returns {String} RESP bulk string response
 */
export default async function get(clientState, key) {
  try {
    // If in transaction, queue the command
    if (clientState.inTransaction) {
      clientState.commandQueue.push({
        command: 'GET',
        args: [key]
      });
      return '+QUEUED\r\n';
    }

    // Execute immediately if not in transaction
    const value = await store.get(key, clientState?.clientId);
    return respBulk(value);
  } catch (error) {
    console.error('GET command error:', error);
    return '-ERR ' + error.message + '\r\n';
  }
} 