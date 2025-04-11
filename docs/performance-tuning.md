# Performance Tuning Guide

This document outlines the performance tuning settings for Redis-LMDB, particularly focusing on LMDB memory mapping and system configurations.

## LMDB Memory Mapping

LMDB uses memory-mapped files for high-performance data access. The following settings are crucial for optimal performance:

### Map Size (`LMDB_MAP_SIZE`)
- **Current Setting**: 10GB (10737418240 bytes)
- **Purpose**: Defines the maximum size of the memory-mapped file
- **Considerations**: 
  - Should be larger than your expected database size
  - Can be larger than available RAM (will use virtual memory)
  - Setting it too small can cause write failures
  - Setting it too large wastes virtual address space

## Node.js Memory Settings

Node.js has its own memory limits that need to be configured for optimal performance with large datasets:

### Heap Size (`--max-old-space-size`)
- **Current Setting**: 4GB (4096MB)
- **Purpose**: Controls the maximum size of the V8 JavaScript heap
- **Configuration Options**:
  - Via Docker: `-e NODE_OPTIONS="--max-old-space-size=4096"`
  - In Dockerfile: `CMD ["node", "--max-old-space-size=4096", "src/server.js"]`
- **Considerations**:
  - Should be balanced with container memory limits
  - Too small can cause "JavaScript heap out of memory" errors
  - Too large may waste system resources

### System Limits

#### File Descriptors (`nofile`)
- **Current Setting**: 65535 (both soft and hard limits)
- **Purpose**: Maximum number of open file descriptors
- **Impact**: Affects the number of concurrent operations
- **Ubuntu Configuration**:
  ```bash
  # Add to /etc/security/limits.conf
  * soft nofile 65535
  * hard nofile 65535
  ```

#### Memory Mapping (`vm.max_map_count`)
- **Current Setting**: 262144
- **Purpose**: Maximum number of memory map areas a process may have
- **Impact**: Critical for LMDB's performance
- **Ubuntu Configuration**:
  ```bash
  # Add to /etc/sysctl.conf
  vm.max_map_count=262144
  # Apply changes
  sudo sysctl -p
  ```

#### Swappiness (`vm.swappiness`)
- **Current Setting**: 10
- **Purpose**: Controls how aggressively the kernel swaps out memory
- **Impact**: Lower values keep more data in RAM
- **Ubuntu Configuration**:
  ```bash
  # Add to /etc/sysctl.conf
  vm.swappiness=10
  # Apply changes
  sudo sysctl -p
  ```

## Docker Configuration

When running Redis-LMDB inside Docker containers, the following settings are important:

### Memory Limits
- **Maximum Memory**: 4GB (--memory=4g)
- **Memory Reservation**: 2GB (--memory-reservation=2g)
- **Purpose**: Prevents the container from consuming excessive memory resources
- **Considerations**:
  - Should be sufficient for Node.js heap + LMDB memory-mapped files
  - Too restrictive can cause performance issues or crashes
  - Recommended setting depends on your data size and workload

### Volume Configuration
- Uses named volume `redis_lmdb_data` for persistence
- Data is stored in `/app/data` within the container

## EC2 Deployment Considerations

When deploying to EC2, consider the following:

1. **Instance Type Selection**:
   - Minimum 2GB RAM
   - Consider using instance types with local NVMe storage
   - Recommended: t3.medium or larger

2. **Storage Options**:
   - Use gp3 or io1/io2 EBS volumes for better performance
   - Consider using instance store volumes if available
   - Enable EBS optimization

3. **Monitoring**:
   - Monitor memory usage and swap usage
   - Watch for file descriptor limits
   - Track LMDB map size usage

## Applying Settings on Ubuntu

To apply these settings on a fresh Ubuntu installation:

```bash
# Update system limits
sudo sysctl -w vm.max_map_count=262144
sudo sysctl -w vm.swappiness=10

# Make changes permanent
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Update file descriptor limits
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf
```

## Testing Performance

When testing with data sizes exceeding RAM:

1. Monitor system metrics:
   ```bash
   # Watch memory usage
   watch -n 1 free -m
   
   # Monitor swap usage
   watch -n 1 swapon --show
   
   # Check file descriptor usage
   watch -n 1 'ls /proc/$(pgrep node)/fd | wc -l'
   ```

2. Expected behavior:
   - Initial performance will be optimal when data fits in RAM
   - As data grows beyond RAM, performance will degrade gradually
   - Swap usage will increase as needed
   - File descriptor count should remain stable

3. Performance considerations:
   - SSD storage is crucial for swap performance
   - Consider using zswap for better swap performance
   - Monitor disk I/O during operations 

## Edit the startup script
cat > ~/redis-lmdb/start-redis-lmdb.sh << 'EOF'
#!/bin/bash

# Pull the latest image from GHCR
docker pull ghcr.io/haganbt/redis-lmdb:main

# Stop any running container
docker stop redis-lmdb || true
docker rm redis-lmdb || true

# Start the container with performance settings
docker run -d \
  --name redis-lmdb \
  --restart unless-stopped \
  -p 6379:6379 \
  -v /mnt/db:/data/db \
  -e LMDB_MAP_SIZE=10737418240 \
  -e NODE_ENV=production \
  -e LMDB_PATH=/data/db \
  -e NODE_OPTIONS="--max-old-space-size=4096" \
  --ulimit nofile=65535:65535 \
  --memory=4g \
  --memory-reservation=2g \
  --user 1000:1000 \
  ghcr.io/haganbt/redis-lmdb:main
EOF

# Make the script executable
chmod +x ~/redis-lmdb/start-redis-lmdb.sh 