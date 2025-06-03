/**
 * extract_jpeg3.js
 *
 * 用途：读取一个 .swf 文件，解析出其中所有 DefineBitsJPEG3 (TagType = 35) 标签，
 *       并将其内嵌的 JPEG 二进制数据导出为 .jpg 文件。
 *
 * 使用方法：
 *   1. 将此脚本 extract_jpeg3.js 与你的 SWF 文件放在同一目录（或修改 swfFilePath 为绝对/相对路径）。
 *   2. 运行： node extract_jpeg3.js
 *   3. 输出目录默认为 ./output_jpeg3/，若目录不存在会自动创建，导出的文件名形如 image_<CharacterID>.jpg
 *
 * 说明：
 *   - 支持 FWS（未压缩）和 CWS（zlib 压缩）的 SWF。
 *   - 暂不处理 ZWS（LZMA 压缩）或其它稀有压缩方式。
 *   - 仅导出 JPEG3 的主要图像部分（不包含 alpha 通道）。若需要同时导出 alpha，请自行在 alphaOffset 之后提取并合并。
 */

const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

// 读取 RECT 结构：SWF 中的 FrameSize 用一个可变长度的 bit 字段表示，首先
// 取出第一个字节的前 5 bits 作为 nbits，然后总共占用 (5 + 4 * nbits) 位。
function readRectSize(buffer, offset) {
  // buffer[offset] 的高 5 位是 nbits
  const firstByte = buffer[offset];
  const nbits = firstByte >> 3; // 0xF8 >> 3 = 0x1F (5 位)
  const totalBits = 5 + nbits * 4; // RECT 总位数
  const totalBytes = Math.ceil(totalBits / 8);
  return totalBytes;
}

function getSwfHeaderSize(buffer) {
  // SWF header: 8 字节 (Signature + Version + FileLength)
  // 紧接着是 FrameSize (RECT，可变长度)，然后两个 UI16（FrameRate，FrameCount）
  const rectOffset = 8;
  const rectBytes = readRectSize(buffer, rectOffset);
  // RECT 占 rectBytes 字节，之后有 FrameRate (UI16=2B) + FrameCount (UI16=2B)
  return 8 + rectBytes + 2 + 2;
}

// 解析 SWF 中所有 Tag
function parseSwfTags(tagDataBuffer) {
  const tags = [];
  let pos = 0;

  while (pos + 2 <= tagDataBuffer.length) {
    // 读取 16-bit header：高 10 位是 tagType，低 6 位是 tagLength（若等于 0x3F 则再读取 32-bit 真正长度）
    const tagCodeAndLength = tagDataBuffer.readUInt16LE(pos);
    const tagType = tagCodeAndLength >> 6;
    let tagLength = tagCodeAndLength & 0x3f;
    pos += 2;

    if (tagLength === 0x3f) {
      // 如果低 6 位全为 1，则接下来的 4 字节才是真正的长度
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

// 主函数：解压（若必要）并导出所有 DefineBitsJPEG3 标签中的 JPEG 数据
function extractDefineBitsJPEG3(swfFilePath, outputDir = "output_jpeg3") {
  // 1. 读取 SWF 文件头部，判断是否压缩
  const fd = fs.openSync(swfFilePath, "r");
  const header = Buffer.alloc(8);
  fs.readSync(fd, header, 0, 8, 0);
  const signature = header.slice(0, 3).toString("ascii");

  let fullSwfBuffer;
  if (signature === "CWS") {
    // CWS 表示从 offset=8 开始是 zlib 压缩过的数据
    const compressedBody = fs.readFileSync(swfFilePath).slice(8);
    // zlib.inflateSync 直接解压 zlib 格式流
    const decompressedBody = zlib.inflateSync(compressedBody);
    // 把前 8 字节的 header + 解压后的 body 合并
    fullSwfBuffer = Buffer.concat([header, decompressedBody]);
  } else if (signature === "FWS") {
    // FWS 无压缩，直接把整个文件读入
    fullSwfBuffer = fs.readFileSync(swfFilePath);
  } else {
    throw new Error(`暂不支持的 SWF 签名：${signature} (只支持 FWS/CWS)`);
  }
  fs.closeSync(fd);

  // 2. 计算 SWF header 的总字节数，后面才是 Tag 数据
  const headerSize = getSwfHeaderSize(fullSwfBuffer);
  const tagDataBuffer = fullSwfBuffer.slice(headerSize);

  // 3. 逐个解析所有 Tag
  const tags = parseSwfTags(tagDataBuffer);

  // 4. 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 5. 遍历 Tag 列表，找 type === 35 的 DefineBitsJPEG3
  let count = 0;
  tags.forEach((tag) => {
    if (tag.type === 35) {
      // DefineBitsJPEG3
      const buf = tag.data;
      // buf[0..1]   = CharacterID (UI16 LE)
      // buf[2..5]   = AlphaOffset (UI32 LE) —— 从 buf index=6 开始，到 (6+AlphaOffset) 是纯 JPEG 二进制
      // buf[6..6+AlphaOffset-1] 是 JPEG 数据；剩下的是 alpha 通道字节（我们这里只导出 JPEG 部分）
      const characterId = buf.readUInt16LE(0);
      const alphaOffset = buf.readUInt32LE(2);
      const jpegStart = 6;
      const jpegEnd = jpegStart + alphaOffset; // 不包含 alpha 通道位

      if (jpegEnd > buf.length) {
        console.warn(`⚠️ Tag (type=35, id=${characterId}) 报文长度异常，跳过`);
        return;
      }

      const jpegData = buf.slice(jpegStart, jpegEnd);
      const outputPath = path.join(outputDir, `image_${characterId}.jpg`);
      fs.writeFileSync(outputPath, jpegData);
      console.log(`✅ 导出 DefineBitsJPEG3 id=${characterId} -> ${outputPath}`);
      count++;
    }
  });

  if (count === 0) {
    console.log("⚠️ 未在 SWF 中发现任何 DefineBitsJPEG3 (tagType=35) 标签。");
  } else {
    console.log(`\n✅ 共导出 ${count} 个 DefineBitsJPEG3 图像。`);
  }
}

const swfFilePath = path.join(__dirname, "SceneActivityPanel.swf");

try {
  extractDefineBitsJPEG3(swfFilePath);
} catch (err) {
  console.error("❌ 导出过程中出现错误：", err);
  process.exit(1);
}
