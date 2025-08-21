const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs').promises;
const path = require('path');
const ora = require('ora');

const getSeerPreviewImgInfo = require("./utils/getImgInfo");
const logger = require('./utils/logger');
const config = require('./utils/config');

// 命令行参数配置
const argv = yargs(hideBin(process.argv))
  .option('quality', {
    alias: 'q',
    type: 'number',
    description: '图片压缩质量 (1-100)',
    default: config.get('image.quality')
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: '输出目录',
    default: config.get('swf.outputDir')
  })
  .option('width', {
    alias: 'w',
    type: 'number',
    description: '最大图片宽度',
    default: config.get('image.maxWidth')
  })
  .option('save-original', {
    type: 'boolean',
    description: '保存原始图片',
    default: config.get('image.saveOriginal')
  })
  .option('download-only', {
    type: 'boolean',
    description: '仅下载SWF文件',
    default: false
  })
  .option('extract', {
    type: 'boolean',
    description: '从已有SWF文件提取图片',
    default: false
  })
  .option('dev', {
    type: 'boolean',
    description: '开发模式',
    default: false
  })
  .help()
  .argv;

async function saveImages(images, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  
  const savedFiles = [];
  for (const img of images) {
    const extension = img.mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const fileName = `image_${img.characterId}.${extension}`;
    const filePath = path.join(outputDir, fileName);
    
    try {
      const buffer = Buffer.from(img.base64, 'base64');
      await fs.writeFile(filePath, buffer);
      savedFiles.push({
        fileName,
        filePath,
        characterId: img.characterId,
        originalSize: img.originalSize,
        compressedSize: img.compressedSize,
        compressionRatio: ((1 - img.compressedSize / img.originalSize) * 100).toFixed(1)
      });
      
      logger.success(`保存图片: ${fileName} (压缩率: ${savedFiles[savedFiles.length - 1].compressionRatio}%)`);
    } catch (error) {
      logger.error(`保存图片失败: ${fileName}`, error.message);
    }
  }
  
  return savedFiles;
}

async function generateReport(savedFiles, outputDir) {
  const reportPath = path.join(outputDir, 'extraction_report.json');
  const report = {
    timestamp: new Date().toISOString(),
    totalImages: savedFiles.length,
    totalOriginalSize: savedFiles.reduce((sum, file) => sum + file.originalSize, 0),
    totalCompressedSize: savedFiles.reduce((sum, file) => sum + file.compressedSize, 0),
    averageCompressionRatio: savedFiles.length > 0 
      ? (savedFiles.reduce((sum, file) => sum + parseFloat(file.compressionRatio), 0) / savedFiles.length).toFixed(1)
      : 0,
    files: savedFiles
  };
  
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  logger.info(`生成报告: ${reportPath}`);
  return report;
}

async function main() {
  try {
    logger.info('🚀 启动 Seer SWF JPEG3 Dumper');
    
    if (argv.dev) {
      logger.debug('开发模式已启用');
      logger.debug('命令行参数:', argv);
    }

    const spinner = ora('正在处理SWF文件...').start();
    
    // 更新配置
    config.set('image.quality', argv.quality);
    config.set('image.maxWidth', argv.width);
    config.set('image.saveOriginal', argv.saveOriginal);
    
    try {
      const base64Images = await getSeerPreviewImgInfo();
      spinner.succeed(`成功提取 ${base64Images.length} 张图片`);
      
      if (base64Images.length === 0) {
        logger.warn('未找到可提取的图片');
        return;
      }

      if (!argv.downloadOnly) {
        logger.info(`开始保存图片到: ${argv.output}`);
        const savedFiles = await saveImages(base64Images, argv.output);
        
        const report = await generateReport(savedFiles, argv.output);
        
        logger.success(`✨ 处理完成!`);
        logger.info(`📊 总计: ${report.totalImages} 张图片`);
        logger.info(`💾 原始大小: ${(report.totalOriginalSize / 1024).toFixed(1)} KB`);
        logger.info(`🗜️  压缩后: ${(report.totalCompressedSize / 1024).toFixed(1)} KB`);
        logger.info(`📈 平均压缩率: ${report.averageCompressionRatio}%`);
      }
      
    } catch (error) {
      spinner.fail('处理失败');
      throw error;
    }
    
  } catch (error) {
    logger.error('程序执行失败:', error.message);
    if (argv.dev) {
      console.error(error);
    }
    process.exit(1);
  }
}

// 只有直接运行时才执行main函数
if (require.main === module) {
  main();
}

module.exports = { main, saveImages, generateReport };
