/**
 * 批量发货页面逻辑
 * 处理批量发货页面的操作，包括表格数据提取、批量发货执行等
 */

import { setPluginRunningStatus } from "../content"
import { findButtonByText, findDom, sleep } from "../utils/dom"

interface TableRowData {
  rowElement: HTMLElement
  stockOrderNo: string
  productCode: string
  warehouse: string
  skuId: string
  quantity: number
  imageUrl: string
}

export function extractTableData(): TableRowData[] {
  const tableData: TableRowData[] = []

  try {
    const tbody = document.querySelector(
      'tbody[data-testid="beast-core-table-middle-tbody"]'
    )

    if (!tbody) {
      console.warn("[BatchShipment] 未找到表格body")
      return tableData
    }

    const rows = tbody.querySelectorAll(
      'tr[data-testid="beast-core-table-body-tr"]'
    )

    console.log(`[BatchShipment] 找到 ${rows.length} 行数据`)

    rows.forEach((row, index) => {
      try {
        let stockOrderNo = ""
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
              stockOrderNo = stockOrderLink.textContent?.trim() || ""
              break
            }
          }
        }

        let productCode = ""
        const allDivs = row.querySelectorAll("div")
        for (const div of Array.from(allDivs)) {
          const text = div.textContent || ""
          if (
            text.includes("货号：") &&
            !text.includes("SKC：") &&
            !text.includes("备货单号：")
          ) {
            const allSpans = div.querySelectorAll("span")
            for (let i = 0; i < allSpans.length; i++) {
              const span = allSpans[i]
              const spanText = span.textContent?.trim() || ""
              if (spanText === "货号：") {
                continue
              }
              if (!spanText) {
                continue
              }
              if (/^[A-Z0-9\-]+$/.test(spanText)) {
                productCode = spanText
                break
              }
            }
            if (productCode) {
              break
            }
          }
        }

        const warehouseSpans = row.querySelectorAll(
          'td span[style*="border-bottom"]'
        )
        let warehouse = ""
        if (warehouseSpans.length > 0) {
          warehouse = warehouseSpans[0].textContent?.trim() || ""
          warehouse = warehouse.replace(/\s*[（(]前置收货[）)]\s*$/, "")
        }

        let skuId = ""
        const skuIdDivs = row.querySelectorAll(
          'div[data-testid="beast-core-box"]'
        )
        for (const div of Array.from(skuIdDivs)) {
          const text = div.childNodes[0]?.textContent?.trim() || ""
          if (text === "SKU ID：") {
            const skuIdSpan = div.querySelector(
              'span[data-testid="beast-core-box"]'
            )
            if (skuIdSpan) {
              skuId = skuIdSpan.textContent?.trim() || ""
              break
            }
          }
        }

        const quantity = 1

        let imageUrl = ""
        const tds = row.querySelectorAll("td")
        for (const td of Array.from(tds)) {
          const tdText = td.textContent || ""
          if (tdText.includes("SKU ID：")) {
            const imgElement = td.querySelector(
              'div[style*="background-image"]'
            )
            if (imgElement) {
              const style = window.getComputedStyle(imgElement)
              const bgImage = style.backgroundImage
              const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/)
              if (urlMatch && urlMatch[1]) {
                imageUrl = urlMatch[1].split("?")[0]
              }
            }
            break
          }
        }

        if (stockOrderNo && warehouse) {
          tableData.push({
            rowElement: row as HTMLElement,
            stockOrderNo,
            productCode,
            warehouse,
            skuId,
            quantity,
            imageUrl
          })

          console.log(`[BatchShipment] 第${index + 1}行数据:`, {
            stockOrderNo,
            productCode,
            warehouse,
            skuId,
            quantity,
            imageUrl
          })
        } else {
          console.warn(`[BatchShipment] 第${index + 1}行数据不完整，跳过`, {
            stockOrderNo,
            warehouse
          })
        }
      } catch (error: any) {
        console.error(
          `[BatchShipment] 提取第${index + 1}行数据时发生错误:`,
          error
        )
      }
    })

    console.log(`[BatchShipment] 成功提取 ${tableData.length} 条数据`)
    return tableData
  } catch (error: any) {
    console.error("[BatchShipment] 提取表格数据时发生错误:", error)
    return tableData
  }
}

function getShopName(): string {
  try {
    const shopNameElement = document.querySelector(
      '.account-info_mallInfo__ts61W div[style*="font-weight: 500"] span[data-testid="beast-core-ellipsis"] span'
    )

    if (shopNameElement) {
      const shopName = shopNameElement.textContent?.trim() || ""
      console.log("[BatchShipment] 获取到店铺名称:", shopName)
      return shopName
    }

    console.warn("[BatchShipment] 未找到店铺名称元素")
    return ""
  } catch (error: any) {
    console.error("[BatchShipment] 获取店铺名称时发生错误:", error)
    return ""
  }
}

function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
}

function groupDataByWarehouse(
  tableData: TableRowData[]
): Record<string, TableRowData[]> {
  const grouped: Record<string, TableRowData[]> = {}

  tableData.forEach((row) => {
    const warehouse = row.warehouse
    if (!grouped[warehouse]) {
      grouped[warehouse] = []
    }
    grouped[warehouse].push(row)
  })

  return grouped
}

export async function startShippingDeskTasks(config: {
  warehouse: string
  shippingMethod: string
}) {
  console.log("[BatchShipment] ============== 开始发货台任务 =============")
  console.log("[BatchShipment] 配置:", config)

  setPluginRunningStatus(true)

  try {
    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 30000,
        interval: 200
      }
    )

    if (!paginationElement) {
      setPluginRunningStatus(false)
      return
    }

    await sleep(3000)

    const tableData = extractTableData()

    if (tableData.length === 0) {
      setPluginRunningStatus(false)
      return
    }

    const stockOrderNos = tableData.map((row) => row.stockOrderNo)
    const checkResult = await chrome.runtime.sendMessage({
      type: "CHECK_STOCK_ORDER_SHIPPED",
      data: {
        stockOrderNos
      }
    })

    const unshippedOrderNos = new Set(checkResult.data?.notShipped || [])
    const filteredTableData = tableData.filter((row) =>
      unshippedOrderNos.has(row.stockOrderNo)
    )

    if (filteredTableData.length === 0) {
      setPluginRunningStatus(false)
      return
    }

    const groupedData = groupDataByWarehouse(filteredTableData)
    const warehouses = Object.keys(groupedData)
    const targetWarehouses = warehouses

    const shopName = getShopName()

    const baseFolder = `JIT${getTodayDateString()}`
    const finalShopName = shopName || "未知店铺"

    const dataRecordList: Array<{
      stockOrderNo: string
      productCode: string
      warehouse: string
      skuId: string
      quantity: number
      imageUrl: string
      imageFileName: string
      imageFilePath: string
      shopName: string
      downloadDate: string
    }> = []

    const downloadData = {
      baseFolder,
      shopName: finalShopName,
      groupedData: Object.keys(groupedData)
        .map((warehouse) => ({
          warehouse,
          rows: groupedData[warehouse]
            .filter((row) => row.productCode && row.imageUrl)
            .map((row) => {
              const fileName = row.productCode
              const imageFileName = `${fileName}.jpg`
              const imageFilePath = `${baseFolder}/${finalShopName}/${warehouse}/${imageFileName}`

              dataRecordList.push({
                stockOrderNo: row.stockOrderNo,
                productCode: row.productCode,
                warehouse: row.warehouse,
                skuId: row.skuId,
                quantity: row.quantity,
                imageUrl: row.imageUrl,
                imageFileName,
                imageFilePath,
                shopName: finalShopName,
                downloadDate: getTodayDateString()
              })

              return {
                stockOrderNo: row.stockOrderNo,
                productCode: row.productCode,
                warehouse: row.warehouse,
                skuId: row.skuId,
                quantity: row.quantity,
                imageUrl: row.imageUrl,
                fileName: row.productCode
              }
            })
            .filter((row) => row.fileName && row.imageUrl)
        }))
        .filter((item) => item.rows.length > 0)
    }

    console.log("[BatchShipment] 发货台任务执行完成")
  } catch (error: any) {
    console.error("[BatchShipment] 执行发货台任务时发生错误:", error)
  } finally {
    setPluginRunningStatus(false)
  }
}

export async function startBatchTasks(config: {
  warehouse: string
  shippingMethod: string
}) {
  console.log(
    "[BatchShipment] 收到background通知，开始批量执行任务，配置:",
    config
  )

  setPluginRunningStatus(true)

  try {
    console.log("[BatchShipment] 批量发货任务执行完成")
  } finally {
    setPluginRunningStatus(false)
  }
}

export async function startBoxingTasks(config: {
  warehouse: string
  shippingMethod: string
}) {
  console.log("[BatchShipment] ============== 开始装箱任务 =============")
  console.log("[BatchShipment] 收到background通知，开始装箱任务，配置:", config)
  console.log("[BatchShipment] 装箱任务执行完成")
}

export type { TableRowData }
