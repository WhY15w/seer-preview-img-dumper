const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const zlib = require("zlib");

const { extractAndCompressImages } = require("./extractImg");
const logger = require("./logger");
const config = require("./config");

// 判断是否是压缩的 SWF（以 CWS 开头）
function isCompressedSwf(buffer) {
  return buffer.slice(0, 3).toString() === "CWS";
}

// 解压 SWF 文件（仅处理 CWS -> FWS）
async function decompressSwf(inputPath, outputPath) {
  const rawBuffer = await fs.readFile(inputPath);

  if (!isCompressedSwf(rawBuffer)) {
    logger.info("SWF文件未压缩，跳过解压步骤");
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  logger.info("检测到压缩的SWF文件，正在解压...");
  const header = rawBuffer.slice(0, 8);
  const compressedBody = rawBuffer.slice(8);

  const decompressedBody = zlib.unzipSync(compressedBody);

  const newHeader = Buffer.from(header);
  newHeader[0] = "F".charCodeAt(0);

  const finalBuffer = Buffer.concat([newHeader, decompressedBody]);
  await fs.writeFile(outputPath, finalBuffer);
  logger.success("SWF文件解压完成");
  return outputPath;
}

async function downloadSwfWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`正在下载SWF文件... (尝试 ${attempt}/${maxRetries})`);

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: config.get("network.timeout"),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      logger.success(
        `下载完成 (${(response.data.length / 1024).toFixed(1)} KB)`
      );
      return response.data;
    } catch (error) {
      logger.warn(`下载失败 (尝试 ${attempt}/${maxRetries}): ${error.message}`);

      if (attempt === maxRetries) {
        throw new Error(`下载失败，已重试 ${maxRetries} 次: ${error.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function getSeerPreviewImgInfo() {
  try {
    const swfUrl = `${config.get("swf.url")}?t=${Date.now()}`;

    const swfData = await downloadSwfWithRetry(
      swfUrl,
      config.get("network.retries")
    );

    const swfFileName = "SceneActivityPanel.swf";
    const downloadDir = path.resolve(config.get("swf.downloadDir"));
    const originalFilePath = path.join(downloadDir, swfFileName);
    const decompressedFilePath = path.join(
      downloadDir,
      "SceneActivityPanel-decompressed.swf"
    );

    await fs.mkdir(downloadDir, { recursive: true });
    await fs.writeFile(originalFilePath, swfData);
    logger.success(`SWF文件已保存: ${originalFilePath}`);

    await decompressSwf(originalFilePath, decompressedFilePath);

    logger.info("开始提取图片...");
    const base64Images = await extractAndCompressImages(
      decompressedFilePath,
      config.get("image.quality")
    );

    logger.success(`成功提取 ${base64Images.length} 张图片`);
    return base64Images;
  } catch (error) {
    logger.error("获取图片信息失败:", error.message);
    throw error;
  }
}

module.exports = getSeerPreviewImgInfo;
