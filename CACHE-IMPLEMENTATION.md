# Image Cache Implementation

## Overview

This document describes the enhanced image caching system that provides reliable storage, retrieval, validation, and lifecycle management for cached images with robust error handling and security features.

## Features Implemented

### 1. ETag Support & Conditional Requests
- **ETag Generation**: ETags are generated from file stats (size + mtime) for efficient change detection
- **304 Not Modified**: Server responds with 304 when client's cached version is still valid
- **Conditional Headers**: Supports both `If-None-Match` (ETag) and `If-Modified-Since` headers
- **Bandwidth Savings**: Clients only download images when they've actually changed

### 2. File Validation & Integrity
- **Magic Number Validation**: Checks file headers to ensure valid image formats (PNG, JPEG, WebP, GIF)
- **Size Validation**: Rejects files smaller than 100 bytes (likely corrupted)
- **Automatic Cleanup**: Invalid/corrupted files are automatically removed
- **Atomic Writes**: Uses temp file + rename pattern to prevent partial writes

### 3. Cache Size Management
- **Configurable Limits**: Set max cache size via `MAX_CACHE_SIZE_MB` env variable (default: 1GB)
- **LRU Eviction**: Least Recently Used files are evicted first when cache is full
- **Automatic Eviction**: Triggered during cache writes when size exceeds limit
- **Smart Threshold**: Evicts to 80% of max size to avoid constant eviction cycles

### 4. Security Enhancements
- **Path Traversal Protection**: Validates filenames to prevent directory traversal attacks
- **Filename Pattern Validation**: Only accepts MD5 hash + valid extension format
- **URL Validation**: Proxy endpoint only allows TMDb image URLs
- **Input Sanitization**: All user inputs are validated before processing

### 5. Metadata Tracking
- **Access Tracking**: Records access count and last access time for each image
- **LRU Implementation**: Uses access metadata to implement efficient LRU eviction
- **Statistics**: Provides comprehensive cache statistics (size, file count, usage %)
- **JSON Storage**: Metadata stored in `.metadata/` subdirectory as JSON files

### 6. Scheduled Maintenance
- **Automatic Cleanup Job**: Runs daily at 3 AM to maintain cache health
- **Age-Based Cleanup**: Removes files older than 60 days (configurable)
- **Size Management**: Evicts files when cache exceeds size limit
- **Logging**: Comprehensive logs of all cleanup operations

### 7. HTTP Caching Headers
- **Cache-Control**: Different policies for different use cases
  - Direct cache access: `max-age=31536000, immutable` (1 year)
  - Proxied images: `max-age=2592000` (30 days)
- **Last-Modified**: Proper HTTP date formatting for browser caching
- **Content-Length**: Included for better client-side handling

## Configuration

Environment variables for customization:

```bash
# Cache directory location
IMAGE_CACHE_DIR=./data/image-cache

# Maximum cache size in megabytes
MAX_CACHE_SIZE_MB=1000

# Maximum age for cached files in days (for cleanup job)
CACHE_MAX_AGE_DAYS=60
```

## API Endpoints

### GET /api/v1/images/cache/:filename

Serves a cached image by filename with full caching support.

**Features:**
- ETag and Last-Modified headers
- 304 Not Modified responses
- Path traversal protection
- File integrity validation

**Example:**
```bash
# First request (200 OK)
curl -I http://localhost:3000/api/v1/images/cache/2f54d1d9e8326b3c27bb69e6d8e1518f.jpg

# Subsequent request with ETag (304 Not Modified)
curl -I -H "If-None-Match: \"a5373947bfb001d1323664bd8a00cff3\"" \
  http://localhost:3000/api/v1/images/cache/2f54d1d9e8326b3c27bb69e6d8e1518f.jpg
```

### GET /api/v1/images/proxy?url=...

Proxies and caches an external image URL.

**Features:**
- Downloads and caches on first request
- Returns cached version on subsequent requests
- URL validation (TMDb only)
- Automatic cache management

**Example:**
```bash
curl -I "http://localhost:3000/api/v1/images/proxy?url=https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg"
```

## Background Jobs

### cache-cleanup

**Schedule:** Daily at 3:00 AM (cron: `0 3 * * *`)

**Operations:**
1. Removes files older than `CACHE_MAX_AGE_DAYS` (default: 60 days)
2. Evicts least recently used files if cache exceeds size limit
3. Logs comprehensive statistics before and after cleanup
4. Cleans up orphaned metadata files

**Manual Trigger:**
You can manually trigger the cleanup job via the jobs API endpoint.

## File Structure

```
data/image-cache/
├── .metadata/                    # Metadata directory
│   ├── {hash}.jpg.json          # Access tracking for each image
│   └── ...
├── {hash}.jpg                    # Cached image files
├── {hash}.png
└── ...
```

### Metadata Format

```json
{
  "url": "https://image.tmdb.org/t/p/w500/example.jpg",
  "cachedAt": "2026-01-14T22:09:20.123Z",
  "lastAccess": "2026-01-14T22:15:30.456Z",
  "accessCount": 5,
  "size": 83689
}
```

## Testing

Run the included test script to verify the implementation:

```bash
node test-cache.js
```

This will test:
- Filename validation
- Image caching and retrieval
- ETag generation
- Cache statistics
- Cache reuse

## Performance Improvements

### Before
- No browser caching (full download every time)
- No file validation (corrupted files served)
- No cache size limits (could fill disk)
- No automatic cleanup
- Path traversal vulnerabilities

### After
- 304 responses save bandwidth (ETag/Last-Modified)
- Corrupted files detected and removed automatically
- LRU eviction prevents disk space issues
- Daily maintenance keeps cache healthy
- Secure filename validation prevents attacks

## Error Handling

### File Validation Failures
- Corrupted files are automatically removed
- Client receives 404 (will trigger re-download)
- Logged for monitoring

### Download Failures
- Network errors return 502 Bad Gateway
- Errors logged with URL for debugging
- Temporary failures don't affect existing cache

### Cache Size Exceeded
- Automatic LRU eviction frees space
- Operations continue seamlessly
- Logs show which files were evicted

### Invalid Requests
- Path traversal attempts return 400 Bad Request
- Invalid URLs return 400 Bad Request
- All attempts are logged for security monitoring

## Monitoring

### Cache Statistics

Get real-time cache statistics:

```javascript
import { getCacheStats } from './src/utils/image-cache.js';

const stats = await getCacheStats();
console.log(stats);
// {
//   totalFiles: 150,
//   totalSize: 52428800,
//   totalSizeMB: "50.00",
//   maxSizeMB: 1000,
//   usagePercent: "5.00",
//   oldestFile: { ... },
//   newestFile: { ... }
// }
```

### Logs to Monitor

- Cache cleanup job executions (daily at 3 AM)
- File validation failures
- Eviction operations
- Invalid filename attempts (security)
- Download failures

## Migration Notes

### Backward Compatibility

The implementation is fully backward compatible:
- Existing cached images continue to work
- Metadata is created on first access if missing
- No changes required to existing code using the cache

### Recommended Actions

1. **Set Environment Variables**: Configure cache limits for your environment
2. **Monitor Initial Cleanup**: First cleanup job may remove many old files
3. **Review Logs**: Check for any validation failures on existing cache
4. **Test Endpoints**: Verify conditional requests work with your clients

## Future Enhancements

Possible future improvements:
- Content-based ETags (hash of file content) for better cache validation
- Compression support (serve WebP for supporting clients)
- Pre-warming cache for popular images
- Distributed caching across multiple servers
- Image transformation caching (resize, crop, etc.)
