const prisma = require('../utils/database');

class ConfigRepository {
  /**
   * Get all config values
   */
  async getAll() {
    const configs = await prisma.systemConfig.findMany();

    const configMap = {};
    configs.forEach((c) => {
      configMap[c.key] = c.value;
    });

    return configMap;
  }

  /**
   * Get single config value
   */
  async get(key) {
    const config = await prisma.systemConfig.findUnique({
      where: { key },
    });

    return config ? config.value : null;
  }

  /**
   * Set config value
   */
  async set(key, value, description = null) {
    return await prisma.systemConfig.upsert({
      where: { key },
      create: {
        key,
        value,
        description,
      },
      update: {
        value,
        ...(description && { description }),
      },
    });
  }

  /**
   * Set multiple config values
   */
  async setMany(configs) {
    const operations = Object.entries(configs).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    );

    await prisma.$transaction(operations);
  }

  /**
   * Delete config
   */
  async delete(key) {
    await prisma.systemConfig.delete({
      where: { key },
    });
  }
}

module.exports = new ConfigRepository();
