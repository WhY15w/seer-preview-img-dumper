const fs = require("fs");
const zlib = require("zlib");
const { PNG } = require("pngjs");
const { Jimp } = require("jimp");

// 读取 RECT 区域大小
function readRectSize(buffer, offset) {
  const firstByte = buffer[offset];
  const nbits = firstByte >> 3;
  const totalBits = 5 + nbits * 4;
  return Math.ceil(totalBits / 8);
}

function getSwfHeaderSize(buffer) {
  const rectOffset = 8;
  const rectBytes = readRectSize(buffer, rectOffset);
  return 8 + rectBytes + 4;
}

// 解析 SWF 中的所有 Tag
function parseSwfTags(tagDataBuffer) {
  const tags = [];
  let pos = 0;

  while (pos + 2 <= tagDataBuffer.length) {
    const tagCodeAndLength = tagDataBuffer.readUInt16LE(pos);
    const tagType = tagCodeAndLength >> 6;
    let tagLength = tagCodeAndLength & 0x3f;
    pos += 2;

    if (tagLength === 0x3f) {
      if (pos + 4 > tagDataBuffer.length) break;
      tagLength = tagDataBuffer.readUInt32LE(pos);
      pos += 4;
    }

    if (pos + tagLength > tagDataBuffer.length) break;
    const tagBytes = tagDataBuffer.slice(pos, pos + tagLength);
    tags.push({ type: tagType, data: tagBytes });
    pos += tagLength;
  }

  return tags;
}

// 压缩JPEG图片并返回base64
async function compressJPEG(buffer, quality = 80) {
  try {
    const img = await Jimp.read(buffer);

    const jpeg = await img.resize({ w: 1024 }).getBuffer("image/jpeg", {
      quality: quality,
    });
    return jpeg.toString("base64");
  } catch (error) {
    console.error("Error compressing JPEG:", error);
    throw error;
  }
}

// 压缩PNG图片并返回base64
async function compressPNG(buffer, quality = 80) {
  try {
    const img = await Jimp.read(buffer);

    const png = await img.resize({ w: 1024 }).getBuffer("image/png", {
      quality: quality,
    });
    return png.toString("base64");
  } catch (error) {
    console.error("Error compressing PNG:", error);
    throw error;
  }
}

function parseDefineBitsJPEG3(swfTags) {
  const jpegImages = [];

  swfTags.forEach((tag) => {
    if (tag.type === 35) {
      const buf = tag.data;
      const characterId = buf.readUInt16LE(0);

      const alphaOffset = buf.readUInt32LE(2);
      const jpegStart = 6;
      const jpegEnd = jpegStart + alphaOffset;
      if (jpegEnd > buf.length) return;

      jpegImages.push({
        characterId,
        buffer: buf.slice(jpegStart, jpegEnd),
        mimeType: "image/jpeg",
      });
    }
  });

  return jpegImages;
}

function parseDefineBitsLossless2(swfTags) {
  const pngImages = [];

  swfTags.forEach((tag) => {
    if (tag.type === 36) {
      const buf = tag.data;
      const characterId = buf.readUInt16LE(0);

      const bitmapFormat = buf.readUInt8(2);
      const width = buf.readUInt16LE(3);
      const height = buf.readUInt16LE(5);
      const zlibStart = 7;

      if (bitmapFormat !== 5) {
        console.warn(
          `❌ Unsupported BitmapFormat=${bitmapFormat} for DefineBitsLossless2 id=${characterId}`
        );
        return;
      }

      const zlibData = buf.slice(zlibStart);
      let raw;
      try {
        raw = zlib.inflateSync(zlibData);
      } catch (err) {
        console.warn(
          `❌ Failed to decompress DefineBitsLossless2 for id=${characterId}:`,
          err.message
        );
        return;
      }

      const png = new PNG({ width, height });
      let offset = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (offset + 4 > raw.length) break;

          const a = raw[offset];
          const r = raw[offset + 1];
          const g = raw[offset + 2];
          const b = raw[offset + 3];
          const idx = (width * y + x) << 2;

          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = a;

          offset += 4;
        }
      }

      const pngBuffer = PNG.sync.write(png);
      pngImages.push({
        characterId,
        buffer: pngBuffer,
        mimeType: "image/png",
      });
    }
  });

  return pngImages;
}

/**
 * 支持 JPEG3 + Lossless2 的 Base64 提取和压缩
 * @param {*} swfFilePath
 * @param {*} quality
 * @returns {Promise<Array>}
 */
async function extractAndCompressImages(swfFilePath, quality = 80) {
  const swfBuffer = fs.readFileSync(swfFilePath);
  const signature = swfBuffer.slice(0, 3).toString("ascii");

  let fullBuffer;
  if (signature === "CWS") {
    const body = swfBuffer.slice(8);
    const uncompressed = zlib.inflateSync(body);
    const newHeader = Buffer.from(swfBuffer.slice(0, 8));
    newHeader[0] = "F".charCodeAt(0); // CWS -> FWS
    fullBuffer = Buffer.concat([newHeader, uncompressed]);
  } else if (signature === "FWS") {
    fullBuffer = swfBuffer;
  } else {
    throw new Error(`Unsupported SWF signature: ${signature}`);
  }

  const headerSize = getSwfHeaderSize(fullBuffer);
  const tagBuffer = fullBuffer.slice(headerSize);
  const tags = parseSwfTags(tagBuffer);

  const jpegImages = parseDefineBitsJPEG3(tags);
  const pngImages = parseDefineBitsLossless2(tags);

  const compressedImages = [];

  // 处理JPEG图片
  for (const img of jpegImages) {
    try {
      const base64 = await compressJPEG(img.buffer, quality);
      compressedImages.push({
        characterId: img.characterId,
        base64,
        mimeType: img.mimeType,
        originalSize: img.buffer.length,
        compressedSize: Buffer.from(base64, "base64").length,
      });
    } catch (err) {
      console.error(`Failed to compress JPEG image ${img.characterId}:`, err);
    }
  }

  // 处理PNG图片
  for (const img of pngImages) {
    try {
      const base64 = await compressPNG(img.buffer, quality);
      compressedImages.push({
        characterId: img.characterId,
        base64,
        mimeType: img.mimeType,
        originalSize: img.buffer.length,
        compressedSize: Buffer.from(base64, "base64").length,
      });
    } catch (err) {
      console.error(`Failed to compress PNG image ${img.characterId}:`, err);
    }
  }

  return compressedImages;
}

module.exports = {
  extractAndCompressImages,
};
