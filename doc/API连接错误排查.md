# API 连接错误排查指南

## 错误现象

```
执行失败: API调用失败: 500 - 
{
  "error": {
    "code": "InternalError.Algo",
    "message": "Cannot connect to host 127.0.0.1:11434 ssl:default [Connect call failed ('127.0.0.1', 11434)]",
    "type": "api_error"
  }
}
```

## 问题分析

### 错误含义

- **错误代码**: `InternalError.Algo` - 内部算法错误
- **错误消息**: 无法连接到 `127.0.0.1:11434`
- **端口 11434**: 这是 Ollama 服务的默认端口

### 可能的原因

1. **配置了本地 Ollama 服务地址**
   - API URL 配置为 `http://127.0.0.1:11434` 或 `http://localhost:11434`
   - 在 Android 设备上，`127.0.0.1` 指向设备本身，而不是开发机器

2. **Ollama 服务未运行**
   - 如果确实想在设备上使用 Ollama，需要确保服务正在运行

3. **网络配置问题**
   - 设备无法访问配置的 API 地址
   - 防火墙或网络限制

4. **API URL 配置错误**
   - 使用了错误的 API 地址格式
   - 缺少必要的路径（如 `/v1`）

## 解决方案

### 方案 1: 使用云端 API 服务（推荐）

如果使用的是云端 API 服务（如智谱AI、OpenAI、DeepSeek 等），请检查：

1. **确认 API URL 配置正确**
   - 智谱AI: `https://open.bigmodel.cn/api/paas/v4`
   - OpenAI: `https://api.openai.com/v1`
   - DeepSeek: `https://api.deepseek.com/v1`
   - 其他服务商请查看官方文档

2. **检查 API Key**
   - 确保 API Key 已正确输入
   - 确保 API Key 有效且未过期
   - 确保 API Key 有足够的额度

3. **检查网络连接**
   - 确保设备可以访问互联网
   - 检查是否有代理或 VPN 影响连接

### 方案 2: 使用本地部署的服务

如果确实需要使用本地部署的服务（如 Ollama），需要：

#### 2.1 在开发机器上运行服务

如果 Ollama 运行在开发机器上，需要使用开发机器的 IP 地址，而不是 `127.0.0.1`：

1. **获取开发机器的 IP 地址**
   ```bash
   # Windows
   ipconfig
   # 查找 IPv4 地址，例如：192.168.1.100
   
   # macOS/Linux
   ifconfig
   # 或
   ip addr show
   ```

2. **配置 API URL**
   - 将 API URL 改为：`http://192.168.1.100:11434/v1`
   - 替换 `192.168.1.100` 为你的实际 IP 地址

3. **确保设备与开发机器在同一网络**
   - 设备必须与开发机器连接到同一个 Wi-Fi 网络
   - 确保防火墙允许端口 11434 的连接

#### 2.2 在 Android 设备上运行服务（不推荐）

如果要在 Android 设备上运行 Ollama，需要：

1. 在设备上安装并运行 Ollama
2. 使用 `http://127.0.0.1:11434/v1` 作为 API URL
3. 确保服务正在运行

**注意**: 在 Android 设备上运行大型 AI 模型会消耗大量资源，不推荐。

### 方案 3: 检查 API URL 格式

确保 API URL 格式正确：

1. **检查 URL 格式**
   - ✅ 正确: `https://api.openai.com/v1`
   - ✅ 正确: `https://open.bigmodel.cn/api/paas/v4`
   - ❌ 错误: `https://api.openai.com` (缺少 `/v1`)
   - ❌ 错误: `http://127.0.0.1:11434` (在设备上无法访问开发机器)

2. **检查是否需要添加路径**
   - 大多数 API 服务需要 `/v1` 路径
   - 智谱AI 使用 `/v4` 路径
   - 查看服务商的文档确认正确的路径

## 常见错误配置示例

### ❌ 错误配置 1: 使用 localhost

```
API URL: http://localhost:11434
```

**问题**: 在 Android 设备上，`localhost` 指向设备本身，无法访问开发机器上的服务。

**解决**: 使用开发机器的实际 IP 地址。

### ❌ 错误配置 2: 缺少路径

```
API URL: https://api.openai.com
```

**问题**: 缺少 `/v1` 路径。

**解决**: 改为 `https://api.openai.com/v1`

### ❌ 错误配置 3: 使用错误的端口

```
API URL: http://192.168.1.100:8000
```

**问题**: 如果服务运行在其他端口，需要确认端口号。

**解决**: 确认服务实际运行的端口。

## 调试步骤

### 1. 检查模型配置

1. 打开应用
2. 进入"模型管理"
3. 点击要使用的模型
4. 检查"模型API地址"是否正确
5. 检查"API密钥"是否已填写

### 2. 测试网络连接

如果使用本地服务，可以在设备上测试连接：

```bash
# 使用 adb shell 连接到设备
adb shell

# 测试网络连接（需要 curl 或 wget）
curl http://192.168.1.100:11434/v1/models
```

### 3. 查看详细错误日志

在应用中查看任务历史，查看详细的错误信息：

1. 进入"任务历史"
2. 找到失败的任务
3. 查看错误详情

### 4. 检查 API 服务状态

如果使用云端服务：

1. 访问服务商的官网
2. 登录控制台
3. 检查 API Key 状态
4. 检查服务状态和额度

## 推荐的 API 服务配置

### 智谱AI (推荐国内用户)

```
API URL: https://open.bigmodel.cn/api/paas/v4
模型名称: ZhipuAI/AutoGLM-Phone-9B
```

### OpenAI (需要科学上网)

```
API URL: https://api.openai.com/v1
模型名称: gpt-4 或 gpt-3.5-turbo
```

### DeepSeek (性价比高)

```
API URL: https://api.deepseek.com/v1
模型名称: deepseek-chat
```

## 联系支持

如果以上方法都无法解决问题，请：

1. 记录完整的错误信息
2. 记录 API URL 配置（不要包含 API Key）
3. 记录使用的模型名称
4. 记录设备信息（Android 版本、设备型号）
5. 联系技术支持或查看项目文档

## 相关文档

- [API Key 获取指引](./src/screens/APIKeyGuideScreen.tsx) - 查看如何获取各厂商的 API Key
- [模型配置说明](./README.md) - 查看模型配置的详细说明

