const fs = require("fs");
const path = require("path");

function updateReadme() {
  const imagesDir = path.join(__dirname, "..", "images");
  const readmePath = path.join(__dirname, "..", "README.md");

  // 读取现有README
  let readmeContent = fs.readFileSync(readmePath, "utf8");

  // 获取所有图片文件
  if (!fs.existsSync(imagesDir)) {
    console.log("Images directory not found");
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
