import { store } from '../store.js';

/**
 * Set a key to hold a string value
 * @param {Object} clientState - Client state object
 * @param {String} key - Key to set
 * @param {String} value - Value to set
 * @returns {String} RESP simple string response
 */
export default async function set(clientState, key, value) {
  try {
    // If in transaction, queue the command
    if (clientState.inTransaction) {
      clientState.commandQueue.push({
        command: 'SET',
        args: [key, value]
      });
      return '+QUEUED\r\n';
    }

    // Execute immediately if not in transaction
    await store.set(key, value, clientState?.clientId);
    return '+OK\r\n';
  } catch (error) {
    console.error('SET command error:', error);
    return '-ERR ' + error.message + '\r\n';
  }
}
