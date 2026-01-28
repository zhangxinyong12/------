/**
 * 待仓库收货页面逻辑
 * 处理待仓库收货页面的操作，包括点击标签、打印商品打包标签等
 */

import { setPluginRunningStatus } from "../content"
import { findButtonByText, findDom, sleep } from "../utils/dom"

function extractStockOrderNoFromRow(row: HTMLElement): string {
  try {
    const stockOrderDivs = row.querySelectorAll(
      'div[data-testid="beast-core-box"]'
    )
    for (const div of Array.from(stockOrderDivs)) {
      const text = div.textContent || ""
      if (text.includes("备货单号：")) {
        const stockOrderLink = div.querySelector(
          'a[data-testid="beast-core-button-link"]'
        )
        if (stockOrderLink) {
          const stockOrderSpan = stockOrderLink.querySelector("span")
          const stockOrderNo = stockOrderSpan?.textContent?.trim() || ""
          if (stockOrderNo) {
            return stockOrderNo
          }
        }
      }
    }
    return ""
  } catch (error: any) {
    console.error("[WarehouseReceipt] 提取备货单号时发生错误:", error)
    return ""
  }
}

async function processRow(
  row: HTMLElement,
  rowIndex: number,
  stockOrderNo: string
): Promise<boolean> {
  try {
    console.log(
      `[WarehouseReceipt] ========== 处理备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行） ==========`
    )

    const printLinks = row.querySelectorAll(
      'a[data-testid="beast-core-button-link"]'
    )
    let firstPrintLink: HTMLElement | null = null

    for (const link of Array.from(printLinks)) {
      const linkText = link.textContent?.trim() || ""
      if (linkText === "打印商品打包标签") {
        firstPrintLink = link as HTMLElement
        console.log(
          `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）找到第一个"打印商品打包标签"链接`
        )
        break
      }
    }

    if (!firstPrintLink) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）未找到"打印商品打包标签"链接`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] 点击备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）的打印链接...`
    )
    firstPrintLink.click()
    await sleep(4000)

    const modalWrapper = await findDom(
      'div[data-testid="beast-core-modal-innerWrapper"]',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!modalWrapper) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）点击后未出现弹窗`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）弹窗已出现`
    )
    await sleep(3000)

    const modalButtons = modalWrapper.querySelectorAll(
      'button[data-testid="beast-core-button"]'
    )

    if (modalButtons.length === 0) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）弹窗中未找到按钮`
      )
      return false
    }

    const firstButton = modalButtons[0] as HTMLElement
    const buttonText = firstButton.textContent?.trim() || ""
    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）找到弹窗按钮: "${buttonText}"，准备点击...`
    )
    firstButton.click()
    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）已点击弹窗按钮`
    )
    await sleep(4000)

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）等待打印iframe出现...`
    )

    let iprintIframe: HTMLIFrameElement | null = null
    const maxWaitTime = 15000
    const checkInterval = 200
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      iprintIframe = document.querySelector(
        "iframe.iprint"
      ) as HTMLIFrameElement
      if (iprintIframe) {
        console.log(
          `[WarehouseReceipt] ✅ 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）找到iprint iframe（耗时: ${
            Date.now() - startTime
          }ms）`
        )
        break
      }
      await sleep(checkInterval)
    }

    if (!iprintIframe) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）未找到iprint iframe`
      )
      return false
    }

    const filename = `${stockOrderNo}.pdf`

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）开始下载PDF: ${filename}`
    )

    const a = document.createElement("a")
    a.href = iprintIframe.src
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    console.log(
      `[WarehouseReceipt] ✅ 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）已开始下载PDF: ${filename}`
    )

    await sleep(3000)

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）销毁iframe...`
    )
    iprintIframe.remove()
    console.log(
      `[WarehouseReceipt] ✅ 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）iframe已销毁`
    )

    console.log(
      `[WarehouseReceipt] ========== 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）处理完成 ==========`
    )
    return true
  } catch (error: any) {
    console.error(
      `[WarehouseReceipt] 处理备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）时发生错误:`,
      error
    )
    return false
  }
}

async function processRowAndRefresh(stockOrderNo: string): Promise<boolean> {
  try {
    console.log(
      `[WarehouseReceipt] ========== 处理备货单号 ${stockOrderNo} 并刷新 ==========`
    )

    const tableRows = document.querySelectorAll(
      'tr[data-testid="beast-core-table-body-tr"]'
    )

    let targetRow: HTMLElement | null = null
    let targetIndex = -1

    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i] as HTMLElement
      const rowStockOrderNo = extractStockOrderNoFromRow(row)

      if (rowStockOrderNo === stockOrderNo) {
        targetRow = row
        targetIndex = i
        console.log(
          `[WarehouseReceipt] 在表格第 ${i + 1} 行找到备货单号 ${stockOrderNo}`
        )
        break
      }
    }

    if (!targetRow) {
      console.warn(
        `[WarehouseReceipt] 未找到备货单号 ${stockOrderNo}，表格共 ${tableRows.length} 行`
      )
      return false
    }

    const result = await processRow(targetRow, targetIndex, stockOrderNo)

    if (!result) {
      console.log(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo} 处理失败，不刷新页面`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo} 下载完成，准备刷新页面...`
    )
    await sleep(2000)

    console.log(`[WarehouseReceipt] 刷新页面...`)
    window.location.reload()

    return true
  } catch (error: any) {
    return false
  }
}

interface TableRowData {
  index: number
  stockOrderNo: string
  processed?: boolean
}

export async function collectTableData(): Promise<
  Record<string, TableRowData>
> {
  try {
    console.log("[WarehouseReceipt] 开始收集表格数据...")

    const tableRows = document.querySelectorAll(
      'tr[data-testid="beast-core-table-body-tr"]'
    )

    if (tableRows.length === 0) {
      console.warn("[WarehouseReceipt] 未找到表格行数据")
      return {}
    }

    const rowsData: Record<string, TableRowData> = {}

    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i] as HTMLElement
      const stockOrderNo = extractStockOrderNoFromRow(row)

      if (stockOrderNo) {
        rowsData[stockOrderNo] = {
          index: i,
          stockOrderNo: stockOrderNo
        }

        console.log(
          `[WarehouseReceipt] 第 ${i + 1} 行: 备货单号 = ${stockOrderNo}`
        )
      } else {
        console.warn(`[WarehouseReceipt] 第 ${i + 1} 行: 未找到备货单号，跳过`)
      }
    }

    console.log(
      `[WarehouseReceipt] 共收集 ${Object.keys(rowsData).length} 行数据`
    )
    return rowsData
  } catch (error: any) {
    console.error("[WarehouseReceipt] 收集表格数据时发生错误:", error)
    return {}
  }
}

export async function clickWarehouseReceiptTab() {
  console.log(
    "[WarehouseReceipt] ============== 开始点击待仓库收货标签（批量下载模式） ============="
  )

  try {
    const tabLabels = document.querySelectorAll(
      'div[data-testid="beast-core-tab-itemLabel"]'
    )

    let targetTab: HTMLElement | null = null

    for (const label of Array.from(tabLabels)) {
      const labelText = label.textContent?.trim() || ""
      console.log("[WarehouseReceipt] 检查标签:", labelText)

      if (labelText === "待仓库收货") {
        const wrapper = label.closest(
          'div[data-testid="beast-core-tab-itemLabel-wrapper"]'
        )

        if (wrapper) {
          targetTab = wrapper as HTMLElement
          console.log("[WarehouseReceipt] 找到待仓库收货标签")
          break
        }
      }
    }

    if (!targetTab) {
      console.error("[WarehouseReceipt] 未找到待仓库收货标签")
      return false
    }

    const isActive = Array.from(targetTab.classList).some((className) =>
      className.includes("TAB_active")
    )
    if (isActive) {
      console.log("[WarehouseReceipt] 待仓库收货标签已经激活，无需点击")
    } else {
      console.log("[WarehouseReceipt] 点击待仓库收货标签...")
      targetTab.click()
      console.log("[WarehouseReceipt] 已点击待仓库收货标签")
    }

    console.log("[WarehouseReceipt] 等待3秒，让页面和表格加载...")
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (paginationElement) {
      console.log("[WarehouseReceipt] 表格已加载完成")
    } else {
      console.warn("[WarehouseReceipt] 表格可能未完全加载，但继续执行")
    }

    await sleep(2000)

    console.log("[WarehouseReceipt] 收集表格数据...")
    const tableData = await collectTableData()

    if (Object.keys(tableData).length === 0) {
      console.warn("[WarehouseReceipt] 未找到表格数据")
      return false
    }

    console.log(
      `[WarehouseReceipt] 共 ${Object.keys(tableData).length} 行数据，发送到 background 进行批量下载...`
    )

    await chrome.runtime.sendMessage({
      type: "START_BATCH_DOWNLOAD",
      data: {
        tableData: tableData,
        currentUrl: window.location.href
      }
    })

    console.log("[WarehouseReceipt] 已发送批量下载请求到 background")
    return true
  } catch (error: any) {
    console.error("[WarehouseReceipt] 点击待仓库收货标签时发生错误:", error)
    return false
  }
}

export async function startBatchDownload() {
  console.log(
    "[WarehouseReceipt] ============== 开始批量下载（刷新模式） ============="
  )

  try {
    const tabLabels = document.querySelectorAll(
      'div[data-testid="beast-core-tab-itemLabel"]'
    )

    let targetTab: HTMLElement | null = null

    for (const label of Array.from(tabLabels)) {
      const labelText = label.textContent?.trim() || ""
      console.log("[WarehouseReceipt] 检查标签:", labelText)

      if (labelText === "待仓库收货") {
        const wrapper = label.closest(
          'div[data-testid="beast-core-tab-itemLabel-wrapper"]'
        )

        if (wrapper) {
          targetTab = wrapper as HTMLElement
          console.log("[WarehouseReceipt] 找到待仓库收货标签")
          break
        }
      }
    }

    if (!targetTab) {
      console.error("[WarehouseReceipt] 未找到待仓库收货标签")
      return false
    }

    const isActive = Array.from(targetTab.classList).some((className) =>
      className.includes("TAB_active")
    )
    if (isActive) {
      console.log("[WarehouseReceipt] 待仓库收货标签已经激活，无需点击")
    } else {
      console.log("[WarehouseReceipt] 点击待仓库收货标签...")
      targetTab.click()
      console.log("[WarehouseReceipt] 已点击待仓库收货标签")
    }

    console.log("[WarehouseReceipt] 等待3秒，让页面和表格加载...")
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (paginationElement) {
      console.log("[WarehouseReceipt] 表格已加载完成")
    } else {
      console.warn("[WarehouseReceipt] 表格可能未完全加载，但继续执行")
    }

    await sleep(2000)

    console.log("[WarehouseReceipt] 收集表格数据...")
    const tableData = await collectTableData()

    if (Object.keys(tableData).length === 0) {
      console.warn("[WarehouseReceipt] 未找到表格数据")
      return false
    }

    console.log(
      `[WarehouseReceipt] 共 ${Object.keys(tableData).length} 行数据，发送到 background 进行批量下载...`
    )

    await chrome.runtime.sendMessage({
      type: "START_BATCH_DOWNLOAD",
      data: {
        tableData: tableData,
        currentUrl: window.location.href
      }
    })

    console.log("[WarehouseReceipt] 已发送批量下载请求到 background")
    return true
  } catch (error: any) {
    console.error("[WarehouseReceipt] 开始批量下载时发生错误:", error)
    return false
  }
}

export async function processNextRow(stockOrderNo: string): Promise<boolean> {
  console.log(
    `[WarehouseReceipt] ============== 处理备货单号 ${stockOrderNo} =============`
  )

  try {
    await sleep(2000)

    const result = await processRowAndRefresh(stockOrderNo)

    if (!result) {
      console.log(`[WarehouseReceipt] 备货单号 ${stockOrderNo} 处理失败`)
      return false
    }

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo} 处理成功，页面将刷新`
    )
    return true
  } catch (error: any) {
    console.error(
      `[WarehouseReceipt] 处理备货单号 ${stockOrderNo} 时发生错误:`,
      error
    )
    return false
  }
}
