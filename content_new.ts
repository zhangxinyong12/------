/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

// @ts-ignore - html2canvas和jspdf的类型定义可能不完整
import html2canvas from "html2canvas"
// @ts-ignore - html2canvas和jspdf的类型定义可能不完整
import { jsPDF } from "jspdf"
import React from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"

import { PrintLabel } from "./components/PrintLabel"
import { findDom } from "./utils/dom"
import { clickWarehouseReceiptTab } from "./pages/warehouse-receipt"
import { startBatchTasks, startShippingDeskTasks } from "./pages/batch-shipment"
import { interceptPrintAPI, renderPrintLabelAndGeneratePDF, clickBatchPrintLabelButton, clickBatchBoxingShipButton, continueShipmentSteps, executeShipmentStepsDirectly } from "./pages/print-utils"
import { executeShipmentProcess } from "./pages/shipping-process"

/**
 * Sleep函数
 * 等待指定的毫秒数
 * @param ms 等待的毫秒数
 * @returns Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 通过分页数据判断是否有数据
 * 解析分页元素中的"共有 X 条"文本，判断数据条数
 * @returns 如果有数据返回true，否则返回false
 */
function hasDataFromPagination(): boolean {
  try {
    // 查找分页元素
    const paginationElement = document.querySelector(
      'ul[data-testid="beast-core-pagination"]'
    )

    if (!paginationElement) {
      console.warn("[Content] 未找到分页元素，无法判断数据")
      return false
    }

    // 查找显示总数的元素
    const totalTextElement = paginationElement.querySelector(
      ".PGT_totalText_5-120-1"
    )

    if (!totalTextElement) {
      console.warn("[Content] 未找到分页总数文本元素，无法判断数据")
      return false
    }

    // 获取文本内容，例如"共有 9 条"
    const totalText = totalTextElement.textContent?.trim() || ""
    console.log("[Content] 分页总数文本:", totalText)

    // 使用正则表达式提取数字
    const match = totalText.match(/共有\s*(\d+)\s*条/)

    if (!match || match.length < 2) {
      console.warn("[Content] 无法从分页文本中提取数据条数:", totalText)
      return false
    }

    const totalCount = parseInt(match[1], 10)
    console.log("[Content] 解析到的数据条数:", totalCount)

    // 如果数据条数大于0，表示有数据
    return totalCount > 0
  } catch (error: any) {
    console.error("[Content] 检查分页数据时发生错误:", error)
    return false
  }
}

/**
 * 查找包含特定文本的按钮
 * 在指定选择器匹配的所有元素中，查找文本内容包含目标文本的元素
 * @param selector CSS选择器
 * @param text 目标文本
 * @param options 配置选项
 * @returns 找到的元素，如果超时则返回null
 */
async function findButtonByText(
  selector: string,
  text: string,
  options: {
    timeout?: number
    interval?: number
    parent?: Element | Document
  } = {}
): Promise<HTMLElement | null> {
  const { timeout = 10000, interval = 200, parent = document } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkElement = () => {
      // 查找所有匹配选择器的元素
      const elements = (parent as Element | Document).querySelectorAll(selector)

      // 遍历所有元素，查找文本内容包含目标文本的元素
      for (const element of Array.from(elements)) {
        const elementText = element.textContent?.trim() || ""
        if (elementText.includes(text)) {
          resolve(element as HTMLElement)
          return
        }
      }

      // 检查是否超时
      const elapsed = Date.now() - startTime
      if (elapsed >= timeout) {
        // 超时，返回null
        resolve(null)
        return
      }

      // 未超时，继续等待
      setTimeout(checkElement, interval)
    }

    // 开始检查
    checkElement()
  })
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
