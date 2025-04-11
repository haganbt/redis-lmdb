// Parses RESP messages according to RESP v2 protocol
export const parseRESP = (input) => {
  // Ensure we're working with a buffer
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length === 0) return null;
  
  let pos = 0;
  const type = String.fromCharCode(buffer[pos++]);
  
  // We only accept array messages for commands
  if (type !== '*') return null;
  
  // Helper to read until CRLF
  const readUntilCRLF = () => {
    const end = buffer.indexOf('\r\n', pos);
    if (end === -1) return null;
    const value = buffer.slice(pos, end);
    pos = end + 2;
    return value;
  };

  // Parse array
  const lengthStr = readUntilCRLF();
  if (lengthStr === null) return null;
  
  const length = parseInt(lengthStr, 10);
  if (isNaN(length) || length < 0) return null;
  
  const args = [];
  for (let i = 0; i < length; i++) {
    if (pos >= buffer.length) return null;
    
    const argType = String.fromCharCode(buffer[pos++]);
    let value;
    
    switch (argType) {
      case '$': // Bulk String
        const bulkLengthStr = readUntilCRLF();
        if (bulkLengthStr === null) return null;
        
        const bulkLength = parseInt(bulkLengthStr, 10);
        if (isNaN(bulkLength)) return null;
        
        if (bulkLength === -1) {
          args.push(null);
          continue;
        }
        
        // Check if we have enough data
        if (pos + bulkLength > buffer.length) return null;
        
        // Read the string
        const str = buffer.slice(pos, pos + bulkLength);
        pos += bulkLength;
        
        // Find and verify CRLF
        const crlfPos = buffer.indexOf('\r\n', pos);
        if (crlfPos !== pos) return null;
        pos += 2;
        
        args.push(str.toString());
        break;
        
      case '+': // Simple String
        value = readUntilCRLF();
        if (value === null) return null;
        args.push(value.toString());
        break;
        
      case '-': // Error
        value = readUntilCRLF();
        if (value === null) return null;
        args.push(`Error: ${value.toString()}`);
        break;
        
      case ':': // Integer
        value = readUntilCRLF();
        if (value === null) return null;
        const intValue = parseInt(value, 10);
        if (isNaN(intValue)) return null;
        args.push(intValue);
        break;
        
      default:
        return null;
    }
  }
  
  // For multiple messages, we only consume the first complete message
  // This allows the client to buffer and process messages one at a time
  return args;
};

// RESP format encoders
export const respOK = () => '+OK\r\n';
export const respError = (msg) => `-${msg}\r\n`;
export const respBulk = (str) =>
  str == null ? '$-1\r\n' : `$${str.length}\r\n${str}\r\n`;
export const respInteger = (n) => `:${n}\r\n`;
export const respArray = (arr) =>
  `*${arr.length}\r\n` + arr.map(respBulk).join('');

// Buffer handler for RESP protocol
export class RESPBuffer {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  // Add new data to the buffer
  append(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  // Try to parse a complete message
  tryParse() {
    if (this.buffer.length === 0) return null;
    
    try {
      const result = parseRESP(this.buffer);
      if (result) {
        // Find the end of the complete message
        const consumed = this.findMessageEnd();
        if (consumed > 0) {
          // Keep the remaining data in the buffer
          this.buffer = this.buffer.slice(consumed);
          return result;
        }
      }
    } catch (err) {
      // If parsing fails, leave buffer intact
      console.error('Parse error:', err);
    }
    return null;
  }

  // Find the end of a complete message
  findMessageEnd() {
    let pos = 0;
    if (this.buffer[pos] !== 0x2A) return 0; // '*' character
    pos++;

    // Read array length
    const lengthEnd = this.buffer.indexOf('\r\n', pos);
    if (lengthEnd === -1) return 0;
    
    const length = parseInt(this.buffer.slice(pos, lengthEnd).toString(), 10);
    if (isNaN(length) || length < 0) return 0;
    pos = lengthEnd + 2;

    // Process each array element
    for (let i = 0; i < length; i++) {
      if (pos >= this.buffer.length) return 0;
      
      if (this.buffer[pos] !== 0x24) return 0; // '$' character
      pos++;

      // Read string length
      const strLengthEnd = this.buffer.indexOf('\r\n', pos);
      if (strLengthEnd === -1) return 0;
      
      const strLength = parseInt(this.buffer.slice(pos, strLengthEnd).toString(), 10);
      if (isNaN(strLength) || strLength < 0) return 0;
      pos = strLengthEnd + 2;

      // Skip string content
      if (pos + strLength + 2 > this.buffer.length) return 0;
      pos += strLength + 2; // +2 for CRLF
    }

    return pos;
  }

  // Clear the buffer
  clear() {
    this.buffer = Buffer.alloc(0);
  }
}
