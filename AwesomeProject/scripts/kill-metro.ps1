# PowerShell 脚本：停止占用端口 8081 的进程

Write-Host "正在查找占用端口 8081 的进程..." -ForegroundColor Yellow

# 查找占用 8081 端口的进程
$processes = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    foreach ($pid in $processes) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "找到进程: $($process.ProcessName) (PID: $pid)" -ForegroundColor Green
            Write-Host "正在终止进程..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force
            Write-Host "成功终止进程 $pid" -ForegroundColor Green
        }
    }
} else {
    Write-Host "未找到占用端口 8081 的进程" -ForegroundColor Red
}

# 检查是否还有其他 node 进程
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "`n发现其他 node 进程:" -ForegroundColor Yellow
    $nodeProcesses | Format-Table Id, ProcessName, StartTime
    $choice = Read-Host "是否要终止所有 node 进程？(Y/N)"
    if ($choice -eq "Y" -or $choice -eq "y") {
        Stop-Process -Name "node" -Force
        Write-Host "已终止所有 node 进程" -ForegroundColor Green
    }
} else {
    Write-Host "`n没有发现其他 node 进程" -ForegroundColor Green
}

Write-Host "`n完成！现在可以运行 npm start 启动 Metro bundler" -ForegroundColor Green

