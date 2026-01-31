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

async function downloadPdfFromIframe(
  stockOrderNo: string,
  rowIndex: number,
  pdfType: string
): Promise<boolean> {
  try {
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

    const filename = `${stockOrderNo}_${pdfType}.pdf`

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

    return true
  } catch (error: any) {
    console.error(
      `[WarehouseReceipt] 下载备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）${pdfType}时发生错误:`,
      error
    )
    return false
  }
}

async function clickPrintLinkAndDownload(
  row: HTMLElement,
  rowIndex: number,
  stockOrderNo: string,
  linkText: string,
  pdfType: string,
  isDrawer: boolean
): Promise<boolean> {
  try {
    console.log(
      `[WarehouseReceipt] ========== 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）处理${linkText} ==========`
    )

    const printLinks = row.querySelectorAll(
      'a[data-testid="beast-core-button-link"]'
    )
    let targetLink: HTMLElement | null = null

    for (const link of Array.from(printLinks)) {
      const text = link.textContent?.trim() || ""
      if (text === linkText) {
        targetLink = link as HTMLElement
        console.log(
          `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）找到"${linkText}"链接`
        )
        break
      }
    }

    if (!targetLink) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）未找到"${linkText}"链接`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] 点击备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）的"${linkText}"链接...`
    )
    targetLink.click()
    await sleep(4000)

    if (isDrawer) {
      const drawer = await findDom('div[data-testid="beast-core-drawer"]', {
        timeout: 10000,
        interval: 200
      })

      if (!drawer) {
        console.warn(
          `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）点击"${linkText}"后未出现drawer`
        )
        return false
      }

      console.log(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）drawer已出现`
      )
      await sleep(3000)

      const drawerButtons = drawer.querySelectorAll(
        'button[data-testid="beast-core-button"]'
      )

      if (drawerButtons.length === 0) {
        console.warn(
          `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）drawer中未找到按钮`
        )
        return false
      }

      const printButton = drawerButtons[0] as HTMLElement
      const buttonText = printButton.textContent?.trim() || ""
      console.log(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）找到drawer按钮: "${buttonText}"，准备点击...`
      )
      printButton.click()
      console.log(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）已点击drawer按钮`
      )
      await sleep(4000)
    } else {
      const modalWrapper = await findDom(
        'div[data-testid="beast-core-modal-innerWrapper"]',
        {
          timeout: 10000,
          interval: 200
        }
      )

      if (!modalWrapper) {
        console.warn(
          `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）点击"${linkText}"后未出现弹窗`
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
    }

    const downloadResult = await downloadPdfFromIframe(
      stockOrderNo,
      rowIndex,
      pdfType
    )

    if (!downloadResult) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）下载${pdfType}失败`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] ✅ 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）${pdfType}下载完成 ==========`
    )
    return true
  } catch (error: any) {
    console.error(
      `[WarehouseReceipt] 处理备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）${linkText}时发生错误:`,
      error
    )
    return false
  }
}

async function processRowWithoutRefresh(
  row: HTMLElement,
  rowIndex: number,
  stockOrderNo: string
): Promise<boolean> {
  try {
    console.log(
      `[WarehouseReceipt] ========== 处理备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）- 不刷新模式 ==========`
    )

    const packageLabelResult = await clickPrintLinkAndDownload(
      row,
      rowIndex,
      stockOrderNo,
      "打印商品打包标签",
      "package",
      false
    )

    if (!packageLabelResult) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）打包标签下载失败`
      )
      return false
    }

    await sleep(2000)

    const barcodeResult = await clickPrintLinkAndDownload(
      row,
      rowIndex,
      stockOrderNo,
      "打印商品条码",
      "barcode",
      true
    )

    if (!barcodeResult) {
      console.warn(
        `[WarehouseReceipt] 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）商品条码下载失败`
      )
      return false
    }

    console.log(
      `[WarehouseReceipt] ========== 备货单号 ${stockOrderNo}（第 ${rowIndex + 1} 行）处理完成（2个PDF） ==========`
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

export async function processNextRowWithoutRefresh(
  stockOrderNo: string
): Promise<boolean> {
  console.log(
    `[WarehouseReceipt] ============== 处理备货单号 ${stockOrderNo}（不刷新模式） =============`
  )

  try {
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

    const result = await processRowWithoutRefresh(
      targetRow,
      targetIndex,
      stockOrderNo
    )

    if (!result) {
      console.log(`[WarehouseReceipt] 备货单号 ${stockOrderNo} 处理失败`)
      return false
    }

    console.log(
      `[WarehouseReceipt] 备货单号 ${stockOrderNo} 处理成功（不刷新页面）`
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

export async function startBatchDownloadWithoutRefresh() {
  console.log(
    "[WarehouseReceipt] ============== 开始批量下载（不刷新模式） ============="
  )

  try {
    await setPluginRunningStatus(true)
    console.log("[WarehouseReceipt] 插件运行状态已设置为true")

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
      await setPluginRunningStatus(false)
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
      await setPluginRunningStatus(false)
      return false
    }

    console.log(
      `[WarehouseReceipt] 共 ${Object.keys(tableData).length} 行数据，开始批量下载...`
    )

    const stockOrderNos = Object.keys(tableData)
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < stockOrderNos.length; i++) {
      const stockOrderNo = stockOrderNos[i]
      console.log(
        `[WarehouseReceipt] ========== 处理进度: ${i + 1}/${stockOrderNos.length} ==========`
      )

      const result = await processNextRowWithoutRefresh(stockOrderNo)

      if (result) {
        successCount++
        tableData[stockOrderNo].processed = true
      } else {
        failCount++
      }

      console.log(`[WarehouseReceipt] 等待3-5秒后处理下一个...`)
      await sleep(3000 + Math.random() * 2000)
    }

    console.log(
      `[WarehouseReceipt] ========== 批量下载完成：成功 ${successCount}，失败 ${failCount} ==========`
    )

    await chrome.storage.local.set({ batchDownloadData: null })

    await setPluginRunningStatus(false)
    console.log("[WarehouseReceipt] 插件运行状态已设置为false")

    return true
  } catch (error: any) {
    console.error("[WarehouseReceipt] 批量下载时发生错误:", error)
    await setPluginRunningStatus(false)
    return false
  }
}
