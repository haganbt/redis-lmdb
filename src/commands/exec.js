import { store } from '../store.js';
import keys from './keys.js';
import set from './set.js';
import get from './get.js';
import del from './del.js';
import exists from './exists.js';

const commandHandlers = {
  'SET': set,
  'GET': get,
  'DEL': del,
  'KEYS': keys,
  'EXISTS': exists
};

/**
 * Execute all commands queued since MULTI
 * @param {Object} clientState - Client state object
 * @returns {String} Array response with results of all commands or error if not in a transaction
 */
export default async function exec(clientState) {
  try {
    if (!clientState.inTransaction) {
      return '-ERR EXEC without MULTI\r\n';
    }

    // Create a non-transactional state for executing commands
    const execState = {
      inTransaction: false,
      commandQueue: []
    };

    const results = [];
    for (const cmd of clientState.commandQueue) {
      const handler = commandHandlers[cmd.command];
      if (!handler) {
        return '-ERR unknown command ' + cmd.command + '\r\n';
      }
      
      const result = await handler(execState, ...cmd.args);
      results.push(result);
    }

    // Commit the transaction in the store
    store.commitTransaction(clientState.clientId);

    // Clear transaction state
    clientState.inTransaction = false;
    clientState.commandQueue = [];
    
    // Return RESP array of results
    const response = `*${results.length}\r\n`;
    return response + results.join('');
  } catch (error) {
    console.error('EXEC command error:', error);
    // Abort transaction on error
    store.abortTransaction(clientState.clientId);
    clientState.inTransaction = false;
    clientState.commandQueue = [];
    return '-ERR ' + error.message + '\r\n';
  }
}
