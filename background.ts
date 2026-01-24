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

// 全局监听标签页更新事件，监听发货台页面的加载
// 当页面跳转到发货台页面时，自动通知content script执行任务
chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo, tab) {
  // 检查URL是否匹配发货台页面
  const currentUrl = tab.url || ""
  const isShippingDeskPage = currentUrl.includes('seller.kuajingmaihuo.com') && 
                            currentUrl.includes('/main/order-manager/shipping-desk')

  // 当页面加载完成且URL匹配发货台页面时
  if (changeInfo.status === 'complete' && isShippingDeskPage) {
    console.log(`[Background] 检测到发货台页面加载完成，URL: ${currentUrl}`)

    // 等待3秒后，向content script发送消息，通知开始执行发货台任务
    setTimeout(async () => {
      try {
        console.log('[Background] 等待3秒后，通知content script开始执行发货台任务')
        
        // 获取用户配置
        const config = await getUserConfig()
        
        if (!config) {
          console.warn('[Background] 未找到用户配置，无法执行发货台任务')
          return
        }
        
        // 向content script发送消息
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'START_SHIPPING_DESK_TASK',
          data: {
            warehouse: config.warehouse,
            shippingMethod: config.shippingMethod
          }
        })

        console.log('[Background] Content script响应:', response)
      } catch (error: any) {
        console.error('[Background] 发送消息到content script失败:', error)
        // 如果content script还未注入，可以尝试重试
        if (error.message?.includes('Could not establish connection')) {
          console.log('[Background] Content script可能还未注入，将在1秒后重试...')
          setTimeout(async () => {
            try {
              const config = await getUserConfig()
              if (config) {
                await chrome.tabs.sendMessage(tabId, {
                  type: 'START_SHIPPING_DESK_TASK',
                  data: {
                    warehouse: config.warehouse,
                    shippingMethod: config.shippingMethod
                  }
                })
              }
            } catch (retryError) {
              console.error('[Background] 重试发送消息失败:', retryError)
            }
          }, 1000)
        }
      }
    }, 3000) // 等待3秒
  }
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

    // 获取新窗口中的标签页ID
    const tabs = await chrome.tabs.query({ windowId: newWindow.id })
    const newTabId = tabs[0]?.id

    if (!newTabId) {
      throw new Error("无法获取新标签页ID")
    }

    // 监听标签页更新事件，等待页面加载完成
    // 当页面加载完成且URL匹配时，等待3秒后通知content script执行任务
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      // 检查是否是目标标签页
      if (tabId !== newTabId) {
        return
      }

      // 检查URL是否匹配（支持URL包含目标域名的情况）
      const targetUrl = data.url
      const currentUrl = tab.url || ""
      const isUrlMatch = currentUrl.includes('agentseller.temu.com') && 
                        (currentUrl === targetUrl || currentUrl.startsWith(targetUrl))

      // 当页面加载完成且URL匹配时
      if (changeInfo.status === 'complete' && isUrlMatch) {
        console.log(`[Background] 检测到目标页面加载完成，URL: ${currentUrl}`)
        
        // 移除监听器，避免重复执行
        chrome.tabs.onUpdated.removeListener(listener)

        // 等待3秒后，向content script发送消息，通知开始执行批量任务
        setTimeout(async () => {
          try {
            console.log('[Background] 等待3秒后，通知content script开始执行批量任务')
            
            // 向content script发送消息
            const response = await chrome.tabs.sendMessage(tabId, {
              type: 'START_BATCH_SHIPMENT',
              data: {
                warehouse: config.warehouse,
                shippingMethod: config.shippingMethod
              }
            })

            console.log('[Background] Content script响应:', response)
          } catch (error: any) {
            console.error('[Background] 发送消息到content script失败:', error)
            // 如果content script还未注入，可以尝试重试
            if (error.message?.includes('Could not establish connection')) {
              console.log('[Background] Content script可能还未注入，将在1秒后重试...')
              setTimeout(async () => {
                try {
                  await chrome.tabs.sendMessage(tabId, {
                    type: 'START_BATCH_SHIPMENT',
                    data: {
                      warehouse: config.warehouse,
                      shippingMethod: config.shippingMethod
                    }
                  })
                } catch (retryError) {
                  console.error('[Background] 重试发送消息失败:', retryError)
                }
              }, 1000)
            }
          }
        }, 3000) // 等待3秒
      }
    })

    return {
      success: true,
      message: "配置已保存，新窗口已打开",
      windowId: newWindow.id,
      tabId: newTabId
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

/**
 * 打开发货台页面
 * 监听页面加载完成后，通知content script执行后续操作
 * @param data 包含仓库、发货方式和URL的数据
 */
async function handleOpenShippingDeskPage(data: {
  warehouse: string
  shippingMethod: string
  url: string
}) {
  try {
    console.log('[Background] 准备打开发货台页面:', data.url)

    // 打开新窗口，设置为小窗口
    const newWindow = await chrome.windows.create({
      url: data.url,
      type: "normal",
      focused: true,
      width: 1200, // 窗口宽度
      height: 800  // 窗口高度
    })

    // 获取新窗口中的标签页ID
    const tabs = await chrome.tabs.query({ windowId: newWindow.id })
    const newTabId = tabs[0]?.id

    if (!newTabId) {
      throw new Error("无法获取新标签页ID")
    }

    console.log(`[Background] 已打开发货台页面，标签页ID: ${newTabId}`)

    // 监听标签页更新事件，等待页面加载完成
    // 当页面加载完成且URL匹配时，等待3秒后通知content script执行任务
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      // 检查是否是目标标签页
      if (tabId !== newTabId) {
        return
      }

      // 检查URL是否匹配（支持URL包含目标域名的情况）
      const targetUrl = data.url
      const currentUrl = tab.url || ""
      const isUrlMatch = currentUrl.includes('seller.kuajingmaihuo.com') && 
                        currentUrl.includes('/main/order-manager/shipping-desk')

      // 当页面加载完成且URL匹配时
      if (changeInfo.status === 'complete' && isUrlMatch) {
        console.log(`[Background] 检测到发货台页面加载完成，URL: ${currentUrl}`)
        
        // 移除监听器，避免重复执行
        chrome.tabs.onUpdated.removeListener(listener)

        // 等待3秒后，向content script发送消息，通知开始执行发货台任务
        setTimeout(async () => {
          try {
            console.log('[Background] 等待3秒后，通知content script开始执行发货台任务')
            
            // 获取用户配置
            const config = await getUserConfig()
            
            // 向content script发送消息
            const response = await chrome.tabs.sendMessage(tabId, {
              type: 'START_SHIPPING_DESK_TASK',
              data: {
                warehouse: config?.warehouse || data.warehouse,
                shippingMethod: config?.shippingMethod || data.shippingMethod
              }
            })

            console.log('[Background] Content script响应:', response)
          } catch (error: any) {
            console.error('[Background] 发送消息到content script失败:', error)
            // 如果content script还未注入，可以尝试重试
            if (error.message?.includes('Could not establish connection')) {
              console.log('[Background] Content script可能还未注入，将在1秒后重试...')
              setTimeout(async () => {
                try {
                  const config = await getUserConfig()
                  await chrome.tabs.sendMessage(tabId, {
                    type: 'START_SHIPPING_DESK_TASK',
                    data: {
                      warehouse: config?.warehouse || data.warehouse,
                      shippingMethod: config?.shippingMethod || data.shippingMethod
                    }
                  })
                } catch (retryError) {
                  console.error('[Background] 重试发送消息失败:', retryError)
                }
              }, 1000)
            }
          }
        }, 3000) // 等待3秒
      }
    })

    return {
      success: true,
      message: "发货台页面已打开",
      windowId: newWindow.id,
      tabId: newTabId
    }
  } catch (error: any) {
    console.error("[Background] handleOpenShippingDeskPage 发生错误:", error)
    throw error
  }
}
