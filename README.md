# Redis-LMDB: LMDB Redis-Compatible Key-Value Store (Node.js)

**Redis-LMDB** is a lightweight, **Redis-compatible key-value store** built using [LMDB](http://www.lmdb.tech/doc/) and Node.js.

This project emulates a subset of the **Redis protocol (RESP)** and responds to real Redis clients (e.g., `redis-cli`) over TCP — but all data is persisted locally using LMDB, a memory-mapped embedded database with zero-copy reads and ACID compliance.

---

## 🚀 Why?

Redis is powerful but often overkill for small, embedded, or single-node use cases where:

- You don't need clustering or replication
- You want to avoid background processes
- You want **persistence with zero config**
- You want Redis-like speed, but local and minimal

---

## ✅ Supported Redis Commands

| Command      | Description                           |
| ------------ | ------------------------------------- |
| PING         | Health check, returns `PONG`          |
| SET key val  | Store a value                         |
| GET key      | Retrieve a value                      |
| DEL key      | Delete a key                          |
| EXISTS key   | Check if a key exists                 |
| KEYS pattern | List all keys matching a pattern      |
| SCAN cursor  | Incrementally iterate the key space   |
| MULTI        | Start a transaction                   |
| EXEC         | Execute all commands in a transaction |
| DISCARD      | Discard all commands in a transaction |

All commands and features within this project should align with Redis's principles of atomicity and transactions to ensure consistent and reliable behavior.

For detailed information about the transaction system, see [docs/transactions.md](docs/transactions.md).

Works with `redis-cli` and basic Redis clients.

---

## 🧪 Getting Started

1. Clone and install:

```bash
git clone https://github.com/haganbt/redis-lmdb.git
cd redis-lmdb
pnpm install
```

2. Start the server:

```bash
pnpm start
```

Server listens on port `6379`.

---

## 🧰 Usage Example with `redis-cli`

```bash
redis-cli -p 6379
```

```redis
> SET foo bar
OK

> GET foo
"bar"

> EXISTS foo
(integer) 1

> KEYS *
1) "foo"

> SCAN 0
1) "0"
2) 1) "foo"

> DEL foo
(integer) 1

> MULTI
OK
> SET user:1 "Alice"
QUEUED
> SET user:2 "Bob"
QUEUED
> EXEC
1) OK
2) OK
```

---

## ✨ Why LMDB?

- Zero-copy reads = lightning-fast access
- Safe, transactional, and ACID-compliant
- Embedded — no server to run, just a local DB
- Compact and efficient B+Tree format
- Used in production by OpenLDAP, Mozilla, Lightning AI, and more

---

## ⚖️ Limitations

- Not a full Redis replacement
- No clustering or replication
- Only a subset of RESP commands
- No TTL or eviction yet

---

## 🧪 Testing

To ensure the functionality of Redis-LMDB, we have set up unit and integration tests using Jest. These tests verify that each Redis command and the overall system behave as expected.

### Running Tests

1. Ensure all dependencies are installed:

```bash
pnpm install
```

2. Run the tests:

```bash
pnpm test
```

This will execute all test suites and provide feedback on the functionality of the commands.

### Running Specific Tests

To run specific test categories:

```bash
# Run unit tests only
npx jest --config=jest.config.cjs tests/unit

# Run integration tests only
npx jest --config=jest.config.cjs tests/integration

# Run a specific test file
npx jest --config=jest.config.cjs tests/unit/ping.test.js
```

### Performance Testing

Redis-LMDB includes a performance testing script that measures the database's performance across different operations:

```bash
# Run the performance test with default settings
node scripts/mmap-performance-test.js

# Run with custom settings
node scripts/mmap-performance-test.js --host=localhost --port=6379 --total-size=1000 --value-size=50
```

The performance test measures:

- Write performance (throughput and data rate)
- Random read performance
- Sequential scan performance
- Memory-mapped file behavior with large datasets

For detailed information about testing, see [docs/testing.md](docs/testing.md).

### ES Module Support

Our test system supports ES modules through Babel configuration. The test configuration is in `jest.config.cjs` and the Babel configuration is in `babel.config.cjs`.

### Transaction Handling

Redis-LMDB supports Redis-compatible transactions with LMDB. For more details on how transactions are implemented, see [docs/transactions.md](docs/transactions.md).
