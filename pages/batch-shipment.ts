/**
 * 批量发货页面逻辑
 * 处理批量发货页面的操作，包括表格数据提取、批量发货执行等
 */

import { findButtonByText, findDom, sleep } from "../utils/dom"

interface TableRowData {
  rowElement: HTMLElement
  stockOrderNo: string
  productCode: string
  warehouse: string
  skuId: string
  quantity: number
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

        if (stockOrderNo && warehouse) {
          tableData.push({
            rowElement: row as HTMLElement,
            stockOrderNo,
            productCode,
            warehouse,
            skuId,
            quantity
          })

          console.log(`[BatchShipment] 第${index + 1}行数据:`, {
            stockOrderNo,
            productCode,
            warehouse,
            skuId,
            quantity
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

function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}${month}${day}`
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

function groupDataByWarehouseAndProduct(
  tableData: TableRowData[],
  product: string
): Record<string, TableRowData[]> {
  const grouped: Record<string, TableRowData[]> = {}

  tableData.forEach((row) => {
    const key = `${row.warehouse}|${product}`
    if (!grouped[key]) {
      grouped[key] = []
    }
    grouped[key].push(row)
  })

  return grouped
}

async function selectAllOrders() {
  console.log("[BatchShipment] 开始全选订单...")

  try {
    const headerRow = await findDom(
      'tr[data-testid="beast-core-table-header-tr"]',
      { timeout: 10000, interval: 200 }
    )

    if (!headerRow) {
      console.error("[BatchShipment] 未找到表格头部")
      return false
    }

    const headerCheckbox = headerRow.querySelector(
      'input[type="checkbox"][mode="checkbox"]'
    ) as HTMLInputElement

    if (!headerCheckbox) {
      console.error("[BatchShipment] 未找到全选复选框")
      return false
    }

    if (!headerCheckbox.checked) {
      headerCheckbox.click()
      console.log("[BatchShipment] 已点击全选复选框")
      await sleep(500)
    } else {
      console.log("[BatchShipment] 全选复选框已选中，无需点击")
    }

    return true
  } catch (error: any) {
    console.error("[BatchShipment] 全选订单时发生错误:", error)
    return false
  }
}

async function refreshTable() {
  console.log("[BatchShipment] 开始刷新表格...")

  try {
    const refreshButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "刷新",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!refreshButton) {
      console.error("[BatchShipment] 未找到刷新按钮")
      return false
    }

    refreshButton.click()
    console.log("[BatchShipment] 已点击刷新按钮")
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!paginationElement) {
      console.warn("[BatchShipment] 刷新后未找到分页元素，但继续执行")
    } else {
      console.log("[BatchShipment] 表格已刷新完成")
    }

    return true
  } catch (error: any) {
    console.error("[BatchShipment] 刷新表格时发生错误:", error)
    return false
  }
}

async function selectOrdersByWarehouse(
  warehouse: string,
  rows: TableRowData[]
) {
  console.log(`[BatchShipment] 开始勾选仓库 ${warehouse} 的订单...`)

  try {
    const stockOrderNos = new Set(rows.map((row) => row.stockOrderNo))

    const tbody = document.querySelector(
      'tbody[data-testid="beast-core-table-middle-tbody"]'
    )

    if (!tbody) {
      console.error("[BatchShipment] 未找到表格body")
      return false
    }

    const tableRows = tbody.querySelectorAll(
      'tr[data-testid="beast-core-table-body-tr"]'
    )

    let selectedCount = 0
    tableRows.forEach((row) => {
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
            const stockOrderNo = stockOrderLink.textContent?.trim() || ""
            if (stockOrderNos.has(stockOrderNo)) {
              const checkbox = row.querySelector(
                'input[type="checkbox"][mode="checkbox"]'
              ) as HTMLInputElement
              if (checkbox && !checkbox.checked) {
                checkbox.click()
                selectedCount++
              }
            }
          }
          break
        }
      }
    })

    console.log(
      `[BatchShipment] 已勾选 ${selectedCount} 条仓库 ${warehouse} 的订单`
    )
    return true
  } catch (error: any) {
    console.error("[BatchShipment] 勾选同仓库订单时发生错误:", error)
    return false
  }
}

async function clickCreateShippingOrderButton() {
  console.log("[BatchShipment] 查找并点击创建发货单按钮...")

  try {
    const createButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "创建发货单",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!createButton) {
      console.error("[BatchShipment] 未找到创建发货单按钮")
      return false
    }

    createButton.click()
    console.log("[BatchShipment] 已点击创建发货单按钮")
    await sleep(2000)
    return true
  } catch (error: any) {
    console.error("[BatchShipment] 点击创建发货单按钮时发生错误:", error)
    return false
  }
}

async function handleCreateShippingOrderPage(warehouse: string) {
  console.log("[BatchShipment] 处理创建发货单页面...")

  try {
    console.log("[BatchShipment] 步骤1: 等待页面加载...")
    await sleep(2000)

    console.log("[BatchShipment] 步骤2: 点击批量选择...")
    const batchSelectButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "批量选择",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!batchSelectButton) {
      console.error("[BatchShipment] 未找到批量选择按钮")
      return false
    }

    batchSelectButton.click()
    console.log("[BatchShipment] 已点击批量选择按钮")
    await sleep(1500)

    console.log("[BatchShipment] 步骤3: 选择仓库...")
    const modalWrapper = document.querySelector(
      'div[data-testid="beast-core-modal-innerWrapper"]'
    )
    if (!modalWrapper) {
      console.error("[BatchShipment] 未找到批量选择弹窗")
      return false
    }

    const radioInputs = modalWrapper.querySelectorAll(
      'input[type="radio"], input[type="checkbox"]'
    )

    for (const radio of Array.from(radioInputs)) {
      const label = radio.closest("label")?.textContent || ""
      const text = label.trim()

      if (text.includes(warehouse)) {
        console.log(`[BatchShipment] 找到匹配的仓库选项: ${text}`)
        if (radio instanceof HTMLElement) {
          radio.click()
        }
        await sleep(500)
        break
      }
    }

    console.log("[BatchShipment] 步骤4: 点击确认...")
    const confirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "确认",
      {
        timeout: 5000,
        interval: 200,
        parent: modalWrapper as Element
      }
    )

    if (confirmButton) {
      confirmButton.click()
      console.log("[BatchShipment] 已点击批量选择确认按钮")
      await sleep(1500)
    }

    console.log("[BatchShipment] 步骤5: 点击下一步...")
    const nextButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "下一步",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (nextButton) {
      nextButton.click()
      console.log("[BatchShipment] 已点击下一步按钮")
      await sleep(2000)
    }

    console.log("[BatchShipment] 步骤6: 点击确认创建...")
    const confirmCreateButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "确认创建",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (confirmCreateButton) {
      confirmCreateButton.click()
      console.log("[BatchShipment] 已点击确认创建按钮")
      await sleep(2000)
    }

    console.log("[BatchShipment] 创建发货单页面处理完成")
    return true
  } catch (error: any) {
    console.error("[BatchShipment] 处理创建发货单页面时发生错误:", error)
    return false
  }
}

async function handleShippingListPage(shippingMethod: string) {
  console.log("[BatchShipment] 处理发货列表页面...")

  try {
    console.log("[BatchShipment] 步骤1: 等待页面加载...")
    await sleep(2000)

    console.log("[BatchShipment] 步骤2: 刷新表格...")
    await refreshTable()
    await sleep(1000)

    console.log("[BatchShipment] 步骤3: 全选订单...")
    await selectAllOrders()
    await sleep(1000)

    console.log("[BatchShipment] 步骤4: 点击批量打印商品打包标签...")
    const printLabelButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "批量打印商品打包标签",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!printLabelButton) {
      console.error("[BatchShipment] 未找到批量打印商品打包标签按钮")
      return false
    }

    printLabelButton.click()
    console.log("[BatchShipment] 已点击批量打印商品打包标签按钮")
    await sleep(3000)

    console.log("[BatchShipment] 步骤5: 点击批量装箱发货...")
    const boxingButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "批量装箱发货",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!boxingButton) {
      console.error("[BatchShipment] 未找到批量装箱发货按钮")
      return false
    }

    boxingButton.click()
    console.log("[BatchShipment] 已点击批量装箱发货按钮")
    await sleep(3000)

    console.log("[BatchShipment] 步骤6: 选择发货方式...")
    await selectShippingMethod(shippingMethod)
    await sleep(1000)

    console.log("[BatchShipment] 步骤7: 选择不合包...")
    await selectNotMergeBoxing()
    await sleep(1000)

    console.log("[BatchShipment] 步骤8: 选择数量为1...")
    await selectQuantity(1)
    await sleep(1000)

    console.log("[BatchShipment] 步骤9: 确认发货...")
    await confirmShipment()

    console.log("[BatchShipment] 发货列表页面处理完成")
    return true
  } catch (error: any) {
    console.error("[BatchShipment] 处理发货列表页面时发生错误:", error)
    return false
  }
}

async function selectShippingMethod(shippingMethod: string) {
  console.log(`[BatchShipment] 选择发货方式: ${shippingMethod}...`)

  try {
    const radioInputs = document.querySelectorAll('input[type="radio"]')

    for (const radio of Array.from(radioInputs)) {
      const label = radio.closest("label")?.textContent || ""
      const text = label.trim()

      if (text.includes(shippingMethod)) {
        console.log(`[BatchShipment] 找到匹配的发货方式: ${text}`)
        if (radio instanceof HTMLElement) {
          radio.click()
        }
        await sleep(500)
        return true
      }
    }

    console.warn(`[BatchShipment] 未找到匹配的发货方式: ${shippingMethod}`)
    return false
  } catch (error: any) {
    console.error("[BatchShipment] 选择发货方式时发生错误:", error)
    return false
  }
}

async function selectNotMergeBoxing() {
  console.log("[BatchShipment] 选择不合包...")

  try {
    const radioInputs = document.querySelectorAll('input[type="radio"]')

    for (const radio of Array.from(radioInputs)) {
      const label = radio.closest("label")?.textContent || ""
      const text = label.trim()

      if (text.includes("不合包")) {
        console.log(`[BatchShipment] 找到不合包选项`)
        if (radio instanceof HTMLElement) {
          radio.click()
        }
        await sleep(500)
        return true
      }
    }

    console.warn("[BatchShipment] 未找到不合包选项")
    return false
  } catch (error: any) {
    console.error("[BatchShipment] 选择不合包时发生错误:", error)
    return false
  }
}

async function selectQuantity(quantity: number) {
  console.log(`[BatchShipment] 选择数量: ${quantity}...`)

  try {
    const quantityInput = await findDom('input[type="number"]', {
      timeout: 5000,
      interval: 200
    })

    if (quantityInput) {
      ;(quantityInput as HTMLInputElement).value = String(quantity)
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }))
      quantityInput.dispatchEvent(new Event("change", { bubbles: true }))
      console.log(`[BatchShipment] 已设置数量为 ${quantity}`)
      await sleep(500)
      return true
    }

    console.warn("[BatchShipment] 未找到数量输入框")
    return false
  } catch (error: any) {
    console.error("[BatchShipment] 选择数量时发生错误:", error)
    return false
  }
}

async function confirmShipment() {
  console.log("[BatchShipment] 确认发货...")

  try {
    const confirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "确认发货",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!confirmButton) {
      console.error("[BatchShipment] 未找到确认发货按钮")
      return false
    }

    confirmButton.click()
    console.log("[BatchShipment] 已点击确认发货按钮")
    await sleep(3000)
    return true
  } catch (error: any) {
    console.error("[BatchShipment] 确认发货时发生错误:", error)
    return false
  }
}

async function waitForPageNavigation(
  expectedUrl: string,
  timeout: number = 30000
): Promise<boolean> {
  console.log(`[BatchShipment] 等待页面跳转到包含 "${expectedUrl}" 的页面...`)

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkUrl = () => {
      const currentUrl = window.location.href
      if (currentUrl.includes(expectedUrl)) {
        console.log(`[BatchShipment] 页面已跳转: ${currentUrl}`)
        resolve(true)
        return
      }

      if (Date.now() - startTime >= timeout) {
        console.warn(`[BatchShipment] 等待页面跳转超时`)
        resolve(false)
        return
      }

      setTimeout(checkUrl, 500)
    }

    checkUrl()
  })
}

// 开始发货台完整流程
export async function startShippingDeskTasks(config: {
  warehouse: string
  shippingMethod: string
  product: string
}) {
  console.log("[BatchShipment] ============== 开始发货台完整流程 =============")
  console.log("[BatchShipment] 配置:", config)

  try {
    console.log("[BatchShipment] 步骤1: 等待页面加载...")
    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 30000,
        interval: 200
      }
    )

    if (!paginationElement) {
      console.error("[BatchShipment] 页面加载超时")
      return
    }

    console.log("[BatchShipment] 步骤2: 刷新表格...")
    await refreshTable()

    console.log("[BatchShipment] 步骤3: 提取表格数据...")
    await sleep(1000)
    const tableData = extractTableData()

    if (tableData.length === 0) {
      console.warn("[BatchShipment] 未找到表格数据")
      return
    }

    console.log(`[BatchShipment] 共找到 ${tableData.length} 条数据`)

    console.log("[BatchShipment] 步骤4: 过滤已发货订单...")
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

    console.log(
      `[BatchShipment] 过滤后剩余 ${filteredTableData.length} 条未发货数据`
    )

    if (filteredTableData.length === 0) {
      console.log("[BatchShipment] 所有订单已发货，无需处理")
      return
    }

    console.log("[BatchShipment] 步骤5: 按仓库和产品分组数据...")
    const groupedData = groupDataByWarehouseAndProduct(
      filteredTableData,
      config.product
    )
    const groups = Object.keys(groupedData)
    console.log(`[BatchShipment] 共 ${groups.length} 个分组需要处理`)

    console.log("[BatchShipment] 步骤6: 保存数据...")
    const shopName = getShopName()
    const baseFolder = getTodayDateString()
    const finalShopName = shopName || "未知店铺"

    const saveResult = await chrome.runtime.sendMessage({
      type: "SAVE_SHIPPING_DESK_DATA",
      data: {
        baseFolder,
        shopName: finalShopName,
        product: config.product,
        groupedData: Object.keys(groupedData)
          .map((key) => {
            const [warehouse] = key.split("|")
            return {
              warehouse,
              product: config.product,
              rows: groupedData[key].map((row) => ({
                stockOrderNo: row.stockOrderNo,
                productCode: row.productCode,
                warehouse: row.warehouse,
                skuId: row.skuId,
                quantity: row.quantity
              }))
            }
          })
          .filter((item) => item.rows.length > 0)
      }
    })

    console.log("[BatchShipment] 数据保存结果:", saveResult)

    console.log("[BatchShipment] 步骤7: 开始按仓库处理发货流程...")

    for (const key of groups) {
      const [warehouse] = key.split("|")
      const rows = groupedData[key]

      console.log(
        `[BatchShipment] 开始处理仓库: ${warehouse}，共 ${rows.length} 条订单`
      )

      // console.log("[BatchShipment] 步骤7.1: 刷新表格...")
      // await refreshTable()
      // await sleep(1000)

      console.log("[BatchShipment] 步骤7.2: 勾选同仓库订单...")
      await selectOrdersByWarehouse(warehouse, rows)
      await sleep(1000)

      console.log("[BatchShipment] 步骤7.3: 点击创建发货单...")
      await clickCreateShippingOrderButton()

      console.log("[BatchShipment] 步骤7.4: 处理创建发货单页面...")
      await handleCreateShippingOrderPage(config.warehouse)

      console.log("[BatchShipment] 步骤7.5: 等待跳转到发货列表...")
      await waitForPageNavigation(
        "https://seller.kuajingmaihuo.com/main/order-manager/shipping-list",
        15000
      )

      console.log("[BatchShipment] 步骤7.6: 处理发货列表页面...")
      await handleShippingListPage(config.shippingMethod)

      console.log(
        `[BatchShipment] 仓库 ${warehouse} 处理完成，准备返回发货台处理下一个仓库...`
      )

      await chrome.runtime.sendMessage({
        type: "NAVIGATE_TO_SHIPPING_DESK",
        data: {
          url: "https://seller.kuajingmaihuo.com/main/order-manager/shipping-desk"
        }
      })

      await sleep(3000)
    }

    console.log(
      "[BatchShipment] ============== 发货台完整流程完成 ============="
    )
  } catch (error: any) {
    console.error("[BatchShipment] 执行发货台任务时发生错误:", error)
  } finally {
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

  try {
    console.log("[BatchShipment] 批量发货任务执行完成")
  } finally {
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
