# Transactions in Redis-LMDB

## Introduction

Redis-LMDB implements Redis-compatible transactions using LMDB as the underlying storage engine. All Redis commands that use transactions within the original Redis project should use transactions powered by LMDB within Redis-LMDB. This ensures data consistency and maintains proper Redis semantics while leveraging the performance benefits of LMDB.

## Transaction Overview

Transactions in Redis-LMDB function similarly to Redis transactions, providing a way to execute multiple commands atomically. This means that either all commands in a transaction are processed, or none of them are. This is essential for maintaining data consistency, especially when multiple operations need to happen as an indivisible unit.

### Key Features

1. **Atomicity**: All commands in a transaction are executed as a single atomic operation
2. **Command Queuing**: Commands between `MULTI` and `EXEC`/`DISCARD` are queued for later execution
3. **All-or-nothing Execution**: If any command fails, the entire transaction is aborted
4. **Isolated Execution**: Changes from one transaction are not visible to other clients until committed

## Commands that Use Transactions

Redis-LMDB supports the following transaction-related Redis commands:

- **MULTI**: Marks the start of a transaction block
- **EXEC**: Executes all commands issued after MULTI
- **DISCARD**: Discards all commands issued after MULTI

Additionally, the following commands can be used within a transaction:

- **SET**: Store a key-value pair
- **GET**: Retrieve a value by key
- **DEL**: Delete a key
- **EXISTS**: Check if a key exists
- **KEYS**: Find all keys matching a pattern

## Implementation Details

### Transaction Life Cycle

1. **Initiation**: A transaction begins when a client issues the `MULTI` command
2. **Command Queuing**: All subsequent commands are queued but not executed
3. **Execution or Cancellation**: The transaction is either executed with `EXEC` or canceled with `DISCARD`
4. **Cleanup**: The transaction state is cleared, regardless of the outcome

### LMDB Transaction Integration

Redis-LMDB uses a custom transaction management system that integrates with LMDB's native transaction API. The implementation follows these principles:

1. **Command Queuing**: During the transaction, commands are not immediately executed but stored in a queue
2. **Operation Tracking**: Write operations (SET, DEL) are tracked for later execution
3. **Atomic Execution**: When EXEC is called, all operations are executed within a single LMDB transaction
4. **Consistent Reads**: Read operations during a transaction provide a consistent view of the database

Here's a high-level overview of how transactions are implemented:

```js
// When MULTI is called:
- Generate a unique client ID
- Initialize a transaction state object to track operations
- Set the inTransaction flag

// When a command is executed within a transaction:
- Queue the command for later execution
- For write operations (SET, DEL), track the operation details
- Return "QUEUED" to the client

// When EXEC is called:
- Execute all queued commands
- Use LMDB's transaction API to atomically apply all tracked write operations
- Clear the transaction state

// When DISCARD is called:
- Discard all queued commands
- Abort any pending transaction state
- Clear the transaction state
```

### Transaction Storage Implementation

Transactions in Redis-LMDB are implemented using a combination of application-level command queuing and LMDB's native transaction support:

1. **Transaction State Object**: Each client's transaction is tracked with a state object:
   ```js
   {
     clientId: 'unique_id',    // Unique identifier for the client
     inTransaction: true,      // Transaction status flag
     commandQueue: []          // Queue of command functions to execute
   }
   ```

2. **Command Queuing**: Commands are queued as functions during the transaction:
   ```js
   commandQueue.push(async () => {
     await store.set(key, value);
     return respOK();
   });
   ```

3. **Atomic Execution**: On EXEC, all queued commands are executed within a single LMDB transaction:
   ```js
   try {
     // Execute all queued commands
     for (const command of commandQueue) {
       const result = await command();
       results.push(result);
     }
     
     // Commit the store transaction
     store.commitTransaction(clientId);
   } catch (error) {
     // If there's an error, abort the transaction
     store.abortTransaction(clientId);
     throw error;
   }
   ```

## Error Handling

Transaction error handling follows Redis conventions:

1. **Pre-execution Errors**: Syntax errors or invalid commands are detected before execution and cause the transaction to be aborted
2. **Execution Errors**: If an error occurs during execution of the EXEC command, the transaction is aborted and no changes are made
3. **Command Queue Validation**: Invalid commands in the queue are detected and reported when the transaction is executed

## Example Usage

Here's an example of how transactions are used in Redis-LMDB:

```
MULTI           # Start a transaction
SET user:1 "Alice"
SET user:2 "Bob"
DEL user:3    
EXEC            # Execute all commands atomically
```

If executed successfully, all three operations will be performed as a single atomic unit. If any operation fails, none of the changes will be applied.

## Best Practices

1. **Keep Transactions Short**: Long-running transactions can block other operations and degrade performance
2. **Limit Transaction Size**: Avoid queuing too many commands in a single transaction
3. **Handle Transaction Errors**: Always check for errors when executing transactions
4. **Consider Performance Impact**: Transactions have overhead; use them only when necessary for atomicity

## Conclusion

Redis-LMDB's transaction system provides Redis-compatible semantics while leveraging LMDB's performance and durability. By using this system, developers can ensure data consistency in complex operations while maintaining the familiar Redis transaction interface. 

## Testing

Redis-LMDB includes comprehensive tests for transaction functionality:

1. **Unit Tests**: Individual commands like MULTI, EXEC, and DISCARD are tested separately to ensure correct behavior
2. **Integration Tests**: The `redis-transactions.test.js` test file verifies transaction functionality with actual Redis clients
3. **Test Coverage**: Tests verify all key transaction features:
   - Basic transaction flow (MULTI, EXEC, DISCARD)
   - Multi-command transactions
   - Mixed read/write operations in transactions 
   - Error handling
   - Non-existent key handling

All transaction tests run smoothly with the Jest testing framework and are fully compatible with ES modules. The tests ensure that Redis-LMDB transactions behave consistently with Redis specifications while leveraging the performance benefits of LMDB. 