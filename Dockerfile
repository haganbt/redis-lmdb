# Build stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN test -f package.json && npm install || (echo "package.json not found" && exit 1)

# Copy source code
COPY . .

# Build stage (if needed in the future)
# RUN npm run build

# Production stage
FROM node:20-slim

# Install required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -r -s /bin/false nodeuser

# Set system limits for memory mapping
RUN echo "nodeuser soft nofile 65535" >> /etc/security/limits.conf \
    && echo "nodeuser hard nofile 65535" >> /etc/security/limits.conf \
    && echo "vm.max_map_count=262144" >> /etc/sysctl.conf \
    && echo "vm.swappiness=10" >> /etc/sysctl.conf

# Set working directory
WORKDIR /app

# Create database directory
RUN mkdir -p /data/db && chown -R nodeuser:nodeuser /data

# Copy package files and install production dependencies
COPY package*.json ./
RUN test -f package.json && npm install --only=production || (echo "package.json not found" && exit 1)

# Copy built files from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/tests ./tests

# Set ownership to non-root user
RUN chown -R nodeuser:nodeuser /app

# Switch to non-root user
USER nodeuser

# Expose the default Redis port
EXPOSE 6379

# Set environment variables
ENV NODE_ENV=production
ENV LMDB_MAP_SIZE=10737418240
ENV LMDB_PATH=/data/db

# Command to run the application with increased memory limit
CMD ["node", "--max-old-space-size=4096", "src/server.js"] 