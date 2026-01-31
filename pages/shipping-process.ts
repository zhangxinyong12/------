import { setPluginRunningStatus } from "../content"
import { findButtonByText, findDom, sleep } from "../utils/dom"

export async function executeShipmentProcess(
  warehouse: string,
  shippingMethod: string
): Promise<boolean> {
  setPluginRunningStatus(true)

  try {
    console.log(
      `[ShippingProcess] 开始执行完整发货流程，仓库: ${warehouse}，发货方式: ${shippingMethod}`
    )

    if (!(await clickCreateShippingOrderButton())) {
      return false
    }

    if (!(await waitForPageNavigation("/shipping-desk/create", 10000))) {
      console.warn("[ShippingProcess] 未跳转到创建发货单页面")
      if (!(await clickBatchSelectAndChooseWarehouse(warehouse))) {
        return false
      }
    } else {
      if (!(await selectWarehouseInCreatePage(warehouse))) {
        return false
      }
    }

    if (!(await clickNextButton())) {
      return false
    }

    if (!(await clickConfirmCreateButton())) {
      return false
    }

    console.log("[ShippingProcess] 等待跳转回发货台页面...")
    await sleep(3000)

    if (!(await clickRefreshButton())) {
      return false
    }

    if (!(await selectAllOrdersForShipment())) {
      return false
    }

    console.log("[ShippingProcess] 完整发货流程执行成功")
    return true
  } catch (error: any) {
    console.error("[ShippingProcess] 执行发货流程时发生错误:", error)
    return false
  } finally {
    setPluginRunningStatus(false)
  }
}

async function clickCreateShippingOrderButton() {
  console.log("[ShippingProcess] 查找并点击创建发货单按钮...")

  const createButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "创建发货单",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!createButton) {
    console.error("[ShippingProcess] 未找到创建发货单按钮")
    return false
  }

  createButton.click()
  console.log("[ShippingProcess] 已点击创建发货单按钮")

  console.log("[ShippingProcess] 等待弹窗出现（最多等待10秒）...")
  const modalWrapper = await findDom(
    'div[data-testid="beast-core-modal-innerWrapper"]',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!modalWrapper) {
    console.log("[ShippingProcess] 未发现弹窗，继续执行...")
    return true
  }

  console.log("[ShippingProcess] 发现弹窗，检查弹窗类型...")

  const modalText = modalWrapper.textContent || ""

  if (modalText.includes("发货数一致") && modalText.includes("本次共计发货")) {
    console.log("[ShippingProcess] 检测到发货数量确认弹窗")

    const confirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "发货数一致，继续创建",
      {
        timeout: 5000,
        interval: 200,
        parent: modalWrapper as Element
      }
    )

    if (confirmButton) {
      console.log(
        '[ShippingProcess] 找到"发货数一致，继续创建"按钮，准备点击...'
      )
      confirmButton.click()
      console.log('[ShippingProcess] 已点击"发货数一致，继续创建"按钮')
      await sleep(3000)
      await sleep(3000)
      return true
    } else {
      console.warn('[ShippingProcess] 未找到"发货数一致，继续创建"按钮')
      return false
    }
  }

  if (modalText.includes("是否同步创建发货单")) {
    console.log("[ShippingProcess] 检测到同步创建弹窗")

    const syncButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "同步创建",
      {
        timeout: 5000,
        interval: 200,
        parent: modalWrapper as Element
      }
    )

    if (syncButton) {
      console.log('[ShippingProcess] 找到"同步创建"按钮，准备点击...')
      syncButton.click()
      console.log('[ShippingProcess] 已点击"同步创建"按钮')
      await sleep(3000)
      await sleep(3000)
      return true
    } else {
      console.warn('[ShippingProcess] 未找到"同步创建"按钮')
      return false
    }
  }

  console.warn(
    "[ShippingProcess] 未知弹窗类型，弹窗文本:",
    modalText.substring(0, 100)
  )
  await sleep(3000)
  await sleep(3000)
  return true
}

async function selectWarehouseInCreatePage(warehouse: string) {
  console.log(`[ShippingProcess] 在创建发货单页面选择仓库: ${warehouse}`)
  await sleep(2000)

  const radioInputs = document.querySelectorAll('input[type="radio"]')

  for (const radio of Array.from(radioInputs)) {
    const label = radio.closest("label")?.textContent || ""
    const text = label.trim()

    console.log(
      `[ShippingProcess] 检查仓库选项: "${text}"，目标仓库: "${warehouse}"`
    )

    if (text.includes(warehouse)) {
      console.log(`[ShippingProcess] 找到匹配的仓库选项: ${text}`)
      if (radio instanceof HTMLElement) {
        radio.click()
      }
      await sleep(500)
      return true
    }
  }

  console.warn(`[ShippingProcess] 未找到匹配的仓库: ${warehouse}`)
  return false
}

async function clickBatchSelectAndChooseWarehouseInCreatePage(
  warehouse: string
) {
  await sleep(3000)

  const deliveryAddressSpan = document.querySelector(
    "span.order-info-pkg_deliveryAddress__dcPyp"
  ) as HTMLElement

  if (!deliveryAddressSpan) {
    console.error("[ShippingProcess] 未找到发货仓库的span元素")
    return false
  }

  const batchSelectLink = deliveryAddressSpan.querySelector(
    'a[data-testid="beast-core-button-link"]'
  ) as HTMLElement

  if (!batchSelectLink) {
    console.error("[ShippingProcess] 未找到发货仓库的批量选择按钮")
    return false
  }

  batchSelectLink.click()
  console.log("[ShippingProcess] 已点击发货仓库的批量选择按钮")
  await sleep(1500)

  const modalWrapper = await findDom(
    'div[data-testid="beast-core-modal-innerWrapper"]',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!modalWrapper) {
    console.error("[ShippingProcess] 未找到批量选择弹窗")
    return false
  }

  const selectHeader = modalWrapper.querySelector(
    'div[data-testid="beast-core-select-header"]'
  ) as HTMLElement
  if (!selectHeader) {
    console.error("[ShippingProcess] 未找到发货仓库下拉框")
    return false
  }

  selectHeader.click()
  console.log("[ShippingProcess] 已点击发货仓库下拉框")
  await sleep(3000)

  const dropdown = await findDom('div[data-testid="beast-core-portal"]', {
    timeout: 5000,
    interval: 200
  })

  if (!dropdown) {
    console.error("[ShippingProcess] 未找到仓库下拉列表")
    return false
  }

  console.log("[ShippingProcess] 找到下拉列表容器")
  await sleep(3000)

  const portalMain = dropdown.querySelector(
    'div[data-testid="beast-core-portal-main"]'
  )
  console.log("[ShippingProcess] portal-main元素:", !!portalMain)

  const listbox =
    portalMain?.querySelector('ul[role="listbox"]') ||
    dropdown.querySelector('ul[role="listbox"]')
  console.log("[ShippingProcess] listbox元素:", !!listbox)

  let warehouseOptions: NodeListOf<Element> | null = null
  if (listbox) {
    warehouseOptions = listbox.querySelectorAll('li[role="option"]')
    console.log(
      `[ShippingProcess] 在listbox中找到 ${warehouseOptions.length} 个选项`
    )
  }

  if (!warehouseOptions || warehouseOptions.length === 0) {
    warehouseOptions = dropdown.querySelectorAll('li[role="option"]')
    console.log(
      `[ShippingProcess] 在dropdown中找到 ${warehouseOptions.length} 个选项`
    )
  }

  if (!warehouseOptions || warehouseOptions.length === 0) {
    warehouseOptions = document.querySelectorAll('li[role="option"]')
    console.log(
      `[ShippingProcess] 在document中找到 ${warehouseOptions.length} 个选项`
    )
  }

  let targetWarehouseName = ""
  if (warehouse.includes("莆田")) {
    targetWarehouseName = "莆田仓库"
  } else if (warehouse.includes("义乌")) {
    targetWarehouseName = "义乌仓库"
  } else {
    targetWarehouseName = warehouse
  }

  console.log(`[ShippingProcess] 目标仓库名称: "${targetWarehouseName}"`)

  if (!warehouseOptions || warehouseOptions.length === 0) {
    console.error("[ShippingProcess] 未找到任何仓库选项")
    return false
  }

  console.log(
    `[ShippingProcess] 最终找到 ${warehouseOptions.length} 个仓库选项`
  )

  Array.from(warehouseOptions).forEach((option, index) => {
    const text = option.textContent?.trim() || ""
    console.log(`[ShippingProcess] 选项 ${index + 1}: "${text}"`)
  })

  let found = false
  for (const option of Array.from(warehouseOptions)) {
    const optionElement = option as HTMLElement
    const optionText = optionElement.textContent?.trim() || ""
    const isChecked = option.getAttribute("data-checked") === "true"

    console.log(
      `[ShippingProcess] 检查仓库选项: "${optionText}", 已选中: ${isChecked}`
    )

    if (optionText === targetWarehouseName) {
      console.log(`[ShippingProcess] ✅ 找到匹配的仓库选项: ${optionText}`)

      if (isChecked) {
        console.log(`[ShippingProcess] 仓库选项已选中，跳过点击`)
        found = true
        break
      }

      console.log(`[ShippingProcess] 触发点击事件...`)
      optionElement.click()
      await sleep(500)
      found = true
      break
    }
  }

  if (!found) {
    console.warn(
      `[ShippingProcess] ⚠️ 未找到匹配的仓库选项: ${targetWarehouseName}`
    )
    return false
  }

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
    console.log("[ShippingProcess] 已点击批量选择确认按钮")
    await sleep(3000)

    const createConfirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "确认创建",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (createConfirmButton) {
      createConfirmButton.click()
      console.log("[ShippingProcess] 已点击确认创建按钮")
      await sleep(3000)

      const continueCreateButton = await findButtonByText(
        'button[data-testid="beast-core-button"]',
        "继续创建，已确认一致",
        {
          timeout: 10000,
          interval: 200
        }
      )

      if (continueCreateButton) {
        continueCreateButton.click()
        console.log("[ShippingProcess] 已点击继续创建，已确认一致按钮")
        await sleep(3000)

        chrome.runtime
          .sendMessage({
            type: "NAVIGATE_TO_SHIPPING_LIST",
            data: {
              url: "https://seller.kuajingmaihuo.com/main/order-manager/shipping-list"
            }
          })
          .catch((error) => {
            console.error("[ShippingProcess] 发送跳转消息失败:", error)
          })

        return true
      } else {
        console.warn("[ShippingProcess] 未找到继续创建，已确认一致按钮")
        return false
      }
    } else {
      console.warn("[ShippingProcess] 未找到确认创建按钮")
      return false
    }
  }

  console.warn("[ShippingProcess] 未找到批量选择确认按钮")
  return false
}

async function clickBatchSelectAndChooseWarehouse(warehouse: string) {
  console.log(`[ShippingProcess] 查找并点击批量选择按钮...`)

  const batchSelectButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "批量选择",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!batchSelectButton) {
    console.error("[ShippingProcess] 未找到批量选择按钮")
    return false
  }

  batchSelectButton.click()
  console.log("[ShippingProcess] 已点击批量选择按钮")
  await sleep(1500)

  console.log(`[ShippingProcess] 在批量选择弹窗中选择仓库: ${warehouse}`)

  const modalWrapper = document.querySelector(
    'div[data-testid="beast-core-modal-innerWrapper"]'
  )
  if (!modalWrapper) {
    console.error("[ShippingProcess] 未找到批量选择弹窗")
    return false
  }

  const radioInputs = modalWrapper.querySelectorAll(
    'input[type="radio"], input[type="checkbox"]'
  )

  for (const radio of Array.from(radioInputs)) {
    const label = radio.closest("label")?.textContent || ""
    const text = label.trim()

    console.log(`[ShippingProcess] 检查仓库选项: "${text}"`)

    if (text.includes(warehouse)) {
      console.log(`[ShippingProcess] 找到匹配的仓库选项: ${text}`)
      if (radio instanceof HTMLElement) {
        radio.click()
      }
      await sleep(500)
      break
    }
  }

  console.log("[ShippingProcess] 点击批量选择确认按钮...")
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
    console.log("[ShippingProcess] 已点击批量选择确认按钮")
    await sleep(1500)
    return true
  }

  console.warn("[ShippingProcess] 未找到批量选择确认按钮")
  return false
}

async function clickNextButton() {
  console.log("[ShippingProcess] 查找并点击下一步按钮...")

  const nextButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "下一步",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!nextButton) {
    console.error("[ShippingProcess] 未找到下一步按钮")
    return false
  }

  nextButton.click()
  console.log("[ShippingProcess] 已点击下一步按钮")
  await sleep(2000)
  return true
}

async function clickConfirmCreateButton() {
  console.log("[ShippingProcess] 查找并点击确认创建按钮...")

  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "确认创建",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!confirmButton) {
    console.error("[ShippingProcess] 未找到确认创建按钮")
    return false
  }

  confirmButton.click()
  console.log("[ShippingProcess] 已点击确认创建按钮")
  await sleep(2000)
  return true
}

async function waitForPageNavigation(
  expectedUrl: string,
  timeout: number = 30000
): Promise<boolean> {
  console.log(`[ShippingProcess] 等待页面跳转到包含 "${expectedUrl}" 的页面...`)

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkUrl = () => {
      const currentUrl = window.location.href
      if (currentUrl.includes(expectedUrl)) {
        console.log(`[ShippingProcess] 页面已跳转: ${currentUrl}`)
        resolve(true)
        return
      }

      if (Date.now() - startTime >= timeout) {
        console.warn(`[ShippingProcess] 等待页面跳转超时`)
        resolve(false)
        return
      }

      setTimeout(checkUrl, 500)
    }

    checkUrl()
  })
}

async function clickRefreshButton() {
  console.log("[ShippingProcess] 查找并点击刷新按钮...")

  const refreshButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "刷新",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!refreshButton) {
    console.error("[ShippingProcess] 未找到刷新按钮")
    return false
  }

  refreshButton.click()
  console.log("[ShippingProcess] 已点击刷新按钮")
  await sleep(3000)
  return true
}

async function selectAllOrdersForShipment() {
  console.log("[ShippingProcess] 全部勾选待装箱发货订单...")

  const headerRow = document.querySelector(
    'tr[data-testid="beast-core-table-header-tr"]'
  )
  if (!headerRow) {
    console.error("[ShippingProcess] 未找到表格头部")
    return false
  }

  const headerCheckbox = headerRow.querySelector(
    'input[type="checkbox"][mode="checkbox"]'
  ) as HTMLInputElement
  if (!headerCheckbox) {
    console.error("[ShippingProcess] 未找到全选复选框")
    return false
  }

  if (!headerCheckbox.checked) {
    headerCheckbox.click()
    console.log("[ShippingProcess] 已点击全选复选框")
    await sleep(500)
  }

  return true
}
