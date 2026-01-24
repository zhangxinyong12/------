/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

// 设置视口大小为1920x1080的效果
// 通过设置meta viewport标签和CSS来实现
function setViewportSize() {
  // 等待DOM加载完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setViewportSize)
    return
  }

  // 移除现有的viewport meta标签
  const existingViewport = document.querySelector('meta[name="viewport"]')
  if (existingViewport) {
    existingViewport.remove()
  }

  // 创建新的viewport meta标签，设置宽度为1920
  const viewport = document.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=1920, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
  document.getElementsByTagName('head')[0].appendChild(viewport)

  // 设置body和html的最小宽度为1920px，确保内容按1920px宽度渲染
  document.documentElement.style.minWidth = '1920px'
  if (document.body) {
    document.body.style.minWidth = '1920px'
  } else {
    // 如果body还没加载，等待一下再设置
    setTimeout(() => {
      if (document.body) {
        document.body.style.minWidth = '1920px'
      }
    }, 100)
  }
}

/**
 * 开始批量执行任务
 * 在新窗口打开后执行批量发货操作
 */
async function startBatchTasks() {
  // 获取用户配置
  const config = await chrome.storage.local.get('userConfig')
  const userConfig = config.userConfig

  if (!userConfig) {
    console.error('[Content] 未找到用户配置')
    return
  }

  console.log('[Content] 开始批量执行任务，配置:', userConfig)

  // TODO: 在这里实现实际的批量发货逻辑
  // 1. 等待页面完全加载
  // 2. 查找待发货订单列表
  // 3. 根据用户配置（仓库、发货方式）批量处理订单
  // 4. 更新订单状态

  // 示例：等待页面加载完成后执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      executeBatchShipment(userConfig)
    })
  } else {
    // 页面已经加载完成，直接执行
    executeBatchShipment(userConfig)
  }
}

/**
 * 执行批量发货操作
 * @param config 用户配置（仓库、发货方式）
 */
function executeBatchShipment(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] 执行批量发货，配置:', config)

  // TODO: 在这里实现具体的批量发货逻辑
  // 例如：
  // 1. 查找订单列表元素
  // 2. 遍历订单，选择仓库和发货方式
  // 3. 提交发货请求
  // 4. 处理结果

  // 临时示例：发送消息到background，通知开始执行任务
  chrome.runtime.sendMessage({
    type: 'BATCH_TASK_STARTED',
    data: {
      warehouse: config.warehouse,
      shippingMethod: config.shippingMethod,
      url: window.location.href
    }
  })
}

// 只在目标网站执行
if (window.location.href.includes('agentseller.temu.com')) {
  // 立即设置视口大小
  setViewportSize()

  // 等待页面完全加载后再开始批量任务
  if (document.readyState === 'complete') {
    // 页面已完全加载，直接执行
    startBatchTasks()
  } else {
    // 等待页面完全加载
    window.addEventListener('load', () => {
      // 再次设置视口大小，确保生效
      setViewportSize()
      // 延迟一点时间，确保页面元素都已渲染
      setTimeout(() => {
        startBatchTasks()
      }, 500)
    })
  }
}
