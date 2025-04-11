import { respOK } from "../resp.js";
import { store } from '../store.js';

/**
 * Discards all commands queued since MULTI
 * @param {Object} clientState - The client's connection state
 * @returns {String} OK response or error if not in transaction
 */
export default function discard(clientState) {
  // Check if client is in a transaction
  if (!clientState.inTransaction) {
    return '-ERR DISCARD without MULTI\r\n';
  }

  // Abort the transaction in the store
  store.abortTransaction(clientState.clientId);

  // Clear the command queue
  clientState.commandQueue = [];
  
  // Reset transaction flag
  clientState.inTransaction = false;
  
  return respOK();
} 