/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

import type { PlasmoCSConfig } from "plasmo"
import React from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"

import { PrintLabel } from "./components/PrintLabel"
import { startBatchTasks, startShippingDeskTasks } from "./pages/batch-shipment"
import {
  continueShipmentSteps,
  executeShipmentStepsDirectly,
  renderPrintLabelAndGeneratePDF
} from "./pages/print-utils"
import { executeShipmentProcess } from "./pages/shipping-process"
import { startBatchDownloadWithoutRefresh } from "./pages/warehouse-receipt"
import { findButtonByText, findDom, sleep } from "./utils/dom"

export const config: PlasmoCSConfig = {
  run_at: "document_end",
  matches: [
    "https://seller.kuajingmaihuo.com/*",
    "https://agentseller.temu.com/*",
    "<all_urls>"
  ]
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

if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Content] 收到来自popup/background的消息:", message.type)

    if (message.type === "START_BATCH_SHIPMENT") {
      const executeTask = () => {
        startBatchTasks(message.data)
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "START_SHIPPING_DESK_TASK") {
      const executeTask = () => {
        startShippingDeskTasks(message.data)
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "START_BOXING_TASK") {
      const executeTask = () => {
        executeShipmentProcess(
          message.data.warehouse,
          message.data.shippingMethod
        )
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "START_SHIPMENT_STEPS_DIRECTLY") {
      const executeTask = () => {
        executeShipmentStepsDirectly(message.data)
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "CONTINUE_SHIPMENT_STEPS") {
      const executeTask = () => {
        continueShipmentSteps(message.data)
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "CLICK_WAREHOUSE_RECEIPT_TAB") {
      const executeTask = () => {
        startBatchDownloadWithoutRefresh()
      }

      if (document.readyState === "complete") {
        executeTask()
      } else {
        window.addEventListener("load", () => {
          setViewportSize()
          setTimeout(() => executeTask(), 500)
        })
      }
      sendResponse({ success: true })
      return true
    }

    if (message.type === "TEST_PRINT_BARCODE") {
      async function testPrintBarcode() {
        try {
          const printBarcodeLink = (await findDom(
            'a[data-tracking-id="McK-QLGrp_JyHPm-"]',
            { timeout: 10000, interval: 200 }
          )) as HTMLElement
          if (!printBarcodeLink) {
            console.error("[Content] 未找到'打印商品条码'链接")
            sendResponse({ success: false, error: "未找到'打印商品条码'链接" })
            return
          }

          console.log("[Content] 点击'打印商品条码'链接")
          printBarcodeLink.click()
          await sleep(2000)

          const printButton = await findButtonByText(
            'div[data-testid="bgb-pc-show-drawer-body"] button[data-testid="beast-core-button"]',
            "打印",
            { timeout: 5000, interval: 200 }
          )
          if (!printButton) {
            console.error("[Content] 未找到'打印'按钮")
            sendResponse({ success: false, error: "未找到'打印'按钮" })
            return
          }

          console.log("[Content] 点击'打印'按钮", printButton)

          printButton.click()

          await sleep(3000)
          console.log("[Content] 打印操作完成，检查是否有系统弹窗")
          sendResponse({ success: true })
        } catch (error: any) {
          console.error("[Content] 测试打印条码失败:", error)
          sendResponse({ success: false, error: error?.message || "未知错误" })
        }
      }

      testPrintBarcode()
      return true
    }

    return false
  })
}

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
