import client from '../../src/commands/client.js';

// Mock client state
const mockClientState = {
  clientId: 'client_123456789',
  name: null
};

beforeEach(() => {
  // Reset mock state before each test
  mockClientState.name = null;
});

test('CLIENT SETNAME should set client name and return OK', () => {
  const response = client(mockClientState, 'SETNAME', 'test-client');
  
  // Should set client name
  expect(mockClientState.name).toBe('test-client');
  
  // Should return OK
  expect(response).toBe('+OK\r\n');
});

test('CLIENT SETNAME should return error if no name provided', () => {
  const response = client(mockClientState, 'SETNAME');
  
  // Should return error
  expect(response).toBe('-ERR wrong number of arguments for \'client setname\' command\r\n');
  
  // Should not set client name
  expect(mockClientState.name).toBeNull();
});

test('CLIENT GETNAME should return client name if set', () => {
  // Set a client name
  mockClientState.name = 'test-client';
  
  const response = client(mockClientState, 'GETNAME');
  
  // Should return client name in RESP bulk string format
  expect(response).toBe('$11\r\ntest-client\r\n');
});

test('CLIENT GETNAME should return null if no name set', () => {
  const response = client(mockClientState, 'GETNAME');
  
  // Should return null in RESP format
  expect(response).toBe('$-1\r\n');
});

test('CLIENT ID should return client ID', () => {
  const response = client(mockClientState, 'ID');
  
  // Should return client ID in RESP integer format
  expect(response).toBe(':123456789\r\n');
});

test('CLIENT LIST should return client info', () => {
  // Set a client name
  mockClientState.name = 'test-client';
  
  const response = client(mockClientState, 'LIST');
  
  // Should return client info in RESP array format
  expect(response).toBe('*1\r\n$36\r\nid=client_123456789 name=test-client\r\n');
});

test('CLIENT INFO should return client info', () => {
  // Set a client name
  mockClientState.name = 'test-client';
  
  const response = client(mockClientState, 'INFO');
  
  // Should return client info in RESP array format
  expect(response).toBe('*1\r\n$36\r\nid=client_123456789 name=test-client\r\n');
});

test('CLIENT with unknown subcommand should return OK', () => {
  const response = client(mockClientState, 'UNKNOWN');
  
  // Should return OK
  expect(response).toBe('+OK\r\n');
});

test('CLIENT without subcommand should return error', () => {
  const response = client(mockClientState);
  
  // Should return error
  expect(response).toBe('-ERR wrong number of arguments for \'client\' command\r\n');
}); 