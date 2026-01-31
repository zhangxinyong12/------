/**
 * Background 脚本
 * 处理插件的后台逻辑和消息传递
 */
import ExcelJS from "exceljs"

// 用户配置类型定义
interface UserConfig {
  warehouse: string // 发货仓库
  shippingMethod: string // 发货方式
}

// 打印数据缓存（已移动到content script中处理）

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

  // 处理保存发货台数据的请求
  if (message.type === "SAVE_SHIPPING_DESK_DATA") {
    handleSaveShippingDeskData(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 保存发货台数据错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理保存发货台数据并下载图片的请求
  // 处理批量发货完成，准备跳转到发货台的通知
  if (message.type === "BATCH_SHIPMENT_COMPLETED") {
    handleBatchShipmentCompleted(sender.tab?.id)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 处理批量发货完成错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理记录已发货备货单号的请求
  if (message.type === "RECORD_SHIPPED_STOCK_ORDER") {
    handleRecordShippedStockOrder(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 记录已发货备货单号错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理获取已发货备货单号列表的请求
  if (message.type === "GET_SHIPPED_STOCK_ORDERS") {
    getShippedStockOrders()
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 获取已发货备货单号错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理检查备货单号是否已发货的请求
  if (message.type === "CHECK_STOCK_ORDER_SHIPPED") {
    checkStockOrderShipped(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 检查备货单号发货状态错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理清除已发货记录的请求
  if (message.type === "CLEAR_SHIPPED_STOCK_ORDERS") {
    clearShippedStockOrders()
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 清除已发货记录错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理跳转到shipping-list页面并发送装箱事件
  if (message.type === "NAVIGATE_TO_SHIPPING_LIST") {
    handleNavigateToShippingList(sender.tab?.id, message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 跳转到shipping-list错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理打印后刷新页面继续执行的事件
  if (message.type === "CONTINUE_AFTER_PRINT_REFRESH") {
    handleContinueAfterPrintRefresh(sender.tab?.id, message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 处理打印后刷新继续执行错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理PDF生成完成的通知
  if (message.type === "PDF_GENERATED") {
    handlePDFGenerated(sender.tab?.id, message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 处理PDF生成通知错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理保存批量打印数据的请求
  if (message.type === "SAVE_BATCH_PRINT_DATA") {
    handleSaveBatchPrintData(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 保存批量打印数据错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理获取批量打印数据的请求
  if (message.type === "GET_BATCH_PRINT_DATA") {
    getBatchPrintData()
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 获取批量打印数据错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理测试打印条码的请求（转发到当前活动标签页的content script）
  if (message.type === "TEST_PRINT_BARCODE") {
    handleForwardToActiveTab("TEST_PRINT_BARCODE", message.data)
      .then((result) => {
        sendResponse(result)
      })
      .catch((error) => {
        console.error("[Background] 测试打印条码错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理直接执行发货步骤的请求（转发到当前活动标签页的content script）
  if (message.type === "START_SHIPMENT_STEPS_DIRECTLY") {
    handleForwardToActiveTab("START_SHIPMENT_STEPS_DIRECTLY", message.data)
      .then((result) => {
        sendResponse(result)
      })
      .catch((error) => {
        console.error("[Background] 直接执行发货步骤错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理点击待仓库收货标签的请求（转发到当前活动标签页的content script）
  if (message.type === "CLICK_WAREHOUSE_RECEIPT_TAB") {
    handleForwardToActiveTab("CLICK_WAREHOUSE_RECEIPT_TAB", message.data)
      .then((result) => {
        sendResponse(result)
      })
      .catch((error) => {
        console.error("[Background] 点击待仓库收货标签错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理打开发货台页面的请求
  if (message.type === "OPEN_SHIPPING_DESK") {
    handleOpenShippingDeskPage(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 打开发货台页面错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理跳转到发货台页面的请求
  if (message.type === "NAVIGATE_TO_SHIPPING_DESK") {
    handleNavigateToShippingDesk(message.data)
      .then((result) => {
        sendResponse({ success: true, data: result })
      })
      .catch((error) => {
        console.error("[Background] 跳转到发货台错误:", error)
        sendResponse({ success: false, error: error.message })
      })
    return true // 保持消息通道开放以支持异步响应
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
      height: 800 // 窗口高度
    })

    // 获取新窗口中的标签页ID
    const tabs = await chrome.tabs.query({ windowId: newWindow.id })
    const newTabId = tabs[0]?.id

    if (!newTabId) {
      throw new Error("无法获取新标签页ID")
    }

    // 监听标签页更新事件，等待页面加载完成
    // 当页面加载完成时，向content script发送消息
    chrome.tabs.onUpdated.addListener(
      function listener(tabId, changeInfo, tab) {
        // 检查是否是目标标签页
        if (tabId !== newTabId) {
          return
        }

        // 当页面加载完成时，直接发送消息
        if (changeInfo.status === "complete") {
          console.log(
            `[Background] 检测到页面加载完成，标签页ID: ${tabId}, URL: ${tab.url}`
          )

          // 移除监听器，避免重复执行
          chrome.tabs.onUpdated.removeListener(listener)

          // 等待3秒后，向content script发送消息，通知开始执行批量任务
          setTimeout(async () => {
            try {
              console.log(
                "[Background] 等待3秒后，通知content script开始执行批量任务"
              )

              // 向content script发送消息
              const response = await chrome.tabs.sendMessage(tabId, {
                type: "START_BATCH_SHIPMENT",
                data: {
                  warehouse: config.warehouse,
                  shippingMethod: config.shippingMethod
                }
              })

              console.log("[Background] Content script响应:", response)
            } catch (error: any) {
              console.error("[Background] 发送消息到content script失败:", error)
              // 如果content script还未注入，可以尝试重试
              if (error.message?.includes("Could not establish connection")) {
                console.log(
                  "[Background] Content script可能还未注入，将在1秒后重试..."
                )
                setTimeout(async () => {
                  try {
                    await chrome.tabs.sendMessage(tabId, {
                      type: "START_BATCH_SHIPMENT",
                      data: {
                        warehouse: config.warehouse,
                        shippingMethod: config.shippingMethod
                      }
                    })
                  } catch (retryError) {
                    console.error("[Background] 重试发送消息失败:", retryError)
                  }
                }, 1000)
              }
            }
          }, 3000) // 等待3秒
        }
      }
    )

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
 * 保存发货台数据并生成Excel表格
 * 创建文件夹结构并生成Excel文件
 * @param data 包含分组数据的对象
 */
async function handleSaveShippingDeskData(data: {
  baseFolder: string
  shopName: string
  product: string
  groupedData: Array<{
    warehouse: string
    product: string
    rows: Array<{
      stockOrderNo: string
      productCode: string
      warehouse: string
      skuId: string
      quantity: number
    }>
  }>
}) {
  try {
    console.log("[Background] 保存发货台数据:", data)

    const baseFolder = sanitizeFileName(data.baseFolder)
    const shopName = sanitizeFileName(data.shopName)
    const product = sanitizeFileName(data.product)

    // 聚合货号数量
    const productCodeQuantityMap = new Map<string, number>()

    data.groupedData.forEach((group) => {
      group.rows.forEach((row) => {
        const currentQty = productCodeQuantityMap.get(row.productCode) || 0
        productCodeQuantityMap.set(row.productCode, currentQty + row.quantity)
      })
    })

    // 使用 ExcelJS 生成真正的 Excel 文件
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("发货清单")

    // 添加表头
    worksheet.columns = [
      { header: "货号", key: "productCode", width: 20 },
      { header: "图片", key: "image", width: 20 },
      { header: "数量", key: "quantity", width: 15 }
    ]

    // 添加数据
    productCodeQuantityMap.forEach((quantity, productCode) => {
      worksheet.addRow({
        productCode: productCode,
        image: "",
        quantity: quantity
      })
    })

    // 设置表头样式
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" }
    }

    // 生成 Excel 文件
    const excelBuffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })
    const excelUrl = URL.createObjectURL(blob)
    const excelFilePath = `${baseFolder}/${shopName}/${product}/发货清单.xlsx`

    await chrome.downloads.download({
      url: excelUrl,
      filename: excelFilePath,
      saveAs: false,
      conflictAction: "overwrite"
    })

    console.log(`[Background] Excel文件已保存: ${excelFilePath}`)

    // 保存到chrome.storage
    await chrome.storage.local.set({
      shippingDeskData: data.groupedData
    })

    console.log(
      "[Background] 发货台数据已保存，共",
      data.groupedData.length,
      "个分组"
    )

    return {
      success: true,
      message: "发货台数据已保存",
      warehouseCount: data.groupedData.length,
      totalRows: data.groupedData.reduce(
        (sum, group) => sum + group.rows.length,
        0
      ),
      excelFilePath
    }
  } catch (error: any) {
    console.error("[Background] handleSaveShippingDeskData 发生错误:", error)
    throw error
  }
}

/**
 * 清理文件名，移除不允许的字符
 * @param fileName 原始文件名
 * @returns 清理后的文件名
 */
function sanitizeFileName(fileName: string): string {
  // 移除Windows不允许的字符: < > : " / \ | ? *
  return fileName.replace(/[<>:"/\\|?*]/g, "_").trim()
}

/**
 * 保存发货台数据并下载图片
 * 创建文件夹结构并批量下载图片
 * @param data 包含分组数据和下载信息的对象
 */
/**
 * 处理批量发货完成，准备跳转到发货台
 * Content Script 完成批量发货后通知 Background，Background 监听页面跳转到发货台后，等待3秒再发送执行任务的消息
 * @param tabId 发送消息的标签页ID
 */
async function handleBatchShipmentCompleted(tabId: number) {
  try {
    console.log(`[Background] 收到批量发货完成通知，标签页ID: ${tabId}`)

    // 监听标签页更新事件，等待页面跳转到发货台
    chrome.tabs.onUpdated.addListener(
      function listener(tabIdListener, changeInfo, tab) {
        // 检查是否是目标标签页
        if (tabIdListener !== tabId) {
          return
        }

        // 检查URL是否是发货台页面
        const currentUrl = tab.url || ""
        const isShippingDeskPage =
          currentUrl.includes("seller.kuajingmaihuo.com") &&
          currentUrl.includes("/main/order-manager/shipping-desk")

        // 当页面加载完成且URL匹配发货台页面时
        if (changeInfo.status === "complete" && isShippingDeskPage) {
          console.log(
            `[Background] 检测到发货台页面加载完成，URL: ${currentUrl}`
          )

          // 移除监听器，避免重复执行
          chrome.tabs.onUpdated.removeListener(listener)

          // 等待3秒后，向content script发送消息，通知开始执行发货台任务
          setTimeout(async () => {
            try {
              console.log(
                "[Background] 等待3秒后，通知content script开始执行发货台任务"
              )

              // 获取用户配置
              const config = await getUserConfig()

              if (!config) {
                console.warn("[Background] 未找到用户配置，无法执行发货台任务")
                return
              }

              // 向content script发送消息
              const response = await chrome.tabs.sendMessage(tabId, {
                type: "START_SHIPPING_DESK_TASK",
                data: {
                  warehouse: config.warehouse,
                  shippingMethod: config.shippingMethod
                }
              })

              console.log("[Background] Content script响应:", response)
            } catch (error: any) {
              console.error("[Background] 发送消息到content script失败:", error)
              // 如果content script还未注入，可以尝试重试
              if (error.message?.includes("Could not establish connection")) {
                console.log(
                  "[Background] Content script可能还未注入，将在1秒后重试..."
                )
                setTimeout(async () => {
                  try {
                    const config = await getUserConfig()
                    if (config) {
                      await chrome.tabs.sendMessage(tabId, {
                        type: "START_SHIPPING_DESK_TASK",
                        data: {
                          warehouse: config.warehouse,
                          shippingMethod: config.shippingMethod
                        }
                      })
                    }
                  } catch (retryError) {
                    console.error("[Background] 重试发送消息失败:", retryError)
                  }
                }, 1000)
              }
            }
          }, 3000) // 等待3秒
        }
      }
    )

    return {
      success: true,
      message: "已监听页面跳转，等待发货台页面加载完成"
    }
  } catch (error: any) {
    console.error("[Background] 处理批量发货完成错误:", error)
    throw error
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
  product: string
  url: string
}) {
  try {
    console.log("[Background] 准备打开发货台页面:", data.url)

    // 打开新窗口，设置为小窗口
    const newWindow = await chrome.windows.create({
      url: data.url,
      type: "normal",
      focused: true,
      width: 1200,
      height: 800
    })

    const tabs = await chrome.tabs.query({ windowId: newWindow.id })
    const newTabId = tabs[0]?.id

    if (!newTabId) {
      throw new Error("无法获取新标签页ID")
    }

    console.log(`[Background] 已打开发货台页面，标签页ID: ${newTabId}`)

    chrome.tabs.onUpdated.addListener(
      function listener(tabId, changeInfo, tab) {
        if (tabId !== newTabId) {
          return
        }

        const currentUrl = tab.url || ""
        const isUrlMatch =
          currentUrl.includes("seller.kuajingmaihuo.com") &&
          currentUrl.includes("/main/order-manager/shipping-desk")

        if (changeInfo.status === "complete" && isUrlMatch) {
          console.log(
            `[Background] 检测到发货台页面加载完成，URL: ${currentUrl}`
          )

          chrome.tabs.onUpdated.removeListener(listener)

          setTimeout(async () => {
            try {
              console.log(
                "[Background] 等待3秒后，通知content script开始执行发货台任务"
              )

              const config = await getUserConfig()

              const response = await chrome.tabs.sendMessage(tabId, {
                type: "START_SHIPPING_DESK_TASK",
                data: {
                  warehouse: config?.warehouse || data.warehouse,
                  shippingMethod: config?.shippingMethod || data.shippingMethod,
                  product: data.product
                }
              })

              console.log("[Background] Content script响应:", response)
            } catch (error: any) {
              console.error("[Background] 发送消息到content script失败:", error)
              if (error.message?.includes("Could not establish connection")) {
                console.log(
                  "[Background] Content script可能还未注入，将在1秒后重试..."
                )
                setTimeout(async () => {
                  try {
                    const config = await getUserConfig()
                    await chrome.tabs.sendMessage(tabId, {
                      type: "START_SHIPPING_DESK_TASK",
                      data: {
                        warehouse: config?.warehouse || data.warehouse,
                        shippingMethod:
                          config?.shippingMethod || data.shippingMethod,
                        product: data.product
                      }
                    })
                  } catch (retryError) {
                    console.error("[Background] 重试发送消息失败:", retryError)
                  }
                }, 1000)
              }
            }
          }, 3000)
        }
      }
    )

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

/**
 * 跳转到发货台页面（用于多仓库处理过程中的页面导航）
 * @param data 包含要跳转的URL
 */
async function handleNavigateToShippingDesk(data: { url: string }) {
  try {
    console.log("[Background] 准备跳转到发货台页面:", data.url)

    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })

    if (!tab) {
      throw new Error("无法获取当前活动标签页")
    }

    const tabId = tab.id
    console.log(`[Background] 当前标签页ID: ${tabId}`)

    // 更新标签页URL，导航到发货台
    await chrome.tabs.update(tabId, { url: data.url })

    return {
      success: true,
      message: "正在跳转到发货台页面",
      tabId: tabId
    }
  } catch (error: any) {
    console.error("[Background] handleNavigateToShippingDesk 发生错误:", error)
    throw error
  }
}

/**
 * 记录已发货的备货单号
 * 使用备货单号作为唯一key
 * @param data 包含备货单号数组或单个备货单号的数据
 */
async function handleRecordShippedStockOrder(data: {
  stockOrderNos: string[] | string // 备货单号数组或单个备货单号
  warehouse?: string // 可选的仓库名称
}) {
  try {
    // 处理备货单号，支持数组和单个字符串
    const orderNos = Array.isArray(data.stockOrderNos)
      ? data.stockOrderNos
      : [data.stockOrderNos]

    console.log(
      `[Background] 记录 ${orderNos.length} 个已发货备货单号:`,
      orderNos
    )

    // 获取现有的已发货记录
    const existingData = await chrome.storage.local.get("shippedStockOrders")
    const existingSet = new Set(existingData.shippedStockOrders || [])

    // 添加新的备货单号
    let addedCount = 0
    for (const orderNo of orderNos) {
      if (orderNo && !existingSet.has(orderNo)) {
        existingSet.add(orderNo)
        addedCount++
      }
    }

    // 保存更新后的记录
    await chrome.storage.local.set({
      shippedStockOrders: Array.from(existingSet)
    })

    console.log(
      `[Background] 已保存已发货备货单号，本次新增 ${addedCount} 个，总计 ${existingSet.size} 个`
    )

    return {
      success: true,
      message: "已记录已发货备货单号",
      addedCount,
      totalCount: existingSet.size
    }
  } catch (error: any) {
    console.error("[Background] handleRecordShippedStockOrder 发生错误:", error)
    throw error
  }
}

/**
 * 获取所有已发货的备货单号列表
 * @returns 已发货备货单号数组
 */
async function getShippedStockOrders(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get("shippedStockOrders")
    const shippedOrders = result.shippedStockOrders || []
    console.log(
      `[Background] 获取已发货备货单号，共 ${shippedOrders.length} 个`
    )
    return shippedOrders
  } catch (error: any) {
    console.error("[Background] getShippedStockOrders 发生错误:", error)
    throw error
  }
}

/**
 * 检查指定备货单号是否已发货
 * @param data 包含备货单号或备货单号数组的数据
 * @returns 检查结果对象
 */
async function checkStockOrderShipped(data: {
  stockOrderNos: string[] | string // 备货单号数组或单个备货单号
}): Promise<{
  shipped: string[] // 已发货的备货单号
  notShipped: string[] // 未发货的备货单号
}> {
  try {
    // 处理备货单号，支持数组和单个字符串
    const orderNos = Array.isArray(data.stockOrderNos)
      ? data.stockOrderNos
      : [data.stockOrderNos]

    // 获取所有已发货的备货单号
    const shippedOrders = await getShippedStockOrders()
    const shippedSet = new Set(shippedOrders)

    // 分类检查
    const shipped: string[] = []
    const notShipped: string[] = []

    for (const orderNo of orderNos) {
      if (shippedSet.has(orderNo)) {
        shipped.push(orderNo)
      } else {
        notShipped.push(orderNo)
      }
    }

    console.log(
      `[Background] 检查备货单号发货状态: 已发货 ${shipped.length} 个, 未发货 ${notShipped.length} 个`
    )

    return {
      shipped,
      notShipped
    }
  } catch (error: any) {
    console.error("[Background] checkStockOrderShipped 发生错误:", error)
    throw error
  }
}

/**
 * 清除所有已发货记录
 * @returns 清除结果
 */
async function clearShippedStockOrders(): Promise<{
  success: boolean
  message: string
  clearedCount: number
}> {
  try {
    // 获取现有的记录数量
    const existingData = await chrome.storage.local.get("shippedStockOrders")
    const count = (existingData.shippedStockOrders || []).length

    // 清除记录
    await chrome.storage.local.remove("shippedStockOrders")

    console.log(`[Background] 已清除 ${count} 个已发货备货单号记录`)

    return {
      success: true,
      message: "已清除所有已发货记录",
      clearedCount: count
    }
  } catch (error: any) {
    console.error("[Background] clearShippedStockOrders 发生错误:", error)
    throw error
  }
}

/**
 * 处理打印后刷新页面继续执行
 * 监听页面刷新完成事件，页面刷新后继续执行批量装箱发货等后续步骤
 * 通过storage标志区分系统刷新和用户主动刷新
 * @param tabId 当前标签页ID
 * @param data 包含刷新ID、仓库、发货方式和URL的数据
 */
async function handleContinueAfterPrintRefresh(
  tabId: number | undefined,
  data: {
    refreshId: string
    warehouse: string
    shippingMethod: string
    url: string
  }
) {
  try {
    if (!tabId) {
      throw new Error("无法获取标签页ID")
    }

    console.log(
      `[Background] 收到打印后刷新继续执行通知，标签页ID: ${tabId}, 刷新ID: ${data.refreshId}`
    )

    // 更新storage中的标志，记录tabId
    const refreshFlag = await chrome.storage.local.get(
      "shouldContinueAfterRefresh"
    )
    if (
      refreshFlag.shouldContinueAfterRefresh &&
      refreshFlag.shouldContinueAfterRefresh.refreshId === data.refreshId
    ) {
      await chrome.storage.local.set({
        shouldContinueAfterRefresh: {
          ...refreshFlag.shouldContinueAfterRefresh,
          tabId: tabId
        }
      })
      console.log(`[Background] 已更新刷新标志，记录tabId: ${tabId}`)
    } else {
      console.warn(`[Background] 未找到匹配的刷新标志，可能已被清除`)
      return {
        success: false,
        message: "未找到匹配的刷新标志",
        tabId
      }
    }

    console.log(`[Background] 开始监听页面刷新完成事件...`)

    // 监听标签页更新事件，等待页面刷新完成
    chrome.tabs.onUpdated.addListener(
      function listener(tabIdListener, changeInfo, tab) {
        // 检查是否是目标标签页
        if (tabIdListener !== tabId) {
          return
        }

        // 检查URL是否匹配shipping-list页面
        const currentUrl = tab.url || ""
        const isShippingListPage =
          currentUrl.includes("seller.kuajingmaihuo.com") &&
          currentUrl.includes("/main/order-manager/shipping-list")

        // 当页面加载完成且URL匹配时
        if (changeInfo.status === "complete" && isShippingListPage) {
          console.log(
            `[Background] 检测到shipping-list页面刷新完成，URL: ${currentUrl}`
          )

          // 检查是否是系统触发的刷新（通过storage标志判断）
          chrome.storage.local
            .get("shouldContinueAfterRefresh")
            .then((result) => {
              const flag = result.shouldContinueAfterRefresh

              // 检查标志是否存在且匹配
              if (
                !flag ||
                flag.refreshId !== data.refreshId ||
                flag.tabId !== tabId
              ) {
                console.log("[Background] 这是用户主动刷新，不执行后续步骤")
                // 移除监听器
                chrome.tabs.onUpdated.removeListener(listener)
                return
              }

              // 清除标志，避免重复执行
              chrome.storage.local.remove("shouldContinueAfterRefresh")
              console.log("[Background] 已清除刷新标志，确认为系统刷新")

              // 移除监听器，避免重复执行
              chrome.tabs.onUpdated.removeListener(listener)

              // 等待3秒后，继续执行后续步骤（批量装箱发货等）
              setTimeout(async () => {
                try {
                  console.log(
                    "[Background] 页面刷新完成（系统刷新），等待3秒后继续执行后续步骤"
                  )

                  // 向content script发送继续执行的消息
                  const response = await chrome.tabs.sendMessage(tabId, {
                    type: "CONTINUE_SHIPMENT_STEPS",
                    data: {
                      warehouse: data.warehouse,
                      shippingMethod: data.shippingMethod
                    }
                  })

                  console.log("[Background] Content script响应:", response)
                } catch (error: any) {
                  console.error("[Background] 发送继续执行消息失败:", error)
                  // 如果content script还未注入，可以尝试重试
                  if (
                    error.message?.includes("Could not establish connection")
                  ) {
                    console.log(
                      "[Background] Content script可能还未注入，将在1秒后重试..."
                    )
                    setTimeout(async () => {
                      try {
                        await chrome.tabs.sendMessage(tabId, {
                          type: "CONTINUE_SHIPMENT_STEPS",
                          data: {
                            warehouse: data.warehouse,
                            shippingMethod: data.shippingMethod
                          }
                        })
                      } catch (retryError) {
                        console.error(
                          "[Background] 重试发送继续执行消息失败:",
                          retryError
                        )
                      }
                    }, 1000)
                  }
                }
              }, 3000) // 等待3秒
            })
        }
      }
    )

    return {
      success: true,
      message: "已开始监听页面刷新，页面刷新完成后等待3秒继续执行后续步骤",
      tabId
    }
  } catch (error: any) {
    console.error(
      "[Background] handleContinueAfterPrintRefresh 发生错误:",
      error
    )
    throw error
  }
}

/**
 * 处理跳转到shipping-list页面并发送装箱事件
 * @param tabId 当前标签页ID
 * @param data 包含URL的数据
 */
async function handleNavigateToShippingList(
  tabId: number | undefined,
  data: { url: string }
) {
  try {
    if (!tabId) {
      throw new Error("无法获取标签页ID")
    }

    console.log(`[Background] 准备跳转到shipping-list页面: ${data.url}`)

    // 跳转到shipping-list页面
    await chrome.tabs.update(tabId, {
      url: data.url
    })

    console.log(`[Background] 已跳转到shipping-list页面，标签页ID: ${tabId}`)

    // 监听标签页更新事件，等待页面加载完成
    chrome.tabs.onUpdated.addListener(
      function listener(tabIdListener, changeInfo, tab) {
        // 检查是否是目标标签页
        if (tabIdListener !== tabId) {
          return
        }

        // 检查URL是否匹配shipping-list页面
        const currentUrl = tab.url || ""
        const isShippingListPage =
          currentUrl.includes("seller.kuajingmaihuo.com") &&
          currentUrl.includes("/main/order-manager/shipping-list")

        // 当页面加载完成且URL匹配时
        if (changeInfo.status === "complete" && isShippingListPage) {
          console.log(
            `[Background] 检测到shipping-list页面加载完成，URL: ${currentUrl}`
          )

          // 移除监听器，避免重复执行
          chrome.tabs.onUpdated.removeListener(listener)

          // 等待3秒后，发送装箱事件
          setTimeout(async () => {
            try {
              console.log("[Background] 等待3秒后，发送装箱事件")

              // 获取用户配置
              const config = await getUserConfig()

              // 向content script发送装箱事件消息
              const response = await chrome.tabs.sendMessage(tabId, {
                type: "START_BOXING_TASK",
                data: {
                  warehouse: config?.warehouse || "",
                  shippingMethod: config?.shippingMethod || ""
                }
              })

              console.log("[Background] Content script响应:", response)
            } catch (error: any) {
              console.error("[Background] 发送装箱事件失败:", error)
              // 如果content script还未注入，可以尝试重试
              if (error.message?.includes("Could not establish connection")) {
                console.log(
                  "[Background] Content script可能还未注入，将在1秒后重试..."
                )
                setTimeout(async () => {
                  try {
                    const config = await getUserConfig()
                    await chrome.tabs.sendMessage(tabId, {
                      type: "START_BOXING_TASK",
                      data: {
                        warehouse: config?.warehouse || "",
                        shippingMethod: config?.shippingMethod || ""
                      }
                    })
                  } catch (retryError) {
                    console.error(
                      "[Background] 重试发送装箱事件失败:",
                      retryError
                    )
                  }
                }, 1000)
              }
            }
          }, 3000) // 等待3秒
        }
      }
    )

    return {
      success: true,
      message: "已跳转到shipping-list页面，等待3秒后发送装箱事件",
      tabId
    }
  } catch (error: any) {
    console.error("[Background] handleNavigateToShippingList 发生错误:", error)
    throw error
  }
}

/**
 * 处理PDF生成完成的通知
 * 记录PDF生成信息，可用于后续处理
 * @param tabId 标签页ID
 * @param data 包含PDF文件名和时间戳的数据
 */
async function handlePDFGenerated(
  tabId: number | undefined,
  data: {
    fileName: string
    timestamp: number
  }
): Promise<{
  success: boolean
  message: string
  fileName: string
}> {
  try {
    console.log(
      `[Background] 收到PDF生成通知，标签页ID: ${tabId}, 文件名: ${data.fileName}`
    )

    // 保存PDF生成记录到storage（可选）
    const existingRecords = await chrome.storage.local.get("generatedPDFs")
    const pdfRecords = existingRecords.generatedPDFs || []

    pdfRecords.push({
      fileName: data.fileName,
      timestamp: data.timestamp,
      tabId: tabId
    })

    // 只保留最近100条记录
    if (pdfRecords.length > 100) {
      pdfRecords.shift()
    }

    await chrome.storage.local.set({
      generatedPDFs: pdfRecords
    })

    console.log(`[Background] PDF生成记录已保存，文件名: ${data.fileName}`)

    return {
      success: true,
      message: "PDF生成记录已保存",
      fileName: data.fileName
    }
  } catch (error: any) {
    console.error("[Background] handlePDFGenerated 发生错误:", error)
    throw error
  }
}

/**
 * 保存批量打印数据
 * 将content script拦截的打印接口数据保存到storage
 * @param data 包含打印数据和时间戳的数据
 */
async function handleSaveBatchPrintData(data: {
  printData: any
  timestamp: number
}): Promise<{
  success: boolean
  message: string
}> {
  try {
    console.log("[Background] 保存批量打印数据:", data)

    // 保存到chrome.storage
    await chrome.storage.local.set({
      batchPrintData: {
        printData: data.printData,
        timestamp: data.timestamp
      }
    })

    console.log("[Background] 批量打印数据已保存")

    return {
      success: true,
      message: "批量打印数据已保存"
    }
  } catch (error: any) {
    console.error("[Background] handleSaveBatchPrintData 发生错误:", error)
    throw error
  }
}

/**
 * 获取批量打印数据
 * 从storage中获取保存的打印数据
 * @returns 打印数据对象或null
 */
async function getBatchPrintData(): Promise<any | null> {
  try {
    const result = await chrome.storage.local.get("batchPrintData")
    const batchPrintData = result.batchPrintData || null

    if (batchPrintData) {
      console.log(
        "[Background] 获取到批量打印数据，时间戳:",
        batchPrintData.timestamp
      )
    } else {
      console.log("[Background] 未找到批量打印数据")
    }

    return batchPrintData
  } catch (error: any) {
    console.error("[Background] getBatchPrintData 发生错误:", error)
    throw error
  }
}

/**
 * 转发消息到当前活动标签页的content script，带重试机制
 * @param messageType 消息类型
 * @param data 消息数据
 * @returns content script的响应
 */
async function handleForwardToActiveTab(
  messageType: string,
  data: any
): Promise<any> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tabs || tabs.length === 0) {
      throw new Error("未找到活动标签页")
    }

    const activeTab = tabs[0]

    if (!activeTab.id) {
      throw new Error("活动标签页ID无效")
    }

    const currentUrl = activeTab.url || ""
    const isTemuSite = currentUrl.includes("agentseller.temu.com")
    const isKuajingSite = currentUrl.includes("seller.kuajingmaihuo.com")

    if (messageType === "START_SHIPMENT_STEPS_DIRECTLY") {
      if (!isTemuSite && !isKuajingSite) {
        throw new Error("请在 Temu 或 抖音跨境商城 页面上使用此功能")
      }
      if (
        isKuajingSite &&
        !currentUrl.includes("/main/order-manager/shipping-list")
      ) {
        throw new Error("请先打开发货单列表页面（shipping-list）")
      }
    }

    if (messageType === "CLICK_WAREHOUSE_RECEIPT_TAB") {
      if (
        !currentUrl.includes("seller.kuajingmaihuo.com") ||
        !currentUrl.includes("/main/order-manager/shipping-list")
      ) {
        throw new Error("请先打开发货单列表页面（shipping-list）")
      }
    }

    console.log(`[Background] 转发消息到标签页 ${activeTab.id}: ${messageType}`)

    const maxRetries = 5
    const retryDelay = 1000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(activeTab.id, {
          type: messageType,
          data: data
        })
        console.log(`[Background] 收到标签页响应:`, response)
        return response
      } catch (sendMessageError: any) {
        const errorMessage = sendMessageError?.message || ""
        const isConnectionError =
          errorMessage.includes("Could not establish connection") ||
          errorMessage.includes("Receiving end does not exist") ||
          errorMessage.includes("Extension context invalidated")

        if (isConnectionError && attempt < maxRetries) {
          console.warn(
            `[Background] 消息发送失败 (第 ${attempt} 次)，${retryDelay}ms 后重试...`
          )
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
        } else {
          throw sendMessageError
        }
      }
    }

    return null
  } catch (error: any) {
    console.error(
      `[Background] 转发消息到content script失败 (${messageType}):`,
      error
    )
    throw error
  }
}
