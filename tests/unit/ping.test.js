import ping from '../../src/commands/ping.js';

test('PING command should return PONG', async () => {
  // Create a mock client state
  const mockClientState = {
    inTransaction: false,
    commandQueue: []
  };
  
  const response = ping(mockClientState);
  expect(response).toBe('+PONG\r\n');
}); 