import { store } from '../store.js';
import { respInteger } from '../resp.js';

/**
 * Delete a key
 * @param {Object} clientState - Client state object
 * @param {String} key - Key to delete
 * @returns {String} RESP integer response
 */
export default async function del(clientState, key) {
  try {
    // If in transaction, queue the command
    if (clientState.inTransaction) {
      clientState.commandQueue.push({
        command: 'DEL',
        args: [key]
      });
      return '+QUEUED\r\n';
    }

    // Execute immediately if not in transaction
    // First check if the key exists
    const exists = await store.exists(key, clientState?.clientId);
    
    if (exists) {
      // Delete the key
      const deleted = await store.del(key, clientState?.clientId);
      
      // Verify the key was actually deleted
      const stillExists = await store.exists(key, clientState?.clientId);
      
      if (stillExists) {
        console.error(`DEL command failed: Key ${key} still exists after deletion`);
        return respInteger(0); // Indicate failure with 0 keys deleted
      }
      
      return respInteger(1); // 1 key was deleted
    }
    
    return respInteger(0); // No keys were deleted
  } catch (error) {
    console.error('DEL command error:', error);
    return '-ERR ' + error.message + '\r\n';
  }
} 