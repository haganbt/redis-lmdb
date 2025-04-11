import { respOK, respArray } from '../resp.js';

/**
 * Handle CLIENT command
 * @param {Object} clientState - Client state object
 * @param {String} subcommand - Subcommand (e.g. SETNAME, GETNAME)
 * @param {...String} args - Additional arguments
 * @returns {String} RESP response
 */
export default function client(clientState, subcommand, ...args) {
  if (!subcommand) {
    return '-ERR wrong number of arguments for \'client\' command\r\n';
  }

  const cmd = subcommand.toUpperCase();
  switch (cmd) {
    case 'SETNAME':
      if (!args[0]) {
        return '-ERR wrong number of arguments for \'client setname\' command\r\n';
      }
      clientState.name = args[0];
      return respOK();

    case 'GETNAME':
      return clientState.name ? `$${clientState.name.length}\r\n${clientState.name}\r\n` : '$-1\r\n';

    case 'ID':
      return `:${clientState.clientId ? parseInt(clientState.clientId.split('_')[1]) : 0}\r\n`;

    case 'LIST':
      return respArray([`id=${clientState.clientId || 0} name=${clientState.name || ''}`]);

    case 'INFO':
      return respArray([`id=${clientState.clientId || 0} name=${clientState.name || ''}`]);

    default:
      return respOK();
  }
} 