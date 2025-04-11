import { respOK } from "../resp.js";
import { store } from '../store.js';

/**
 * Starts a transaction for the client
 * @param {Object} clientState - The client's connection state
 * @returns {String} OK response or error if already in a transaction
 */
export default function multi(clientState) {
  // Check if already in a transaction
  if (clientState.inTransaction) {
    return '-ERR MULTI calls can not be nested\r\n';
  }

  // Generate a unique client ID if not already present
  if (!clientState.clientId) {
    clientState.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Start a transaction in the store
  store.beginTransaction(clientState.clientId);
  
  // Initialize the command queue for this client connection
  clientState.commandQueue = [];
  
  // Set the transaction flag for this client connection
  clientState.inTransaction = true;
  
  return respOK();
} 