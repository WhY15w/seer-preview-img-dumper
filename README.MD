# Seer-swf-jpeg3-dumper

🎯 一个用于从 `.swf` Flash 文件中提取图像资源（如 DefineBitsJPEG3）的 Node.js 和Python工具。

> 支持自动导出 SWF 文件中的嵌入式 JPEG 图像（Tag 35），可替代 JPEXS 等手动操作流程。

---

## ✨ 功能特点

- ✅ 提取 SWF 中的 `DefineBitsJPEG3`（Tag 35）图像资源
- 🧠 基于 Node.js和Python，无需依赖 Adobe 工具
- 🗂️ 自动将图像保存为 `.jpg`

---

## 📦 使用方法

```bash
node index.js
 or
python index.py
```

## 🧠 效果展示

下图为导出赛尔号下周预告的图片

![展示](img/res.png)


## ⚙️ 工作原理

该工具直接读取 SWF 的二进制结构，解析出 DefineBitsJPEG3 标签，并将其中嵌入的 JPEG 数据提取出来保存为图片文件。相当于自动化 JPEXS 中手动导出的过程。