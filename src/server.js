import net from "net";
import * as store from "./store.js";
import {
  parseRESP,
  respError,
  respArray,
  respBulk,
  RESPBuffer,
} from "./resp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const activeSockets = new Set();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load command handlers dynamically
const commands = {};
const commandFiles = fs.readdirSync(path.join(__dirname, "commands"));
console.log(
  "Loading Redis commands:",
  commandFiles.map((file) => path.basename(file, ".js").toUpperCase())
);
commandFiles.forEach(async (file) => {
  const commandName = path.basename(file, ".js").toUpperCase();
  commands[commandName] = (await import(`./commands/${file}`)).default;
});

// Parse command line arguments
const args = process.argv.slice(2);
let port = 6379; // Default port

// Check for --port argument
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--port" && i + 1 < args.length) {
    port = parseInt(args[i + 1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error("Invalid port number. Using default port 6379.");
      port = 6379;
    }
    break;
  }
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true);
  activeSockets.add(socket);

  // Connection-specific state
  socket.redislmdbState = {
    inTransaction: false,
    commandQueue: [],
    respBuffer: new RESPBuffer(),
    writeInProgress: false,
  };

  // Handle backpressure
  const processCommand = async (args) => {
    //console.log("Received command args:", args);
    const [cmd, ...params] = args;
    const command = cmd.toUpperCase();
    //console.log("Command:", command, "Params:", params);

    try {
      let response = "";

      if (commands[command]) {
        if (
          command === "MULTI" ||
          command === "EXEC" ||
          command === "DISCARD"
        ) {
          // Transaction control commands are executed immediately
          response = await commands[command](socket.redislmdbState, ...params);

          // Special handling for EXEC - Redis client expects an array response
          if (command === "EXEC" && !response.startsWith("-")) {
            // Make sure EXEC response is properly formatted as RESP array
            if (!response.startsWith("*")) {
              console.log(
                "Reformatting EXEC response for client compatibility"
              );
              const parts = response.split("\r\n");
              if (parts.length >= 2) {
                // Parse array size from RESP format
                const size = parseInt(parts[0].substring(1), 10);
                if (!isNaN(size)) {
                  // Already formatted correctly
                  response = response;
                }
              }
            }
          }
        } else if (socket.redislmdbState.inTransaction) {
          // Queue command for later execution
          socket.redislmdbState.commandQueue.push({
            command: command,
            args: params,
          });
          response = "+QUEUED\r\n";
        } else {
          // Normal command execution
          const commandResult = await commands[command](
            socket.redislmdbState,
            ...params
          );

          // Handle different response types
          if (typeof commandResult === "string") {
            // String response is already formatted properly
            response = commandResult;
          } else if (Array.isArray(commandResult)) {
            // Convert array to RESP format using respArray
            response = respArray(commandResult);
          } else {
            // Default to string conversion for other types
            response = respBulk(String(commandResult));
          }
        }
      } else {
        response = respError(`ERR unknown command '${command}'`);
      }

      // Handle write backpressure
      const canWrite = socket.write(response);
      if (!canWrite) {
        // Pause reading if we can't write
        socket.pause();
        socket.redislmdbState.writeInProgress = true;
      }
    } catch (e) {
      console.error("Error:", e);
      socket.write(respError(e.message));
    }
  };

  // Handle drain event to resume reading
  socket.on("drain", () => {
    if (socket.redislmdbState.writeInProgress) {
      socket.redislmdbState.writeInProgress = false;
      socket.resume();
    }
  });

  socket.on("data", (data) => {
    // Pause reading if write is in progress
    if (socket.redislmdbState.writeInProgress) {
      socket.pause();
      return;
    }

    // Add data to buffer
    socket.redislmdbState.respBuffer.append(data);

    // Process complete messages
    let args;
    while ((args = socket.redislmdbState.respBuffer.tryParse()) !== null) {
      processCommand(args).catch((err) => {
        console.error("Command processing error:", err);
        socket.write(respError("Internal error"));
      });
    }
  });

  socket.on("close", () => {
    activeSockets.delete(socket);
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err);
    activeSockets.delete(socket);
  });
});

server.listen(port, () => {
  console.log(`🚀 Redis-LMDB is running on port ${port}`);
});

let isShuttingDown = false; // Flag to prevent multiple shutdowns

// Graceful shutdown
const shutdown = (signal) => {
  if (isShuttingDown) return; // Check if shutdown is already in progress
  isShuttingDown = true; // Set the flag to indicate shutdown is in progress

  console.log(`\n🛑 Shutting down gracefully due to ${signal}...`);
  server.close(() => {
    console.log("✅ Server closed.");
  });

  for (const socket of activeSockets) {
    socket.destroy();
  }

  if (store.close) {
    store.close(); // optional: release LMDB
  }

  setTimeout(() => process.exit(0), 300); // safety timeout
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
