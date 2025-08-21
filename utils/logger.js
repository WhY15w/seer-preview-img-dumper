const chalk = require('chalk');

class Logger {
  constructor(enableColors = true) {
    this.enableColors = enableColors;
  }

  info(message, ...args) {
    const prefix = this.enableColors ? chalk.blue('ℹ') : '[INFO]';
    console.log(`${prefix} ${message}`, ...args);
  }

  success(message, ...args) {
    const prefix = this.enableColors ? chalk.green('✅') : '[SUCCESS]';
    console.log(`${prefix} ${message}`, ...args);
  }

  warn(message, ...args) {
    const prefix = this.enableColors ? chalk.yellow('⚠') : '[WARN]';
    console.warn(`${prefix} ${message}`, ...args);
  }

  error(message, ...args) {
    const prefix = this.enableColors ? chalk.red('❌') : '[ERROR]';
    console.error(`${prefix} ${message}`, ...args);
  }

  debug(message, ...args) {
    const prefix = this.enableColors ? chalk.gray('🔍') : '[DEBUG]';
    console.log(`${prefix} ${message}`, ...args);
  }
}

module.exports = new Logger();
