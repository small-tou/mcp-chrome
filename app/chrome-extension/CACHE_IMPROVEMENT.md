# Model Caching Improvement

## 问题描述

之前的模型加载存在缓存问题：

- HuggingFace模型URL使用动态签名，每次请求都会生成不同的重定向URL
- 浏览器无法有效缓存这些动态URL，导致每次初始化都需要重新下载模型
- 模型文件较大（~116MB），重复下载影响用户体验

## 解决方案

实现了基于Cache API的智能缓存机制：

### 1. 缓存策略

- 使用稳定的HuggingFace URL作为缓存key
- 利用浏览器Cache API存储模型数据
- 自动处理重定向，无需手动解析动态URL

### 2. Worker通信优化

- 支持直接传递ArrayBuffer给Worker
- 使用Transferable Objects实现零拷贝传输
- 向后兼容原有的URL传递方式

### 3. 实现细节

#### 缓存函数

```javascript
async function getCachedModelData(modelUrl) {
  const cache = await caches.open(CACHE_NAME);

  // 1. 检查缓存
  const cachedResponse = await cache.match(modelUrl);
  if (cachedResponse) {
    return cachedResponse.arrayBuffer();
  }

  // 2. 网络获取并缓存
  const response = await fetch(modelUrl);
  await cache.put(modelUrl, response.clone());
  return response.arrayBuffer();
}
```

#### Worker初始化

```javascript
// 本地文件模式 - 使用URL
await this._sendMessageToWorker('init', {
  modelPath: localModelUrl,
  // ...
});

// 远程文件模式 - 使用缓存的ArrayBuffer
const modelData = await getCachedModelData(remoteModelUrl);
await this._sendMessageToWorker(
  'init',
  {
    modelData: modelData,
    // ...
  },
  [modelData],
); // Transferable Objects
```

#### Worker处理

```javascript
async function initializeModel(modelPathOrData, numThreads, executionProviders) {
  if (modelPathOrData instanceof ArrayBuffer) {
    // 使用缓存的模型数据
    session = await ort.InferenceSession.create(modelPathOrData, sessionOptions);
  } else {
    // 使用URL路径
    session = await ort.InferenceSession.create(modelPathOrData, sessionOptions);
  }
}
```

## 优势

1. **性能提升**：首次下载后，后续初始化直接使用缓存，大幅减少加载时间
2. **网络节省**：避免重复下载大文件，节省带宽
3. **用户体验**：减少等待时间，提升响应速度
4. **向后兼容**：支持本地文件和远程文件两种模式
5. **零拷贝**：使用Transferable Objects优化内存使用

## 测试

可以使用 `test-cache.html` 页面测试缓存功能：

1. 打开页面
2. 点击"Test Cache"按钮
3. 观察首次下载和后续缓存加载的时间差异

## 缓存管理

### 自动清理机制

1. **过期清理**：

   - 缓存有效期：7天
   - 每次获取模型时检查过期状态
   - 后台定期清理（每24小时）

2. **大小限制**：

   - 最大缓存大小：500MB
   - 超出限制时自动删除最旧的条目
   - 基于LRU（最近最少使用）策略

3. **元数据管理**：
   - 每个缓存条目都有对应的元数据
   - 记录时间戳、大小、版本等信息
   - 用于过期检查和统计

### 手动管理功能

1. **Popup界面**：

   - 缓存管理按钮
   - 查看缓存统计信息
   - 手动清理过期缓存
   - 清空所有缓存

2. **API函数**：

   ```javascript
   // 获取缓存统计
   const stats = await getCacheStats();

   // 清理过期缓存
   await cleanupModelCache();

   // 清空所有缓存
   await clearModelCache();
   ```

### 配置参数

- `CACHE_NAME`: `onnx-model-cache-v1`
- `CACHE_EXPIRY_DAYS`: 7天
- `MAX_CACHE_SIZE_MB`: 500MB

### 测试工具

使用 `test-cache.html` 页面测试所有缓存功能：

1. 基本缓存测试
2. 缓存大小检查
3. 过期缓存清理
4. 缓存统计信息
5. 手动缓存管理
