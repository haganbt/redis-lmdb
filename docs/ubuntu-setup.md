# Ubuntu EC2 Setup Guide for Redis-LMDB

This document outlines the complete setup process for running Redis-LMDB on an Ubuntu EC2 instance with Docker, including automatic startup and database persistence on an NVMe volume.

## Prerequisites

- Ubuntu EC2 instance (tested on Ubuntu 22.04 LTS)
- EC2 instance with at least 2GB RAM
- NVMe volume mounted at `/mnt/db`
- SSH access to the EC2 instance

## Step 1: Install Docker

```bash
# Update package lists
sudo apt-get update

# Install required packages
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add Docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Update package lists again
sudo apt-get update

# Install Docker
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Add your user to the docker group to run Docker without sudo
sudo usermod -aG docker $USER

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

After adding your user to the docker group, you need to apply the changes without logging out:

```bash
# Apply group changes without logging out
newgrp docker
```

## Step 2: Configure Database Directory

Set up the NVMe volume directory with the correct permissions:

```bash
# Create the database directory if it doesn't exist
sudo mkdir -p /mnt/db

# Set ownership to user ID 1000 (matches the container user)
sudo chown -R 1000:1000 /mnt/db

# Set appropriate permissions
sudo chmod 755 /mnt/db
```

## Step 3: Create Startup Script

Create a script to pull the latest image and start Redis-LMDB:

```bash
# Create a directory for the startup script
mkdir -p ~/redis-lmdb

# Create the startup script
cat > ~/redis-lmdb/start-redis-lmdb.sh << 'EOF'
#!/bin/bash

# Pull the latest image from GHCR
docker pull ghcr.io/haganbt/redis-lmdb:main

# Stop any running container
docker stop redis-lmdb || true
docker rm redis-lmdb || true

# Start the container
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
```

## Step 4: Create Systemd Service for Automatic Startup

Create a systemd service to run the startup script when the instance boots:

```bash
# Create the systemd service file
echo '[Unit]
Description=Redis-LMDB Database Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/ubuntu/redis-lmdb/start-redis-lmdb.sh
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target' | sudo tee /etc/systemd/system/redis-lmdb.service

# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable redis-lmdb.service

# Start the service now
sudo systemctl start redis-lmdb.service
```

Note: Replace `ubuntu` with your EC2 instance's username if it's different.

## Step 5: Verify the Setup

After completing the above steps, verify that everything is working correctly:

```bash
# Check if Docker is running
sudo systemctl status docker

# Check if the Redis-LMDB service is enabled and running
sudo systemctl status redis-lmdb

# Check if the container is running
docker ps

# Install Redis CLI tools on the host system (optional, but recommended for debugging)
sudo apt-get update
sudo apt-get install -y redis-tools

# Test the Redis connection using redis-cli
redis-cli -h localhost ping

# Alternative: Test using Node.js from within the container
docker exec redis-lmdb node -e "
const Redis = require('ioredis');
const redis = new Redis();
redis.ping().then(() => {
  console.log('Successfully connected to Redis');
  process.exit(0);
}).catch(err => {
  console.error('Failed to connect to Redis:', err);
  process.exit(1);
});"
```

## Performance Tuning

For optimal performance with LMDB, the following system settings are recommended:

```bash
# Add to /etc/sysctl.conf
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf

# Apply changes
sudo sysctl -p
```

## Monitoring and Maintenance

### Check Container Status

```bash
# Check container status
docker ps

# Check container logs
docker logs redis-lmdb

# Check container resource usage
docker stats redis-lmdb
```

### Database Backup

Create a backup script to regularly backup your database:

```bash
# Create backup directory
sudo mkdir -p /mnt/db/backups

# Create backup script
cat > ~/redis-lmdb/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/mnt/db/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/redis_lmdb_data_backup_$DATE.tar.gz"

# Create backup
sudo tar -czf $BACKUP_FILE /mnt/db/data

# Keep only the last 5 backups
cd $BACKUP_DIR
ls -t | tail -n +6 | xargs -r rm
EOF

# Make the script executable
chmod +x ~/redis-lmdb/backup-db.sh

# Add to crontab to run daily at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * /home/ubuntu/redis-lmdb/backup-db.sh") | crontab -
```

### Updating Redis-LMDB

To update Redis-LMDB to the latest version:

```bash
# Restart the service (will pull the latest image)
sudo systemctl restart redis-lmdb.service
```

## Useful Redis CLI Commands

After installing the Redis CLI tools, you can use these commands to monitor and debug your Redis instance:

```bash
# Basic Connection Test
redis-cli -h localhost ping  # Should return PONG

# Real-time Monitoring
redis-cli -h localhost monitor  # Watch all commands in real-time

# Server Information
redis-cli -h localhost info  # Get comprehensive server information
redis-cli -h localhost info server  # Get server-specific information
redis-cli -h localhost info clients  # Get client connection information
redis-cli -h localhost info memory  # Get memory usage statistics
redis-cli -h localhost info stats  # Get general statistics
redis-cli -h localhost info replication  # Get replication information

# Memory Management
redis-cli -h localhost info memory  # Check memory usage
redis-cli -h localhost memory doctor  # Get memory health report
redis-cli -h localhost memory stats  # Get detailed memory statistics

# Key Management
redis-cli -h localhost keys *  # List all keys (use with caution in production)
redis-cli -h localhost dbsize  # Get total number of keys
redis-cli -h localhost scan 0  # Iterate over keys safely

# Performance Monitoring
redis-cli -h localhost info commandstats  # Get command statistics
redis-cli -h localhost info cpu  # Get CPU usage statistics
redis-cli -h localhost info persistence  # Get persistence statistics

# Client Management
redis-cli -h localhost client list  # List all client connections
redis-cli -h localhost client info  # Get detailed client information
```

### Tips for Using Redis CLI

1. **Safe Key Inspection**: Instead of using `KEYS *` which can be slow on large datasets, use `SCAN`:
   ```bash
   redis-cli -h localhost scan 0 count 100
   ```

2. **Memory Monitoring**: For regular memory monitoring, you can create a simple script:
   ```bash
   #!/bin/bash
   while true; do
     redis-cli -h localhost info memory | grep used_memory_human
     sleep 60
   done
   ```

3. **Connection Testing**: Create a simple health check script:
   ```bash
   #!/bin/bash
   if redis-cli -h localhost ping | grep -q PONG; then
     echo "Redis is healthy"
   else
     echo "Redis connection failed"
   fi
   ```

4. **Performance Analysis**: Monitor command execution times:
   ```bash
   redis-cli -h localhost --raw info commandstats | sort -t: -k2 -nr
   ```

Remember to use these commands carefully in a production environment, as some commands (like `KEYS *`) can be resource-intensive on large datasets.

## Troubleshooting

### Permission Issues

If you encounter permission issues with the database directory:

```bash
# Reset permissions
sudo chown -R 1000:1000 /mnt/db
sudo chmod 755 /mnt/db
```

### Container Not Starting

If the container fails to start:

```bash
# Check container logs
docker logs redis-lmdb

# Check system logs
sudo journalctl -u redis-lmdb.service
```

### Memory Issues

If you encounter memory-related issues:

```bash
# Check available memory
free -h

# Adjust container memory limits if needed
docker update --memory=3g --memory-reservation=1.5g redis-lmdb
```

## Security Considerations

1. **EC2 Security Group**: Configure your EC2 security group to allow inbound traffic on port 6379 only from trusted IP addresses.

2. **Docker Security**: Keep Docker and the Redis-LMDB image updated to the latest versions to benefit from security patches.

3. **Database Access**: Consider implementing authentication for Redis connections if exposing the service to the internet.

## Conclusion

This setup provides a robust, performant, and automatically starting Redis-LMDB instance on an Ubuntu EC2 instance. The database is stored on an NVMe volume for optimal performance, and the system is configured to automatically start on boot. 