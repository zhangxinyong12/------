/**
 * Background 脚本
 * 处理插件的后台逻辑和消息传递
 */

// 用户配置类型定义
interface UserConfig {
  warehouse: string // 发货仓库
  shippingMethod: string // 发货方式
}

// 监听来自 popup 或其他地方的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理保存配置并打开URL的请求
  if (message.type === "SAVE_CONFIG_AND_OPEN_URL") {
    handleSaveConfigAndOpenUrl(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 保存配置并打开URL错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理批量发货请求
  if (message.type === "START_BATCH_SHIPMENT") {
    handleBatchShipment(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 批量发货错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理获取用户配置的请求
  if (message.type === "GET_USER_CONFIG") {
    getUserConfig()
      .then((config) => {
        sendResponse({ success: true, data: config })
      })
      .catch((error) => {
        console.error("[Background] 获取用户配置错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true
  }

  // 处理批量任务开始的通知
  if (message.type === "BATCH_TASK_STARTED") {
    console.log("[Background] 批量任务已开始:", message.data)
    // 可以在这里记录任务状态或执行其他操作
    sendResponse({ success: true })
    return true
  }

  return false
})

/**
 * 保存用户配置并打开指定URL
 * @param data 包含仓库、发货方式和URL的数据
 */
async function handleSaveConfigAndOpenUrl(data: {
  warehouse: string
  shippingMethod: string
  url: string
}) {
  try {
    // 保存用户配置到 chrome.storage
    const config: UserConfig = {
      warehouse: data.warehouse,
      shippingMethod: data.shippingMethod
    }

    await chrome.storage.local.set({ userConfig: config })

    // 打开新窗口，设置为小窗口
    // 窗口本身是小窗口，但通过content script设置视口为1920x1080，页面内容会按1920宽度渲染
    const newWindow = await chrome.windows.create({
      url: data.url,
      type: "normal",
      focused: true,
      width: 1200, // 窗口宽度
      height: 800  // 窗口高度
    })

    // 等待窗口和标签页加载完成后，注入content script设置视口大小
    // 注意：Plasmo会自动注入content script，但我们可以监听标签页更新来确保执行
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      if (changeInfo.status === 'complete' && tab.windowId === newWindow.id && tab.url === data.url) {
        // 页面加载完成，content script会自动执行
        chrome.tabs.onUpdated.removeListener(listener)
      }
    })

    return {
      success: true,
      message: "配置已保存，新窗口已打开",
      windowId: newWindow.id
    }
  } catch (error: any) {
    console.error("[Background] handleSaveConfigAndOpenUrl 发生错误:", error)
    throw error
  }
}

/**
 * 获取用户配置
 * @returns 用户配置对象
 */
async function getUserConfig(): Promise<UserConfig | null> {
  const result = await chrome.storage.local.get("userConfig")
  return result.userConfig || null
}

/**
 * 处理批量发货逻辑
 * @param data 发货数据（包含仓库和发货方式）
 */
async function handleBatchShipment(data: {
  warehouse: string
  shippingMethod: string
}) {
  // TODO: 在这里实现实际的批量发货逻辑
  // 1. 获取待发货订单列表
  // 2. 根据选择的仓库和发货方式处理订单
  // 3. 更新订单状态

  // 模拟处理过程
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return {
    success: true,
    message: "批量发货已开始处理"
  }
}
