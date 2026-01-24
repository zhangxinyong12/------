/**
 * Background 脚本
 * 处理插件的后台逻辑和消息传递
 */

// 监听来自 popup 或其他地方的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Background] 收到消息:", message)

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

  return false
})

/**
 * 处理批量发货逻辑
 * @param data 发货数据（包含仓库和发货方式）
 */
async function handleBatchShipment(data: {
  warehouse: string
  shippingMethod: string
}) {
  console.log("[Background] 开始批量发货:", data)

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
