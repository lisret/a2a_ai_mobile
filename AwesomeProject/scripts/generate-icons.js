/**
 * 应用图标生成脚本
 * 将 SVG 图标转换为 Android 所需的各种尺寸
 * 
 * 使用方法：
 * 1. 确保已安装 sharp: npm install --save-dev sharp
 * 2. 运行: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// 检查是否安装了 sharp
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ 错误：未安装 sharp 库');
  console.log('请运行: npm install --save-dev sharp');
  process.exit(1);
}

// 图标尺寸配置
const iconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// 源 SVG 文件路径
const sourceSvg = path.join(__dirname, '..', 'app_icon.svg');
const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// 检查源文件是否存在
if (!fs.existsSync(sourceSvg)) {
  console.error(`❌ 错误：找不到源图标文件 ${sourceSvg}`);
  process.exit(1);
}

// 确保 res 目录存在
if (!fs.existsSync(resDir)) {
  console.error(`❌ 错误：找不到 res 目录 ${resDir}`);
  process.exit(1);
}

console.log('🎨 开始生成应用图标...\n');

// 生成所有尺寸的图标
async function generateIcons() {
  try {
    for (const [mipmapDir, size] of Object.entries(iconSizes)) {
      const targetDir = path.join(resDir, mipmapDir);
      
      // 确保目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const iconPath = path.join(targetDir, 'ic_launcher.png');
      const roundIconPath = path.join(targetDir, 'ic_launcher_round.png');

      // 生成普通图标
      await sharp(sourceSvg)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(iconPath);

      // 圆形图标与普通图标相同（Android 系统会自动裁剪）
      await sharp(sourceSvg)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(roundIconPath);

      console.log(`✅ 已生成 ${mipmapDir}/ic_launcher.png (${size}×${size})`);
      console.log(`✅ 已生成 ${mipmapDir}/ic_launcher_round.png (${size}×${size})`);
    }

    console.log('\n🎉 图标生成完成！');
    console.log('\n📝 下一步：');
    console.log('1. 重新构建应用: cd android && ./gradlew clean && cd .. && npm run android');
    console.log('2. 或者使用 Android Asset Studio 在线工具生成更专业的图标');
    console.log('   访问: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html');
  } catch (error) {
    console.error('❌ 生成图标时出错:', error);
    process.exit(1);
  }
}

generateIcons();

