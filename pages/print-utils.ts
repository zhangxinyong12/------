/**
 * 打印工具函数
 * 包含打印相关的所有功能：打印接口拦截、打印标签生成、发货流程等
 */

import * as React from "react"
import { createRoot, type Root } from "react-dom/client"

import { PrintLabel } from "../components/PrintLabel"
import { findButtonByText, findDom, sleep } from "../utils/dom"

function setViewportSize() {
  if (typeof window !== "undefined" && window.innerWidth < 1280) {
    window.resizeTo(1280, 800)
  }
}

export function interceptPrintAPI(): Promise<void> {
  console.log("[PrintUtils] 开始设置打印接口拦截监听器...")

  if ((window as any).__printAPIListenerSetup) {
    console.log("[PrintUtils] 打印接口监听器已设置，跳过")
    return Promise.resolve()
  }

  ;(window as any).__printAPIListenerSetup = true

  chrome.runtime
    .sendMessage({
      type: "INJECT_PRINT_INTERCEPTOR"
    })
    .then((response) => {
      if (response && response.success) {
        console.log("[PrintUtils] 打印接口拦截脚本注入成功")
      } else {
        console.error("[PrintUtils] 打印接口拦截脚本注入失败:", response)
      }
    })
    .catch((error) => {
      console.error("[PrintUtils] 请求注入打印接口拦截脚本失败:", error)
    })

  window.addEventListener("message", async (event) => {
    if (
      event.data &&
      event.data.type === "PRINT_API_RESPONSE" &&
      event.data.source === "injected-script"
    ) {
      console.log("[PrintUtils] 收到打印接口响应:", event.data.data)

      try {
        const printData = event.data.data

        await chrome.storage.local.set({
          lastPrintData: {
            url: printData.url,
            data: printData.data,
            timestamp: printData.timestamp
          }
        })

        console.log("[PrintUtils] 打印数据已保存，等待打印预览窗口打开...")
        ;(window as any).__hasPrintData = true
      } catch (error: any) {
        console.error("[PrintUtils] 处理打印接口响应失败:", error)
      }
    }
  })

  console.log("[PrintUtils] 打印接口拦截监听器已设置")
  return Promise.resolve()
}

async function generatePDF(element: HTMLElement, fileName: string) {
  console.log("[PrintUtils] 开始生成PDF:", fileName)

  const { default: html2canvas } = await import("html2canvas")
  const { jsPDF } = await import("jspdf")

  console.log("[PrintUtils] html2canvas和jsPDF已加载")

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    logging: true
  })

  console.log(
    "[PrintUtils] Canvas已生成，尺寸:",
    canvas.width,
    "x",
    canvas.height
  )

  const imgData = canvas.toDataURL("image/png")

  const mmToPx = 3.7795
  const pdfWidth = 100
  const pdfHeight = 100
  const imgWidth = canvas.width / mmToPx
  const imgHeight = canvas.height / mmToPx

  console.log("[PrintUtils] PDF尺寸:", pdfWidth, "x", pdfHeight, "mm")
  console.log("[PrintUtils] 图片尺寸:", imgWidth, "x", imgHeight, "mm")

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pdfWidth, pdfHeight]
  })

  console.log("[PrintUtils] PDF实例已创建")

  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight)

  console.log("[PrintUtils] 图片已添加到PDF")

  pdf.save(fileName)

  console.log("[PrintUtils] PDF已保存:", fileName)
}

export async function renderPrintLabelAndGeneratePDF(
  data: any,
  fileName: string
): Promise<void> {
  console.log("[PrintUtils] 开始使用React组件渲染打印标签并生成PDF:", fileName)

  const container = document.createElement("div")
  container.id = `print-label-container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  container.style.position = "fixed"
  container.style.top = "50px"
  container.style.left = "50px"

  const mmToPx = 3.7795
  const targetSizeMm = 100
  const targetSizePx = Math.round(targetSizeMm * mmToPx)

  container.style.width = `${targetSizePx}px`
  container.style.height = `${targetSizePx}px`
  container.style.background = "white"
  container.style.zIndex = "999999"
  container.style.border = "2px solid red"
  container.style.boxShadow = "0 0 20px rgba(0,0,0,0.5)"
  document.body.appendChild(container)

  console.log("[PrintUtils] 容器已创建并显示在页面上，ID:", container.id)

  let reactRoot: Root | null = null

  try {
    reactRoot = renderPrintLabelWithReact(container, data)

    await sleep(2000)

    const qrCodeElement = container.querySelector("#qrCode")
    const barcodeElement = container.querySelector("#barcode")

    console.log("[PrintUtils] 验证二维码和条形码状态...")
    console.log("[PrintUtils] 二维码容器元素:", qrCodeElement)
    console.log("[PrintUtils] 条形码容器元素:", barcodeElement)

    let qrSvg: SVGElement | null = null
    let barSvg: SVGElement | null = null
    let retryCount = 0
    const maxRetries = 10

    while (retryCount < maxRetries && (!qrSvg || !barSvg)) {
      if (qrCodeElement) {
        qrSvg = qrCodeElement.querySelector("svg")
        if (qrSvg) {
          console.log(
            `[PrintUtils] 二维码SVG已找到，子元素数量:`,
            qrSvg.children.length
          )
        } else {
          console.log(
            `[PrintUtils] 等待二维码SVG渲染... (${retryCount + 1}/${maxRetries})`
          )
        }
      }

      if (barcodeElement) {
        barSvg = barcodeElement.querySelector("svg")
        if (barSvg) {
          console.log(
            `[PrintUtils] 条形码SVG已找到，子元素数量:`,
            barSvg.children.length
          )
        } else {
          console.log(
            `[PrintUtils] 等待条形码SVG渲染... (${retryCount + 1}/${maxRetries})`
          )
        }
      }

      if (!qrSvg || !barSvg) {
        await sleep(500)
        retryCount++
      }
    }

    if (!qrSvg) {
      console.error("[PrintUtils] 二维码SVG未找到！")
    } else {
      console.log("[PrintUtils] 二维码SVG已确认存在")
    }

    if (!barSvg) {
      console.error("[PrintUtils] 条形码SVG未找到！")
    } else {
      console.log("[PrintUtils] 条形码SVG已确认存在")
    }

    if (qrSvg || barSvg) {
      await sleep(1000)
    } else {
      console.warn("[PrintUtils] SVG未找到，等待更长时间...")
      await sleep(2000)
    }

    const finalQrSvg = container.querySelector("#qrCode svg")
    const finalBarSvg = container.querySelector("#barcode svg")
    console.log(
      "[PrintUtils] 最终检查 - 二维码SVG:",
      !!finalQrSvg,
      "条形码SVG:",
      !!finalBarSvg
    )

    const pdfFileName = `${fileName}.pdf`
    await generatePDF(container, pdfFileName)
    console.log(`[PrintUtils] PDF 已生成并下载: ${pdfFileName}`)
  } finally {
    console.log("[PrintUtils] PDF已生成，DOM容器保留在页面上供查看")
    console.log("[PrintUtils] 容器ID:", container.id)
  }
}

function renderPrintLabelWithReact(container: HTMLElement, data: any): Root {
  console.log("[PrintUtils] 开始使用React组件渲染打印标签，数据:", data)

  let labelData: any = null

  if (
    data &&
    data.result &&
    Array.isArray(data.result) &&
    data.result.length > 0
  ) {
    labelData = data.result[0]
  } else if (data && Array.isArray(data) && data.length > 0) {
    labelData = data[0]
  } else if (data && typeof data === "object") {
    labelData = data
  } else {
    throw new Error("无法解析打印标签数据")
  }

  const warehouseFull = labelData?.subWarehouseName || ""
  const warehouse = warehouseFull.replace(/\s*[（(]前置收货[）)]\s*$/, "")
  const isJIT = labelData?.purchaseStockType === 1 || false
  const isUrgent = labelData?.urgencyType === 1 || false
  const shopName = labelData?.supplierName || "Fk Style"

  const deliverTime = labelData?.deliverTime
  let printTime = new Date()
    .toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    })
    .replace(/\//g, "-")
  if (deliverTime) {
    const date = new Date(deliverTime)
    printTime = date
      .toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })
      .replace(/\//g, "-")
  }

  const productName = labelData?.productName || ""
  const skcId = labelData?.productSkcId || ""
  const sku = labelData?.skcExtCode || labelData?.nonClothSkuExtCode || ""
  const quantity = labelData?.packageSkcNum || labelData?.deliverSkcNum || 1

  const packageNo = labelData?.packageSn || ""
  const packageIndex = labelData?.packageIndex || 1
  const totalPackages = labelData?.totalPackageNum || 1
  const driverName = labelData?.driverName || ""
  const driverPhone = labelData?.driverPhone || ""

  console.log("[PrintUtils] packageSn (原始值):", labelData?.packageSn)
  console.log("[PrintUtils] packageNo (提取后):", packageNo)

  if (!packageNo) {
    console.error(
      "[PrintUtils] 警告：packageNo为空，二维码和条形码将无法生成！"
    )
  } else {
    console.log("[PrintUtils] packageNo有值，将用于生成二维码和条形码")
  }

  const deliveryMethodCode = labelData?.deliveryMethod
  let deliveryMethod = "自行配送"
  if (deliveryMethodCode === 1) {
    deliveryMethod = "自行配送"
  } else if (deliveryMethodCode === 2) {
    deliveryMethod = "自行委托第三方物流"
  } else if (deliveryMethodCode === 3) {
    deliveryMethod = "在线物流下单"
  }

  let productSpec = ""
  if (
    labelData?.nonClothSecondarySpecVOList &&
    Array.isArray(labelData.nonClothSecondarySpecVOList)
  ) {
    const specs = labelData.nonClothSecondarySpecVOList
      .map((spec: any) => spec.specName)
      .filter(Boolean)
    if (specs.length > 0) {
      productSpec = specs.join("、")
    }
  }

  let productNameDisplay = productName
  if (productSpec && productName.includes("【")) {
    productNameDisplay = productName
  } else if (productSpec) {
    productNameDisplay = `${productName}【${productSpec}】`
  }

  const root = createRoot(container)
  root.render(
    React.createElement(PrintLabel, {
      warehouse,
      isJIT,
      isUrgent,
      shopName,
      printTime,
      productName: productNameDisplay,
      skcId,
      sku,
      quantity,
      packageNo,
      packageIndex,
      totalPackages,
      deliveryMethod,
      driverName: driverName || undefined,
      driverPhone: driverPhone || undefined
    })
  )

  console.log("[PrintUtils] React组件已渲染到DOM，packageNo:", packageNo)
  return root
}

export async function clickBatchPrintLabelButton() {
  console.log("[PrintUtils] 查找并点击批量打印商品打包标签按钮...")

  const printButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "批量打印商品打包标签",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!printButton) {
    console.error("[PrintUtils] 未找到批量打印商品打包标签按钮")
    return false
  }

  if (!(window as any).__printPDFListenerSetup) {
    ;(window as any).__printPDFListenerSetup = true
  }

  printButton.click()
  console.log("[PrintUtils] 已点击批量打印商品打包标签按钮")

  await sleep(1000)

  let hasClickedContinuePrint = false
  const modalWrapper = document.querySelector(
    'div[data-testid="beast-core-modal-innerWrapper"]'
  )
  console.log("[PrintUtils] 检测到弹窗，弹窗文本:", modalWrapper)
  if (modalWrapper) {
    const knowButton = modalWrapper.querySelector(
      'button[data-testid="beast-core-button"]'
    ) as HTMLElement
    console.log("[PrintUtils] 检测到我知道了按钮，按钮文本:", knowButton)
    if (knowButton) {
      knowButton.click()
      hasClickedContinuePrint = true
    }
  }

  return true
}

export async function clickBatchBoxingShipButton(shippingMethod?: string) {
  console.log("[PrintUtils] 查找并点击批量装箱发货按钮...")

  const boxingButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "批量装箱发货",
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!boxingButton) {
    console.error("[PrintUtils] 未找到批量装箱发货按钮")
    return false
  }

  boxingButton.click()
  console.log("[PrintUtils] 已点击批量装箱发货按钮")

  console.log("[PrintUtils] 等待3秒，让弹窗出现...")
  await sleep(3000)

  const modalWrapper = document.querySelector(
    'div[data-testid="beast-core-modal-innerWrapper"]'
  )
  if (modalWrapper) {
    const modalText = modalWrapper.textContent || ""
    if (
      modalText.includes("请务必确认包裹和发货数") ||
      modalText.includes("去装箱发货")
    ) {
      console.log('[PrintUtils] 检测到确认弹窗，准备点击"去装箱发货"按钮')

      const goBoxingButton = await findButtonByText(
        'button[data-testid="beast-core-button"]',
        "去装箱发货",
        {
          timeout: 5000,
          interval: 200,
          parent: modalWrapper as Element
        }
      )

      if (goBoxingButton) {
        goBoxingButton.click()
        console.log('[PrintUtils] 已点击"去装箱发货"按钮')

        console.log("[PrintUtils] 等待抽屉出现...")
        await sleep(2000)

        const drawerContent = await findDom(
          'div[data-testid="beast-core-drawer-content"]',
          {
            timeout: 10000,
            interval: 200
          }
        )

        if (!drawerContent) {
          console.warn("[PrintUtils] 未找到抽屉内容")
          return false
        }

        console.log("[PrintUtils] 抽屉已出现，开始填写表单...")

        if (shippingMethod) {
          await selectShippingMethod(shippingMethod)
        }

        await selectNoBoxing()
        await selectQuantityOne()
        await clickConfirmShipmentButton()

        return true
      } else {
        console.warn('[PrintUtils] 未找到"去装箱发货"按钮')
        return false
      }
    }
  }

  console.warn("[PrintUtils] 未检测到确认弹窗")
  return false
}

async function selectShippingMethod(shippingMethod: string) {
  console.log(`[PrintUtils] 选择发货方式: ${shippingMethod}`)

  await sleep(1500)

  const drawerContent = document.querySelector(
    'div[data-testid="beast-core-drawer-content"]'
  )
  const searchScope = drawerContent || document

  const radioLabels = searchScope.querySelectorAll(
    'label[data-testid="beast-core-radio"]'
  )

  for (const label of Array.from(radioLabels)) {
    const labelText = label.textContent || ""
    const text = labelText.trim()

    console.log(`[PrintUtils] 检查发货方式选项: "${text}"`)

    let shouldSelect = false

    if (
      shippingMethod === "自送" &&
      (text === "自送" || text.includes("自送"))
    ) {
      shouldSelect = true
    } else if (
      shippingMethod === "自行委托第三方物流" &&
      (text === "自行委托第三方物流" ||
        text.includes("自行委托") ||
        text.includes("第三方物流"))
    ) {
      shouldSelect = true
    } else if (
      shippingMethod === "在线物流下单" &&
      (text === "在线物流下单" ||
        text.includes("在线物流") ||
        text.includes("在线下单"))
    ) {
      shouldSelect = true
    }

    if (shouldSelect) {
      const isChecked = label.getAttribute("data-checked") === "true"
      if (isChecked) {
        console.log(`[PrintUtils] 发货方式"${text}"已选中`)
        return true
      }

      const radioInput = label.querySelector(
        'input[type="radio"]'
      ) as HTMLInputElement
      if (radioInput) {
        radioInput.click()
      } else {
        ;(label as HTMLElement).click()
      }
      console.log(`[PrintUtils] 已选择发货方式: ${text}`)
      await sleep(500)
      return true
    }
  }

  console.warn(`[PrintUtils] 未找到匹配的发货方式: ${shippingMethod}`)
  return false
}

async function selectNoBoxing() {
  console.log("[PrintUtils] 选择不合包选项...")

  const drawerContent = document.querySelector(
    'div[data-testid="beast-core-drawer-content"]'
  )
  const searchScope = drawerContent || document

  const radioLabels = searchScope.querySelectorAll(
    'label[data-testid="beast-core-radio"]'
  )

  for (const label of Array.from(radioLabels)) {
    const labelText = label.textContent || ""
    const text = labelText.trim()

    if (text.includes("不合包") || text.includes("不合并")) {
      console.log(`[PrintUtils] 找到不合包选项`)
      const isChecked = label.getAttribute("data-checked") === "true"
      if (isChecked) {
        console.log("[PrintUtils] 不合包选项已选中")
        return true
      }

      const radioInput = label.querySelector(
        'input[type="radio"]'
      ) as HTMLInputElement
      if (radioInput) {
        radioInput.click()
      } else {
        ;(label as HTMLElement).click()
      }
      await sleep(500)
      return true
    }
  }

  console.warn("[PrintUtils] 未找到不合包选项")
  return false
}

async function selectQuantityOne() {
  console.log("[PrintUtils] 填写箱/包数为1...")

  const drawerContent = document.querySelector(
    'div[data-testid="beast-core-drawer-content"]'
  )
  if (!drawerContent) {
    console.warn("[PrintUtils] 未找到抽屉内容")
    return false
  }

  const labels = drawerContent.querySelectorAll("label")
  let targetInput: HTMLInputElement | null = null

  for (const label of Array.from(labels)) {
    const labelText = label.textContent || ""
    if (
      labelText.includes("箱/包数") ||
      labelText.includes("箱数") ||
      labelText.includes("包数")
    ) {
      const formItem = label.closest('div[data-testid="beast-core-form-item"]')
      if (formItem) {
        const input = formItem.querySelector(
          'input[data-testid="beast-core-inputNumber-htmlInput"]'
        ) as HTMLInputElement
        if (input) {
          targetInput = input
          break
        }
      }
    }
  }

  if (!targetInput) {
    const allInputs = drawerContent.querySelectorAll(
      'input[data-testid="beast-core-inputNumber-htmlInput"]'
    )
    for (const input of Array.from(allInputs)) {
      const placeholder = (input as HTMLInputElement).placeholder || ""
      if (
        placeholder.includes("箱子数") ||
        placeholder.includes("包数") ||
        placeholder.includes("箱/包")
      ) {
        targetInput = input as HTMLInputElement
        break
      }
    }
  }

  if (targetInput) {
    targetInput.value = "1"
    targetInput.dispatchEvent(new Event("input", { bubbles: true }))
    targetInput.dispatchEvent(new Event("change", { bubbles: true }))
    console.log("[PrintUtils] 已填写箱/包数为1")
    await sleep(500)
    return true
  }

  console.warn("[PrintUtils] 未找到箱/包数输入框")
  return false
}

async function clickConfirmShipmentButton() {
  console.log("[PrintUtils] 查找并点击最终确认发货按钮...")

  const drawerContent = document.querySelector(
    'div[data-testid="beast-core-drawer-content"]'
  )
  const searchScope = drawerContent || document

  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    "确认发货",
    {
      timeout: 10000,
      interval: 200,
      parent: searchScope as Element
    }
  )

  if (!confirmButton) {
    console.error("[PrintUtils] 未找到最终确认发货按钮")
    return false
  }

  confirmButton.click()
  console.log("[PrintUtils] 已点击最终确认发货按钮")

  console.log("[PrintUtils] 等待确认弹窗出现并完全渲染...")
  await sleep(3000)

  console.log('[PrintUtils] 通过文本"确认装箱完毕并发货？"查找弹窗...')

  const allElements = document.querySelectorAll(
    "div, span, p, h1, h2, h3, h4, h5, h6"
  )
  let titleElement: Element | null = null

  for (const el of Array.from(allElements)) {
    if (el.tagName === "HTML" || el.tagName === "BODY") {
      continue
    }

    const text = el.textContent || ""
    if (
      text.trim() === "确认装箱完毕并发货？" ||
      (text.includes("确认装箱完毕并发货") && el.children.length === 0)
    ) {
      titleElement = el
      console.log(
        '[PrintUtils] 找到包含"确认装箱完毕并发货"的元素:',
        el.tagName,
        el.className
      )
      break
    }
  }

  if (!titleElement) {
    console.warn(
      '[PrintUtils] 未找到包含"确认装箱完毕并发货"的元素，尝试查找弹窗容器...'
    )
    const popover = await findDom('div[data-testid="beast-core-portal"]', {
      timeout: 5000,
      interval: 200
    })
    if (popover) {
      const popoverMain = popover.querySelector(
        'div[data-testid="beast-core-portal-main"]'
      )
      if (popoverMain) {
        const popoverText = popoverMain.textContent || ""
        if (popoverText.includes("确认装箱完毕并发货")) {
          console.log("[PrintUtils] 通过弹窗容器找到 portal-main")
          const buttons = popoverMain.querySelectorAll(
            'button[data-testid="beast-core-button"]'
          )
          console.log(
            `[PrintUtils] 在portal-main中找到 ${buttons.length} 个按钮`
          )

          for (const btn of Array.from(buttons)) {
            const span = btn.querySelector("span")
            const spanText = span ? (span.textContent || "").trim() : ""
            const btnText = (btn.textContent || "").trim()

            console.log(
              `[PrintUtils] 检查按钮: textContent="${btnText}", span="${spanText}"`
            )

            if (spanText === "确认" || btnText === "确认") {
              ;(btn as HTMLElement).click()
              console.log('[PrintUtils] 已点击确认弹窗中的"确认"按钮')
              await sleep(2000)
              return true
            }
          }
        }
      }
    }
    await sleep(2000)
    return false
  }

  let popoverMain = titleElement.closest(
    'div[data-testid="beast-core-portal-main"]'
  )

  if (!popoverMain) {
    console.warn("[PrintUtils] 未找到 portal-main，尝试查找弹窗容器...")
    const popover = await findDom('div[data-testid="beast-core-portal"]', {
      timeout: 5000,
      interval: 200
    })
    if (popover) {
      popoverMain = popover.querySelector(
        'div[data-testid="beast-core-portal-main"]'
      )
    }
  }

  if (!popoverMain) {
    console.warn("[PrintUtils] 未找到 portal-main")
    await sleep(2000)
    return false
  }

  const popoverText = popoverMain.textContent || ""
  if (!popoverText.includes("确认装箱完毕并发货")) {
    console.warn(
      '[PrintUtils] 找到的 portal-main 不包含"确认装箱完毕并发货"，可能是错误的弹窗'
    )
    await sleep(2000)
    return false
  }

  console.log("[PrintUtils] 找到正确的 portal-main，继续查找按钮...")

  const buttons = popoverMain.querySelectorAll(
    'button[data-testid="beast-core-button"]'
  )
  console.log(`[PrintUtils] 在portal-main中找到 ${buttons.length} 个按钮`)

  for (const btn of Array.from(buttons)) {
    const span = btn.querySelector("span")
    const spanText = span ? (span.textContent || "").trim() : ""
    const btnText = (btn.textContent || "").trim()

    console.log(
      `[PrintUtils] 检查按钮: textContent="${btnText}", span="${spanText}"`
    )

    if (spanText === "确认" || btnText === "确认") {
      ;(btn as HTMLElement).click()
      console.log('[PrintUtils] 已点击确认弹窗中的"确认"按钮')
      await sleep(2000)
      return true
    }
  }

  console.warn('[PrintUtils] 未找到"确认"按钮')
  await sleep(2000)
  return false
}

export async function continueShipmentSteps(config: {
  warehouse: string
  shippingMethod: string
}) {
  console.log(
    "[PrintUtils] ============== 继续执行发货步骤（打印后刷新） ============="
  )
  console.log("[PrintUtils] 配置:", config)

  setViewportSize()

  try {
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 30000,
        interval: 200
      }
    )

    if (!paginationElement) {
      console.error("[PrintUtils] 未找到表格分页元素，可能已超时")
      return
    }

    console.log("[PrintUtils] 找到表格分页元素，表格已加载完成")

    await sleep(3000)

    console.log("[PrintUtils] 开始点击全选...")
    const headerRow = document.querySelector(
      'tr[data-testid="beast-core-table-header-tr"]'
    )
    if (!headerRow) {
      console.error("[PrintUtils] 未找到表格头部")
      return
    }

    const headerCheckbox = headerRow.querySelector(
      'input[type="checkbox"][mode="checkbox"]'
    ) as HTMLInputElement
    if (!headerCheckbox) {
      console.error("[PrintUtils] 未找到全选复选框")
      return
    }

    if (!headerCheckbox.checked) {
      headerCheckbox.click()
      console.log("[PrintUtils] 已点击全选复选框")
      await sleep(500)
    } else {
      console.log("[PrintUtils] 全选复选框已选中")
    }

    console.log("[PrintUtils] 开始点击批量装箱发货按钮...")
    await clickBatchBoxingShipButton(config.shippingMethod)

    console.log("[PrintUtils] ============== 发货步骤执行完成 =============")
  } catch (error: any) {
    console.error("[PrintUtils] 继续执行发货步骤时发生错误:", error)
  }
}

export async function executeShipmentStepsDirectly(config: {
  warehouse: string
  shippingMethod: string
}) {
  console.log(
    "[PrintUtils] ============== 直接执行发货步骤（开发测试） ============="
  )
  console.log("[PrintUtils] 配置:", config)

  setViewportSize()

  try {
    await sleep(3000)

    const paginationElement = await findDom(
      'ul[data-testid="beast-core-pagination"]',
      {
        timeout: 30000,
        interval: 200
      }
    )

    if (!paginationElement) {
      console.error("[PrintUtils] 未找到表格分页元素，可能已超时")
      return
    }

    console.log("[PrintUtils] 找到表格分页元素，表格已加载完成")

    await sleep(3000)

    console.log("[PrintUtils] 开始点击全选...")
    const headerRow = document.querySelector(
      'tr[data-testid="beast-core-table-header-tr"]'
    )
    if (!headerRow) {
      console.error("[PrintUtils] 未找到表格头部")
      return
    }

    const headerCheckbox = headerRow.querySelector(
      'input[type="checkbox"][mode="checkbox"]'
    ) as HTMLInputElement
    if (!headerCheckbox) {
      console.error("[PrintUtils] 未找到全选复选框")
      return
    }

    if (!headerCheckbox.checked) {
      headerCheckbox.click()
      console.log("[PrintUtils] 已点击全选复选框")
      await sleep(500)
    } else {
      console.log("[PrintUtils] 全选复选框已选中")
    }

    console.log("[PrintUtils] 开始点击批量打印商品打包标签按钮...")

    const printButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      "批量打印商品打包标签",
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!printButton) {
      console.error("[PrintUtils] 未找到批量打印商品打包标签按钮")
      return
    }

    printButton.click()
    console.log("[PrintUtils] 已点击批量打印商品打包标签按钮")

    await sleep(1000)

    let hasClickedContinuePrint = false
    const modalWrapper = document.querySelector(
      'div[data-testid="beast-core-modal-innerWrapper"]'
    )

    if (modalWrapper) {
      const modalText = modalWrapper.textContent || ""
      console.log(
        "[PrintUtils] 检测到弹窗，弹窗文本:",
        modalText.substring(0, 200)
      )

      if (
        modalText.includes("部分发货单已打印过打包标签") ||
        modalText.includes("不支持批量打印")
      ) {
        console.log(
          '[PrintUtils] 检测到警告弹窗：已打印过，准备点击"我知道了"按钮'
        )

        const knowButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          "我知道了",
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper as Element
          }
        )

        if (knowButton) {
          knowButton.click()
          console.log('[PrintUtils] 已点击"我知道了"按钮')
          await sleep(1000)

          console.log("[PrintUtils] 已打印过，开始点击批量装箱发货按钮...")
          await clickBatchBoxingShipButton(config.shippingMethod)

          console.log(
            "[PrintUtils] ============== 发货步骤执行完成（已打印过） ============="
          )
          return
        } else {
          console.warn('[PrintUtils] 未找到"我知道了"按钮')
        }
      }

      if (
        modalText.includes("已选") &&
        modalText.includes("个发货单") &&
        modalText.includes("请选择打包标签打印顺序")
      ) {
        console.log(
          '[PrintUtils] 检测到打印顺序选择弹窗，准备点击"继续打印"按钮'
        )

        const continuePrintButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          "继续打印",
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper as Element
          }
        )

        if (continuePrintButton) {
          console.log('[PrintUtils] 找到"继续打印"按钮，准备点击...')
          continuePrintButton.click()
          console.log(
            '[PrintUtils] 已点击"继续打印"按钮，系统将自动触发打印事件'
          )
          hasClickedContinuePrint = true
          await sleep(3000)
          console.log(
            "[PrintUtils] 系统打印弹窗应该已出现，准备刷新页面关闭..."
          )

          console.log("[PrintUtils] 刷新页面来关闭系统打印弹窗...")
          window.location.reload()

          console.log(
            "[PrintUtils] 已刷新页面，等待background继续执行后续步骤..."
          )
          return
        } else {
          console.warn('[PrintUtils] 未找到"继续打印"按钮')
        }
      }
    } else {
      console.log("[PrintUtils] 未检测到任何弹窗")
    }

    if (!hasClickedContinuePrint) {
      console.log(
        "[PrintUtils] 未检测到打印顺序弹窗，等待5秒让系统打印弹窗出现..."
      )
      await sleep(5000)

      const refreshId = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      console.log("[PrintUtils] 生成刷新标识:", refreshId)

      await chrome.storage.local.set({
        shouldContinueAfterRefresh: {
          refreshId: refreshId,
          tabId: null,
          warehouse: config.warehouse,
          shippingMethod: config.shippingMethod,
          timestamp: Date.now()
        }
      })
      console.log("[PrintUtils] 已保存刷新标志到storage")

      console.log(
        "[PrintUtils] 发送消息到background，通知刷新页面后继续执行..."
      )
      chrome.runtime
        .sendMessage({
          type: "CONTINUE_AFTER_PRINT_REFRESH",
          data: {
            refreshId: refreshId,
            warehouse: config.warehouse,
            shippingMethod: config.shippingMethod,
            url: window.location.href
          }
        })
        .then(() => {
          console.log("[PrintUtils] 已发送消息到background")
        })
        .catch((error) => {
          console.error("[PrintUtils] 发送消息到background失败:", error)
        })
    }
  } catch (error: any) {
    console.error("[PrintUtils] 直接执行发货步骤时发生错误:", error)
  }
}
