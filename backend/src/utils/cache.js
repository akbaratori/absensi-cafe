/**
 * Simple in-memory cache implementation
 * For production, consider using Redis or similar
 */
class Cache {
  constructor(defaultTTL = 300) { // Default 5 minutes
    this.cache = new Map();
    this.defaultTTL = defaultTTL * 1000; // Convert to milliseconds
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  set(key, value, ttl = null) {
    const expiry = ttl ? ttl * 1000 : this.defaultTTL;
    this.cache.set(key, {
      value,
      expiry: Date.now() + expiry,
    });
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Delete a specific key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern to match (e.g., "user:*")
   */
  deletePattern(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Create cache instances for different data types
const configCache = new Cache(600); // 10 minutes for config
const userDataCache = new Cache(300); // 5 minutes for user data
const scheduleCache = new Cache(180); // 3 minutes for schedules

// Cleanup expired entries every 5 minutes
setInterval(() => {
  configCache.cleanup();
  userDataCache.cleanup();
  scheduleCache.cleanup();
}, 5 * 60 * 1000);

module.exports = {
  configCache,
  userDataCache,
  scheduleCache,
};
