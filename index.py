import struct
import zlib
from pathlib import Path


# 工具函数：解析 SWF Header、RECT 结构，定位到第一个 Tag
def read_rect_size(data, offset):
    """
    SWF 中的 RECT 结构开头 5 bit 表示 nbits，后面是 4*n bits 数据，
    总共（5 + 4*nbits）位，用于表示画面尺寸。此函数计算 RECT 所占字节数。
    """
    b0 = data[offset]
    nbits = b0 >> 3  # 高 5 位
    total_bits = 5 + nbits * 4
    total_bytes = (total_bits + 7) // 8
    return total_bytes


def get_swf_header_size(data):
    """
    计算 SWF 头部（Signature/Version/FileLength/FrameSize/FrameRate/FrameCount）的总字节数，
    从而跳过这些头部，才能开始读取 tags。
    """
    # RECT 从偏移 8 开始
    rect_offset = 8
    rect_bytes = read_rect_size(data, rect_offset)
    # RECT 占 rect_bytes 字节，后面紧跟两个 UI16（FrameRate、FrameCount），共 4 字节
    return 8 + rect_bytes + 2 + 2


# 解析所有 Tag（Type, Data），仅做简单切片，不做深度解析
def parse_swf_tags(data):
    """
    从传入的原始 Tag 数据（已去除 SWF header 之后一段字节）逐个读取 TagHeader + TagData，
    返回列表 [(tag_type, tag_data_bytes), ...]。
    TagHeader: 16 bit，其中高 10 bit 为 TagType，低 6 bit 为长度（若等于 0x3F，则下一 32bit 为真长度）。
    """
    pos = 0
    tags = []

    while pos < len(data):
        if pos + 2 > len(data):
            break
        tag_header = struct.unpack_from("<H", data, pos)[0]
        tag_type = tag_header >> 6
        tag_length = tag_header & 0x3F
        pos += 2

        if tag_length == 0x3F:
            # 如果低 6 bit 全为 1，则后面 4 字节（UI32）才是真正长度
            if pos + 4 > len(data):
                break
            tag_length = struct.unpack_from("<I", data, pos)[0]
            pos += 4

        tag_data = data[pos : pos + tag_length]
        tags.append((tag_type, tag_data))
        pos += tag_length

    return tags


# 主要函数：定位并导出 DefineBitsJPEG3 (TagType = 35) 图像
def extract_define_bits_jpeg3(file_path, output_dir="output_jpeg3"):
    """
    1. 读取 SWF 文件，若是 CWS（zlib 压缩），先解压后合并 header
    2. 计算 header 字节数，定位到第一个 Tag 开始的位置
    3. 逐个解析 Tag，找到 TagType == 35（DefineBitsJPEG3）并提取其中的 JPEG 数据
    4. 将 JPEG 数据写入文件（不带 alpha 通道）
    """
    with open(file_path, "rb") as f:
        header = f.read(8)
        signature = header[:3]

        if signature == b"CWS":
            # zlib 压缩
            f.seek(8)
            compressed_body = f.read()
            decompressed_body = zlib.decompress(compressed_body)
            data = header + decompressed_body
        elif signature == b"FWS":
            # 无压缩
            f.seek(8)
            data = header + f.read()
        else:
            raise NotImplementedError("暂不支持 LZMA（ZWS）或其他压缩类型")

    # 跳过 SWF 头部 (Signature/Version/FileLength/FrameSize/FrameRate/FrameCount)
    header_size = get_swf_header_size(data)
    tag_data = data[header_size:]
    tags = parse_swf_tags(tag_data)

    # 确保输出目录存在
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    count = 0

    for tag_type, tag_bytes in tags:
        # TagType 35 对应 DefineBitsJPEG3
        if tag_type == 35:
            # tag_bytes 结构： [CharacterID(2 bytes)] [AlphaOffset(4 bytes)] [JPEGData(AlphaOffset 长度)] [AlphaData]
            character_id = struct.unpack_from("<H", tag_bytes, 0)[0]
            alpha_offset = struct.unpack_from("<I", tag_bytes, 2)[0]
            jpeg_data = tag_bytes[6 : 6 + alpha_offset]  # 取出纯 JPEG 二进制

            # 写入文件 (输出为 .jpg)
            output_path = Path(output_dir) / f"image_{character_id}.jpg"
            with open(output_path, "wb") as img_file:
                img_file.write(jpeg_data)

            print(f"✅ 导出了 DefineBitsJPEG3 id={character_id} -> {output_path}")
            count += 1

    if count == 0:
        print("⚠️ 未在 SWF 中找到任何 DefineBitsJPEG3 标签。")
    else:
        print(f"✅ 共导出 {count} 个 DefineBitsJPEG3 图像。")


if __name__ == "__main__":
    swf_file_path = "SceneActivityPanel.swf"
    extract_define_bits_jpeg3(swf_file_path)
