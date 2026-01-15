/**
 * Simple test script to verify cache implementation
 */

import {
  cacheImage,
  getCachedImageWithStats,
  validateFilename,
  getCacheStats,
  evictOldFiles,
  clearOldCache
} from './src/utils/image-cache.js';

async function runTests() {
  console.log('🧪 Testing Image Cache Implementation\n');

  // Test 1: Filename validation
  console.log('Test 1: Filename Validation');
  console.log('✓ Valid filename:', validateFilename('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.jpg'));
  console.log('✗ Invalid (path traversal):', validateFilename('../../../etc/passwd'));
  console.log('✗ Invalid (no extension):', validateFilename('somefile'));
  console.log('✗ Invalid (wrong pattern):', validateFilename('notahash.jpg'));
  console.log('');

  // Test 2: Cache a test image from TMDb
  console.log('Test 2: Caching an Image');
  const testUrl = 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg';
  console.log(`Caching: ${testUrl}`);

  const filename = await cacheImage(testUrl);
  if (filename) {
    console.log(`✓ Cached successfully: ${filename}`);
  } else {
    console.log('✗ Failed to cache image');
  }
  console.log('');

  // Test 3: Get cached image with stats
  if (filename) {
    console.log('Test 3: Retrieving Cached Image with Stats');
    const imageData = await getCachedImageWithStats(filename);
    if (imageData) {
      console.log(`✓ Retrieved successfully`);
      console.log(`  - Size: ${(imageData.buffer.length / 1024).toFixed(2)}KB`);
      console.log(`  - ETag: ${imageData.etag}`);
      console.log(`  - Last-Modified: ${imageData.lastModified}`);
    } else {
      console.log('✗ Failed to retrieve image');
    }
    console.log('');
  }

  // Test 4: Get cache statistics
  console.log('Test 4: Cache Statistics');
  const stats = await getCacheStats();
  if (stats) {
    console.log(`✓ Cache Stats:`);
    console.log(`  - Total Files: ${stats.totalFiles}`);
    console.log(`  - Total Size: ${stats.totalSizeMB}MB`);
    console.log(`  - Max Size: ${stats.maxSizeMB}MB`);
    console.log(`  - Usage: ${stats.usagePercent}%`);
  } else {
    console.log('✗ Failed to get cache stats');
  }
  console.log('');

  // Test 5: Test cache again (should reuse)
  console.log('Test 5: Re-caching Same Image (should reuse)');
  const filename2 = await cacheImage(testUrl);
  if (filename2 === filename) {
    console.log(`✓ Correctly reused cached image: ${filename2}`);
  } else {
    console.log('✗ Failed to reuse cached image');
  }
  console.log('');

  console.log('✅ All tests completed!\n');
  console.log('To test the HTTP endpoints, start the server and try:');
  console.log(`  - GET /api/v1/images/cache/${filename}`);
  console.log(`  - GET /api/v1/images/proxy?url=${encodeURIComponent(testUrl)}`);
  console.log('');
  console.log('Try with curl to see cache headers:');
  console.log(`  curl -I http://localhost:3000/api/v1/images/cache/${filename}`);
}

runTests().catch(console.error);
