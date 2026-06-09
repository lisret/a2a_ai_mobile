/**
 * 自动选择模拟器运行 React Native Android 应用
 * 只连接以 "emulator" 开头的设备
 */

const { execSync } = require('child_process');
const { spawn } = require('child_process');

function getEmulatorDevices() {
  try {
    const output = execSync('adb devices', { encoding: 'utf-8' });
    const lines = output.split('\n');
    const devices = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('List') && trimmed.includes('\tdevice')) {
        const deviceId = trimmed.split('\t')[0];
        if (deviceId.startsWith('emulator')) {
          devices.push(deviceId);
        }
      }
    }
    
    return devices;
  } catch (error) {
    console.error('获取设备列表失败:', error.message);
    return [];
  }
}

function runOnEmulator(deviceId) {
  console.log(`🚀 在模拟器 ${deviceId} 上运行应用...`);
  
  const command = 'npx';
  const args = ['react-native', 'run-android', '--deviceId', deviceId];
  
  const process = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
  });
  
  process.on('close', (code) => {
    process.exit(code);
  });
}

// 主逻辑
const emulators = getEmulatorDevices();

if (emulators.length === 0) {
  console.error('❌ 未找到模拟器设备');
  console.log('💡 提示：请确保模拟器已启动，或使用 "adb devices" 查看设备列表');
  process.exit(1);
} else if (emulators.length === 1) {
  console.log(`✅ 找到 1 个模拟器: ${emulators[0]}`);
  runOnEmulator(emulators[0]);
} else {
  console.log(`✅ 找到 ${emulators.length} 个模拟器:`);
  emulators.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id}`);
  });
  console.log(`\n🚀 使用第一个模拟器: ${emulators[0]}`);
  runOnEmulator(emulators[0]);
}

