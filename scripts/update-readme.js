const fs = require("fs");
const path = require("path");

function updateReadme() {
  const imagesDir = path.join(__dirname, "..", "images");
  const readmePath = path.join(__dirname, "..", "README.MD");

  // 检查README文件是否存在
  if (!fs.existsSync(readmePath)) {
    console.log("README.md not found, creating a new one...");
    const initialReadme = `# 赛尔号预告图片获取器

本项目用于自动获取赛尔号预告图片。

## 🚀 自动同步

本项目配置了GitHub Actions工作流，会在每周五的北京时间12:00和15:00自动获取最新的预告图片，并更新到本README文档中。

- ⏰ 自动执行时间：每周五 12:00 和 15:00 (北京时间)
- 📁 图片保存路径：\`./images/\` 目录
- 🔄 历史图片会被保留作为备份
`;
    fs.writeFileSync(readmePath, initialReadme);
  }

  // 读取现有README
  let readmeContent = fs.readFileSync(readmePath, "utf8");

  // 获取所有图片文件
  if (!fs.existsSync(imagesDir)) {
    console.log("Images directory not found, creating it...");
    fs.mkdirSync(imagesDir, { recursive: true });
    return;
  }

  const imageFiles = fs
    .readdirSync(imagesDir)
    .filter((file) => file.match(/\.(jpg|jpeg|png|gif|webp)$/i))
    .sort((a, b) => {
      // 按文件修改时间排序，最新的在前
      const statA = fs.statSync(path.join(imagesDir, a));
      const statB = fs.statSync(path.join(imagesDir, b));
      return statB.mtime - statA.mtime;
    });

  if (imageFiles.length === 0) {
    console.log("No image files found");
    return;
  }

  // 构建图片展示内容
  const latestImage = imageFiles[0];
  const historyImages = imageFiles.slice(1);

  let imageSection = "\n## 📸 最新预告图片\n\n";
  imageSection += `![最新预告图片](./images/${latestImage})\n\n`;
  imageSection += `*最后更新时间: ${new Date().toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  })}*\n\n`;

  if (historyImages.length > 0) {
    imageSection += "## 📚 历史预告图片\n\n";
    imageSection += "<details>\n<summary>点击查看历史图片</summary>\n\n";

    historyImages.forEach((image) => {
      const stats = fs.statSync(path.join(imagesDir, image));
      const updateTime = stats.mtime.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
      });
      imageSection += `### ${image}\n`;
      imageSection += `*更新时间: ${updateTime}*\n\n`;
      imageSection += `![${image}](./images/${image})\n\n`;
    });

    imageSection += "</details>\n\n";
  }

  // 更新README内容
  const imagesSectionRegex = /## 📸 最新预告图片[\s\S]*?(?=##|$)/;
  const historySectionRegex = /## 📚 历史预告图片[\s\S]*?(?=##|$)/;

  // 移除旧的图片sections
  readmeContent = readmeContent.replace(imagesSectionRegex, "");
  readmeContent = readmeContent.replace(historySectionRegex, "");

  // 在README末尾添加新的图片section
  readmeContent = readmeContent.trim() + "\n" + imageSection;

  // 写回README文件
  fs.writeFileSync(readmePath, readmeContent);
  console.log("README.md updated successfully");
}

updateReadme();
