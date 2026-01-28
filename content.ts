/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

import React from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"

import { PrintLabel } from "./components/PrintLabel"
import { startBatchTasks, startShippingDeskTasks } from "./pages/batch-shipment"
import {
  continueShipmentSteps,
  executeShipmentStepsDirectly,
  interceptPrintAPI,
  renderPrintLabelAndGeneratePDF
} from "./pages/print-utils"
import { executeShipmentProcess } from "./pages/shipping-process"
import {
  clickWarehouseReceiptTab,
  processNextRow,
  startBatchDownload
} from "./pages/warehouse-receipt"
import { findDom, sleep } from "./utils/dom"

/**
 * 设置插件运行状态
 * 通知injected script更新插件运行状态，决定是否拦截window.print()
 * @param status true表示插件运行中，false表示插件已停止
 */
export function setPluginRunningStatus(status: boolean): void {
  window.postMessage(
    {
      type: "SET_PLUGIN_RUNNING_STATUS",
      source: "content-script",
      status: status
    },
    "*"
  )
  console.log("[Content] 已设置插件运行状态:", status ? "运行中" : "已停止")
}

// 设置视口大小为1920x1080的效果
// 通过设置meta viewport标签和CSS来实现
function setViewportSize() {
  // 等待DOM加载完成
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setViewportSize)
    return
  }

  // 移除现有的viewport meta标签
  const existingViewport = document.querySelector('meta[name="viewport"]')
  if (existingViewport) {
    existingViewport.remove()
  }

  // 创建新的viewport meta标签，设置宽度为1920
  const viewport = document.createElement("meta")
  viewport.name = "viewport"
  viewport.content = "width=1920, initial-scale=1.0"
  document.head.appendChild(viewport)

  // 设置body的宽度和高度
  const style = document.createElement("style")
  style.textContent = `
    body {
      min-width: 1920px;
      min-height: 1080px;
      overflow-x: auto;
    }
  `
  document.head.appendChild(style)
}

/**
 * 检查是否有正在进行的批量下载任务
 * 页面加载时检查是否有保存的批量下载数据，如果有则继续处理下一行
 */
async function checkAndContinueBatchDownload() {
  try {
    console.log(
      "[Content] ========== 检查是否有正在进行的批量下载任务 =========="
    )

    // 从storage获取保存的批量下载数据
    const storedData = await chrome.storage.local.get("batchDownloadData")

    if (!storedData || !storedData.batchDownloadData) {
      console.log("[Content] 未找到正在进行的批量下载任务")
      return
    }

    const batchData = storedData.batchDownloadData
    console.log(
      "[Content] 找到批量下载数据，共",
      Object.keys(batchData.tableData).length,
      "行"
    )

    // 检查当前URL是否匹配
    const currentUrl = window.location.href
    if (currentUrl !== batchData.currentUrl) {
      console.log("[Content] 当前URL不匹配，停止批量下载")
      await chrome.storage.local.remove("batchDownloadData")
      return
    }

    // 设置插件运行状态为true
    setPluginRunningStatus(true)

    // 等待页面加载
    await sleep(2000)

    // 先点击"待仓库收货"标签切换页面（刷新后需要重新切换）
    console.log("[Content] 刷新后重新点击待仓库收货标签...")
    const tabLabels = document.querySelectorAll(
      'div[data-testid="beast-core-tab-itemLabel"]'
    )

    let targetTab: HTMLElement | null = null
    for (const label of Array.from(tabLabels)) {
      const labelText = label.textContent?.trim() || ""
      if (labelText === "待仓库收货") {
        const wrapper = label.closest(
          'div[data-testid="beast-core-tab-itemLabel-wrapper"]'
        )
        if (wrapper) {
          targetTab = wrapper as HTMLElement
          break
        }
      }
    }

    if (targetTab) {
      const isActive = Array.from(targetTab.classList).some((className) =>
        className.includes("TAB_active")
      )
      if (isActive) {
        console.log("[Content] 待仓库收货标签已经激活，无需点击")
      } else {
        console.log("[Content] 点击待仓库收货标签...")
        targetTab.click()
        console.log("[Content] 已点击待仓库收货标签")
      }
    } else {
      console.warn("[Content] 未找到待仓库收货标签，但继续执行")
    }

    // 等待表格加载
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (paginationElement) {
      console.log("[Content] 表格已加载完成")
    } else {
      console.warn("[Content] 表格可能未完全加载，但继续执行")
    }

    await sleep(2000)

    // 查找下一个未处理的备货单号
    if (!batchData || !batchData.tableData) {
      console.log("[Content] 批量下载数据不存在，任务结束")
      setPluginRunningStatus(false)
      return
    }

    // 查找第一个未处理的备货单号
    let nextStockOrderNo: string | null = null
    const stockOrderNos = Object.keys(batchData.tableData)
    for (const no of stockOrderNos) {
      if (!batchData.tableData[no].processed) {
        nextStockOrderNo = no
        break
      }
    }

    if (!nextStockOrderNo) {
      console.log("[Content] 所有行已处理完成，批量下载结束")
      await chrome.storage.local.remove("batchDownloadData")
      setPluginRunningStatus(false)
      return
    }

    const currentIndex = stockOrderNos.indexOf(nextStockOrderNo)
    console.log(
      `[Content] 继续处理第 ${currentIndex + 1} 行，备货单号: ${nextStockOrderNo}...`
    )

    // 处理该行并刷新
    const result = await processNextRow(nextStockOrderNo)

    if (result) {
      console.log(
        `[Content] 备货单号 ${nextStockOrderNo}（第 ${currentIndex + 1} 行）处理完成`
      )
    } else {
      console.log(
        `[Content] 备货单号 ${nextStockOrderNo}（第 ${currentIndex + 1} 行）处理失败`
      )
    }

    setPluginRunningStatus(false)
  } catch (error: any) {
    console.error("[Content] 检查并继续批量下载时发生错误:", error)
    setPluginRunningStatus(false)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理开始批量发货的消息（temu备货单页面）
  if (message.type === "START_BATCH_SHIPMENT") {
    console.log("[Content] 收到START_BATCH_SHIPMENT消息:", message.data)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      startBatchTasks(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startBatchTasks(message.data)
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到批量发货任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理开始发货台任务的消息（发货台页面）
  if (message.type === "START_SHIPPING_DESK_TASK") {
    console.log("[Content] 收到START_SHIPPING_DESK_TASK消息:", message.data)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      startShippingDeskTasks(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startShippingDeskTasks(message.data)
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到发货台任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理开始装箱任务的消息（shipping-list页面）
  if (message.type === "START_BOXING_TASK") {
    console.log("[Content] 收到START_BOXING_TASK消息:", message.data)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      executeShipmentProcess(
        message.data.warehouse,
        message.data.shippingMethod
      )
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          executeShipmentProcess(
            message.data.warehouse,
            message.data.shippingMethod
          )
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到装箱任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理直接执行发货步骤的消息（开发阶段测试用）
  // 注意：这是开发阶段的功能，正式版本应该从第一步开始执行完整流程
  if (message.type === "START_SHIPMENT_STEPS_DIRECTLY") {
    console.log(
      "[Content] 收到START_SHIPMENT_STEPS_DIRECTLY消息（开发测试）:",
      message.data
    )

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      executeShipmentStepsDirectly(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          executeShipmentStepsDirectly(message.data)
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到直接执行发货步骤任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理继续执行发货步骤的消息（打印后刷新页面继续）
  if (message.type === "CONTINUE_SHIPMENT_STEPS") {
    console.log("[Content] 收到CONTINUE_SHIPMENT_STEPS消息:", message.data)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      continueShipmentSteps(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          continueShipmentSteps(message.data)
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到继续执行发货步骤任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理打印接口调用的通知
  if (message.type === "PRINT_API_CALLED") {
    console.log("[Content] 收到打印接口调用通知:", message.data)
    // 打印接口拦截器会自动处理
    sendResponse({ success: true, message: "已收到打印接口调用通知" })
    return true
  }

  // 处理点击待仓库收货标签的消息
  if (message.type === "CLICK_WAREHOUSE_RECEIPT_TAB") {
    console.log("[Content] 收到CLICK_WAREHOUSE_RECEIPT_TAB消息")

    // 设置插件运行状态为true
    setPluginRunningStatus(true)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      clickWarehouseReceiptTab().finally(() => {
        // 任务完成后，设置插件运行状态为false
        setPluginRunningStatus(false)
      })
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          clickWarehouseReceiptTab().finally(() => {
            // 任务完成后，设置插件运行状态为false
            setPluginRunningStatus(false)
          })
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到点击待仓库收货标签任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理开始批量下载的消息
  if (message.type === "START_BATCH_DOWNLOAD") {
    console.log("[Content] 收到START_BATCH_DOWNLOAD消息")

    // 设置插件运行状态为true
    setPluginRunningStatus(true)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      startBatchDownload().finally(() => {
        // 任务完成后，设置插件运行状态为false
        setPluginRunningStatus(false)
      })
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startBatchDownload().finally(() => {
            // 任务完成后，设置插件运行状态为false
            setPluginRunningStatus(false)
          })
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到开始批量下载任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理批量下载下一行的消息
  if (message.type === "PROCESS_NEXT_ROW") {
    console.log("[Content] 收到PROCESS_NEXT_ROW消息:", message.data)

    // 设置插件运行状态为true
    setPluginRunningStatus(true)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      processNextRow(message.data.rowIndex).finally(() => {
        // 任务完成后，设置插件运行状态为false
        setPluginRunningStatus(false)
      })
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          processNextRow(message.data.rowIndex).finally(() => {
            // 任务完成后，设置插件运行状态为false
            setPluginRunningStatus(false)
          })
        }, 500)
      })
    }

    // 发送响应
    sendResponse({ success: true, message: "已收到处理下一行任务" })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理执行行处理的消息
  if (message.type === "EXECUTE_PROCESS_ROW") {
    console.log("[Content] 收到EXECUTE_PROCESS_ROW消息:", message.data)

    // 设置插件运行状态为true
    setPluginRunningStatus(true)

    // 确保页面已加载完成后再执行
    if (document.readyState === "complete") {
      // 页面已完全加载，直接执行
      processNextRow(message.data.stockOrderNo)
        .then((result) => {
          // 任务完成后，设置插件运行状态为false
          setPluginRunningStatus(false)
          sendResponse({ success: result, message: "行处理完成" })
        })
        .catch((error) => {
          // 任务完成后，设置插件运行状态为false
          setPluginRunningStatus(false)
          sendResponse({ success: false, message: "行处理失败" })
        })
    } else {
      // 等待页面完全加载
      window.addEventListener("load", () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          processNextRow(message.data.stockOrderNo)
            .then((result) => {
              // 任务完成后，设置插件运行状态为false
              setPluginRunningStatus(false)
              sendResponse({ success: result, message: "行处理完成" })
            })
            .catch((error) => {
              // 任务完成后，设置插件运行状态为false
              setPluginRunningStatus(false)
              sendResponse({ success: false, message: "行处理失败" })
            })
        }, 500)
      })
    }

    return true // 保持消息通道开放以支持异步响应
  }

  return false
})

// 只在目标网站执行
if (window.location.href.includes("agentseller.temu.com")) {
  // 立即设置视口大小
  setViewportSize()

  // 页面加载完成后再次设置视口大小（确保生效）
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => {
      setViewportSize()
    })
  }
}

// 发货台页面
if (window.location.href.includes("seller.kuajingmaihuo.com")) {
  // 立即设置视口大小
  setViewportSize()

  // 页面加载完成后再次设置视口大小（确保生效）
  if (document.readyState !== "complete") {
    window.addEventListener("load", () => {
      setViewportSize()
    })
  }
}

/**
 * Content Script 初始化
 * 在页面加载时自动注入打印接口拦截脚本
 */
;(function initContentScript() {
  console.log("[Content] Content Script 初始化...")

  // 设置视口大小
  setViewportSize()

  // 在页面加载完成后注入打印接口拦截脚本
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log("[Content] DOM加载完成，开始注入打印接口拦截脚本...")
      interceptPrintAPI().catch((error) => {
        console.error("[Content] 初始化注入脚本失败:", error)
      })
    })
  } else {
    // 如果页面已经加载完成，立即注入
    console.log("[Content] 页面已加载，立即注入打印接口拦截脚本...")
    interceptPrintAPI().catch((error) => {
      console.error("[Content] 初始化注入脚本失败:", error)
    })
  }

  // 在页面加载完成后检查是否有正在进行的批量下载任务
  if (document.readyState === "loading") {
    window.addEventListener("load", () => {
      console.log("[Content] 页面加载完成，检查批量下载任务...")
      setTimeout(() => {
        checkAndContinueBatchDownload().catch((error) => {
          console.error("[Content] 检查批量下载任务失败:", error)
        })
      }, 1000)
    })
  } else {
    // 如果页面已经加载完成，立即检查
    console.log("[Content] 页面已加载，立即检查批量下载任务...")
    setTimeout(() => {
      checkAndContinueBatchDownload().catch((error) => {
        console.error("[Content] 检查批量下载任务失败:", error)
      })
    }, 1000)
  }

  console.log("[Content] Content Script 初始化完成")
})()
