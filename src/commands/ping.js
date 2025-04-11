import { respOK } from "../resp.js";

/**
 * Ping command for health checking
 * @param {Object} clientState - The client's connection state
 * @returns {String} PONG response
 */
export default function ping(clientState) {
  // If we're inside a transaction, queue this command and return QUEUED
  if (clientState && clientState.inTransaction) {
    clientState.commandQueue.push(() => '+PONG\r\n');
    return '+QUEUED\r\n';
  }
  
  // Otherwise, respond immediately
  return '+PONG\r\n';
} 