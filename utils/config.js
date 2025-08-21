const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    const configPath = path.join(__dirname, '../config/default.json');
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn('Failed to load config, using defaults');
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      swf: {
        url: "https://seer.61.com/resource/appRes/update/sceneactivity/SceneActivityPanel.swf",
        downloadDir: "./swf",
        outputDir: "./output"
      },
      image: {
        quality: 75,
        maxWidth: 1024,
        formats: ["jpeg", "png"],
        saveOriginal: false
      },
      logging: {
        level: "info",
        enableColors: true
      },
      network: {
        timeout: 30000,
        retries: 3
      }
    };
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => obj[key] = obj[key] || {}, this.config);
    target[lastKey] = value;
  }
}

module.exports = new Config();
