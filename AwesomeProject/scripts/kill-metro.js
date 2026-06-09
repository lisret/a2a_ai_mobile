/**
 * 停止占用端口 8081 的 Metro bundler 进程
 * 跨平台脚本（Windows/macOS/Linux）
 */

const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform();

console.log('正在查找占用端口 8081 的进程...\n');

try {
  let pids = [];
  
  if (platform === 'win32') {
    // Windows: 使用 netstat 和 findstr
    const output = execSync('netstat -ano | findstr :8081 | findstr LISTENING', { encoding: 'utf-8' });
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        pids.push(pid);
      }
    }
    
    if (pids.length > 0) {
      console.log(`找到 ${pids.length} 个进程占用端口 8081:`);
      pids.forEach(pid => {
        try {
          const processInfo = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf-8' });
          console.log(`  PID ${pid}: ${processInfo.trim()}`);
        } catch (e) {
          console.log(`  PID ${pid}`);
        }
      });
      
      console.log('\n正在终止进程...');
      pids.forEach(pid => {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`✓ 已终止进程 ${pid}`);
        } catch (e) {
          console.log(`✗ 终止进程 ${pid} 失败（可能需要管理员权限）`);
        }
      });
    } else {
      console.log('未找到占用端口 8081 的进程');
    }
  } else {
    // macOS/Linux: 使用 lsof
    try {
      const output = execSync('lsof -ti :8081', { encoding: 'utf-8' });
      pids = output.trim().split('\n').filter(pid => pid);
      
      if (pids.length > 0) {
        console.log(`找到 ${pids.length} 个进程占用端口 8081:`);
        pids.forEach(pid => {
          try {
            const processInfo = execSync(`ps -p ${pid} -o pid,comm,args`, { encoding: 'utf-8' });
            console.log(`  ${processInfo.split('\n')[1]}`);
          } catch (e) {
            console.log(`  PID ${pid}`);
          }
        });
        
        console.log('\n正在终止进程...');
        pids.forEach(pid => {
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            console.log(`✓ 已终止进程 ${pid}`);
          } catch (e) {
            console.log(`✗ 终止进程 ${pid} 失败`);
          }
        });
      } else {
        console.log('未找到占用端口 8081 的进程');
      }
    } catch (e) {
      console.log('未找到占用端口 8081 的进程（或 lsof 命令不可用）');
    }
  }
  
  console.log('\n完成！现在可以运行 npm start 启动 Metro bundler');
} catch (error) {
  console.error('执行失败:', error.message);
  process.exit(1);
}

