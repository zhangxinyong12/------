/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

import { findDom } from "./utils/dom"
// @ts-ignore - html2canvas和jspdf的类型定义可能不完整
import html2canvas from "html2canvas"
// @ts-ignore - html2canvas和jspdf的类型定义可能不完整
import { jsPDF } from "jspdf"

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
    const paginationElement = document.querySelector('ul[data-testid="beast-core-pagination"]')
    
    if (!paginationElement) {
      console.warn('[Content] 未找到分页元素，无法判断数据')
      return false
    }

    // 查找显示总数的元素
    const totalTextElement = paginationElement.querySelector('.PGT_totalText_5-120-1')
    
    if (!totalTextElement) {
      console.warn('[Content] 未找到分页总数文本元素，无法判断数据')
      return false
    }

    // 获取文本内容，例如"共有 9 条"
    const totalText = totalTextElement.textContent?.trim() || ''
    console.log('[Content] 分页总数文本:', totalText)

    // 使用正则表达式提取数字
    const match = totalText.match(/共有\s*(\d+)\s*条/)
    
    if (!match || match.length < 2) {
      console.warn('[Content] 无法从分页文本中提取数据条数:', totalText)
      return false
    }

    const totalCount = parseInt(match[1], 10)
    console.log('[Content] 解析到的数据条数:', totalCount)

    // 如果数据条数大于0，表示有数据
    return totalCount > 0
  } catch (error: any) {
    console.error('[Content] 检查分页数据时发生错误:', error)
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
  const {
    timeout = 10000,
    interval = 200,
    parent = document
  } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkElement = () => {
      // 查找所有匹配选择器的元素
      const elements = (parent as Element | Document).querySelectorAll(selector)
      
      // 遍历所有元素，查找文本内容包含目标文本的元素
      for (const element of Array.from(elements)) {
        const elementText = element.textContent?.trim() || ''
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setViewportSize)
    return
  }

  // 移除现有的viewport meta标签
  const existingViewport = document.querySelector('meta[name="viewport"]')
  if (existingViewport) {
    existingViewport.remove()
  }

  // 创建新的viewport meta标签，设置宽度为1920
  const viewport = document.createElement('meta')
  viewport.name = 'viewport'
  viewport.content = 'width=1920, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
  document.getElementsByTagName('head')[0].appendChild(viewport)

  // 设置body和html的最小宽度为1920px，确保内容按1920px宽度渲染
  document.documentElement.style.minWidth = '1920px'
  if (document.body) {
    document.body.style.minWidth = '1920px'
  } else {
    // 如果body还没加载，等待一下再设置
    setTimeout(() => {
      if (document.body) {
        document.body.style.minWidth = '1920px'
      }
    }, 100)
  }
}

/**
 * 开始批量执行任务
 * 接收来自background的消息后执行批量发货操作
 * @param config 用户配置（仓库、发货方式）
 */
async function startBatchTasks(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] 收到background通知，开始批量执行任务，配置:', config)
  
  // 直接执行批量发货操作
  executeBatchShipment(config)
}

/**
 * 表格行数据类型定义
 */
interface TableRowData {
  rowElement: HTMLElement // 表格行元素
  stockOrderNo: string // 备货单号
  productCode: string // 货号
  warehouse: string // 收货仓库（已处理，去除了"（前置收货）"）
  skuId: string // SKU ID
  quantity: number // 数量
  imageUrl: string // 图片URL（去除参数后的原始URL）
}

/**
 * 提取表格数据
 * 从表格中提取所有行的数据
 * @returns 表格数据数组
 */
function extractTableData(): TableRowData[] {
  const tableData: TableRowData[] = []
  
  try {
    // 查找表格body
    const tbody = document.querySelector('tbody[data-testid="beast-core-table-middle-tbody"]')
    
    if (!tbody) {
      console.warn('[Content] 未找到表格body')
      return tableData
    }

    // 查找所有数据行
    const rows = tbody.querySelectorAll('tr[data-testid="beast-core-table-body-tr"]')
    
    console.log(`[Content] 找到 ${rows.length} 行数据`)

    rows.forEach((row, index) => {
      try {
        // 提取备货单号（从包含"备货单号："的div中的a标签内提取）
        let stockOrderNo = ''
        // 查找包含"备货单号："文本的div元素（data-testid="beast-core-box"）
        const stockOrderDivs = row.querySelectorAll('div[data-testid="beast-core-box"]')
        for (const div of Array.from(stockOrderDivs)) {
          const text = div.textContent || ''
          if (text.includes('备货单号：')) {
            // 在div中查找a标签，提取备货单号
            const stockOrderLink = div.querySelector('a[data-testid="beast-core-button-link"]')
            if (stockOrderLink) {
              stockOrderNo = stockOrderLink.textContent?.trim() || ''
              break
            }
          }
        }

        // 提取货号（从包含"货号："文本的div中的span标签内提取）
        let productCode = ''
        // 查找所有div元素，通过文本内容包含"货号："来定位
        const allDivs = row.querySelectorAll('div')
        for (const div of Array.from(allDivs)) {
          const text = div.textContent || ''
          // 查找包含"货号："文本的div（排除备货单号的div，通过文本内容区分）
          if (text.includes('货号：') && !text.includes('SKC：') && !text.includes('备货单号：')) {
            // 在div中查找所有span标签，找到货号对应的span
            // 排除包含"货号："文本的span，找到后面的span（货号值）
            const allSpans = div.querySelectorAll('span')
            for (let i = 0; i < allSpans.length; i++) {
              const span = allSpans[i]
              const spanText = span.textContent?.trim() || ''
              // 跳过包含"货号："的span
              if (spanText === '货号：') {
                continue
              }
              // 跳过空的span
              if (!spanText) {
                continue
              }
              // 货号通常是字母+数字的组合，如TY-001359
              // 使用正则表达式验证货号格式
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

        // 提取收货仓库（在包含"border-bottom"的span中，去除"（前置收货）"后缀）
        const warehouseSpans = row.querySelectorAll('td span[style*="border-bottom"]')
        let warehouse = ''
        if (warehouseSpans.length > 0) {
          warehouse = warehouseSpans[0].textContent?.trim() || ''

          // 删除"（前置收货）"后缀（支持多种格式）
          // 可能的格式：
          // - "义乌宝湾1号子仓（前置收货）" - 中文括号
          // - "义乌宝湾1号子仓 (前置收货)" - 英文括号和空格
          // - "义乌宝湾1号子仓(前置收货)" - 英文括号无空格
          // - "义乌宝湾1号子仓 （前置收货）" - 中文括号和空格
          warehouse = warehouse.replace(/\s*[（(]前置收货[）)]\s*$/, '')
        }

        // 提取SKU ID（从包含"SKU ID："的div中的span标签内提取）
        let skuId = ''
        // 查找所有div，找到textContent等于"SKU ID："的直接div
        const skuIdDivs = row.querySelectorAll('div[data-testid="beast-core-box"]')
        for (const div of Array.from(skuIdDivs)) {
          const text = div.childNodes[0]?.textContent?.trim() || '' // 获取直接子文本节点
          if (text === 'SKU ID：') {
            // 在div中查找span[data-testid="beast-core-box"]标签，提取SKU ID
            const skuIdSpan = div.querySelector('span[data-testid="beast-core-box"]')
            if (skuIdSpan) {
              skuId = skuIdSpan.textContent?.trim() || ''
              break
            }
          }
        }

        // 提取数量（默认固定为1）
        const quantity = 1

        // 提取图片URL（从SKU信息列中提取，这是货号和SKU ID对应的图片）
        let imageUrl = ''
        // 查找所有td列
        const tds = row.querySelectorAll('td')
        for (const td of Array.from(tds)) {
          const tdText = td.textContent || ''
          // 查找包含"SKU ID："文本的td列（这是SKU信息列）
          if (tdText.includes('SKU ID：')) {
            // 在该td列中查找包含background-image的div元素
            const imgElement = td.querySelector('div[style*="background-image"]')
            if (imgElement) {
              const style = window.getComputedStyle(imgElement)
              const bgImage = style.backgroundImage
              // 提取URL，格式为 url("https://...")
              const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/)
              if (urlMatch && urlMatch[1]) {
                // 去除URL参数（?后面的内容）
                imageUrl = urlMatch[1].split('?')[0]
              }
            }
            break // 找到后立即退出循环
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
          
          console.log(`[Content] 第${index + 1}行数据:`, {
            stockOrderNo,
            productCode,
            warehouse,
            skuId,
            quantity,
            imageUrl
          })
        } else {
          console.warn(`[Content] 第${index + 1}行数据不完整，跳过`, {
            stockOrderNo,
            warehouse
          })
        }
      } catch (error: any) {
        console.error(`[Content] 提取第${index + 1}行数据时发生错误:`, error)
      }
    })

    console.log(`[Content] 成功提取 ${tableData.length} 条数据`)
    return tableData
  } catch (error: any) {
    console.error('[Content] 提取表格数据时发生错误:', error)
    return tableData
  }
}

/**
 * 获取店铺名称
 * @returns 店铺名称
 */
function getShopName(): string {
  try {
    // 查找店铺名称元素（在account-info_mallInfo中）
    const shopNameElement = document.querySelector('.account-info_mallInfo__ts61W div[style*="font-weight: 500"] span[data-testid="beast-core-ellipsis"] span')
    
    if (shopNameElement) {
      const shopName = shopNameElement.textContent?.trim() || ''
      console.log('[Content] 获取到店铺名称:', shopName)
      return shopName
    }

    console.warn('[Content] 未找到店铺名称元素')
    return ''
  } catch (error: any) {
    console.error('[Content] 获取店铺名称时发生错误:', error)
    return ''
  }
}

/**
 * 获取今天的日期字符串（格式：YYYYMMDD）
 * @returns 日期字符串
 */
function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * 按仓库分组数据
 * @param tableData 表格数据数组
 * @returns 按仓库分组的数据对象
 */
function groupDataByWarehouse(tableData: TableRowData[]): Record<string, TableRowData[]> {
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

/**
 * 勾选表格中的第一行
 * 通过点击复选框的div元素来触发勾选
 * @param warehouse 仓库名称（保留参数，但不使用）
 * @param groupedData 分组后的数据（保留参数，但不使用）
 */
async function selectRowsByWarehouse(warehouse: string, groupedData: Record<string, TableRowData[]>) {
  // 先取消全选（如果已选中）
  const tbody = document.querySelector('tbody[data-testid="beast-core-table-middle-tbody"]')
  if (tbody) {
    const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
    if (headerRow) {
      const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
      if (headerCheckbox && headerCheckbox.checked) {
        headerCheckbox.click()
        await sleep(500)
      }
    }
  }

  // 直接勾选表格中的第一行
  const allTableRows = tbody?.querySelectorAll('tr[data-testid="beast-core-table-body-tr"]') || []
  if (allTableRows.length > 0) {
    const firstRow = allTableRows[0] as HTMLElement
    
    // 方法1：查找复选框的label元素，然后找到其中的div元素
    const checkboxLabel = firstRow.querySelector('label[data-testid="beast-core-checkbox"]') as HTMLElement
    if (checkboxLabel) {
      const isChecked = checkboxLabel.getAttribute('data-checked') === 'true'
      
      if (!isChecked) {
        // 查找div[class*="CBX_square"]元素并点击
        const checkboxSquare = checkboxLabel.querySelector('div[class*="CBX_square"]') as HTMLElement
        if (checkboxSquare) {
          checkboxSquare.click()
          await sleep(500)
        } else {
          // 如果找不到div，直接点击label
          checkboxLabel.click()
          await sleep(500)
        }
      }
    } else {
      // 方法2：如果找不到label，尝试直接点击input
      const checkbox = firstRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
      if (checkbox && !checkbox.checked) {
        checkbox.click()
        await sleep(500)
      }
    }
  }
}

/**
 * 点击"创建发货单"按钮
 */
async function clickCreateShippingOrderButton() {
  console.log('[Content] 查找并点击创建发货单按钮...')

  const createButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '创建发货单',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!createButton) {
    console.error('[Content] 未找到创建发货单按钮')
    return false
  }

  createButton.click()
  console.log('[Content] 已点击创建发货单按钮')

  // 动态查找弹窗出现
  console.log('[Content] 等待弹窗出现（最多等待10秒）...')
  const modalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
    timeout: 10000,
    interval: 200
  })

  if (!modalWrapper) {
    console.log('[Content] 未发现弹窗，继续执行...')
    return true
  }

  console.log('[Content] 发现弹窗，检查弹窗类型...')

  // 获取弹窗文本内容，判断弹窗类型
  const modalText = modalWrapper.textContent || ''

  // 情况一：发货数量确认弹窗（"发货数一致，继续创建"）
  if (modalText.includes('发货数一致') && modalText.includes('本次共计发货')) {
    console.log('[Content] 检测到发货数量确认弹窗')

    const confirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      '发货数一致，继续创建',
      {
        timeout: 5000,
        interval: 200,
        parent: modalWrapper as Element
      }
    )

    if (confirmButton) {
      console.log('[Content] 找到"发货数一致，继续创建"按钮，准备点击...')
      confirmButton.click()
      console.log('[Content] 已点击"发货数一致，继续创建"按钮')

      // 等待3秒，不要关闭太快
      await sleep(3000)
      
      // 关闭弹窗后再等3秒
      await sleep(3000)
      return true
    } else {
      console.warn('[Content] 未找到"发货数一致，继续创建"按钮')
      return false
    }
  }

  // 情况二：同步创建弹窗（"同步创建"）
  if (modalText.includes('是否同步创建发货单')) {
    console.log('[Content] 检测到同步创建弹窗')

    const syncButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      '同步创建',
      {
        timeout: 5000,
        interval: 200,
        parent: modalWrapper as Element
      }
    )

    if (syncButton) {
      console.log('[Content] 找到"同步创建"按钮，准备点击...')
      syncButton.click()
      console.log('[Content] 已点击"同步创建"按钮')

      // 等待3秒，不要关闭太快
      await sleep(3000)
      
      // 关闭弹窗后再等3秒
      await sleep(3000)
      return true
    } else {
      console.warn('[Content] 未找到"同步创建"按钮')
      return false
    }
  }

  // 未知弹窗类型
  console.warn('[Content] 未知弹窗类型，弹窗文本:', modalText.substring(0, 100))
  await sleep(3000)
  await sleep(3000)
  return true
}

/**
 * 在创建发货单页面选择仓库
 * @param warehouse 用户选择的仓库名称
 */
async function selectWarehouseInCreatePage(warehouse: string) {
  console.log(`[Content] 在创建发货单页面选择仓库: ${warehouse}`)

  // 等待页面加载
  await sleep(2000)

  // 查找仓库选择器（单选按钮）
  // 可能的选择器：input[type="radio"] 或 data-testid 包含 warehouse 的元素
  const radioInputs = document.querySelectorAll('input[type="radio"]')

  for (const radio of Array.from(radioInputs)) {
    // 查找对应的标签文本
    const label = radio.closest('label')?.textContent || ''
    const text = label.trim()

    console.log(`[Content] 检查仓库选项: "${text}"，目标仓库: "${warehouse}"`)

    // 检查是否匹配目标仓库（支持部分匹配，如"义乌仓库"匹配"义乌宝湾1号子仓"）
    if (text.includes(warehouse)) {
      console.log(`[Content] 找到匹配的仓库选项: ${text}`)
      // 点击单选按钮
      if (radio instanceof HTMLElement) {
        radio.click()
      }
      await sleep(500)
      return true
    }
  }

  console.warn(`[Content] 未找到匹配的仓库: ${warehouse}`)
  return false
}

/**
 * 在创建发货单页面点击批量选择并选择仓库
 * @param warehouse 用户选择的仓库名称（如"莆田仓库"或"义乌仓库"）
 */
async function clickBatchSelectAndChooseWarehouseInCreatePage(warehouse: string) {
  // 等待页面加载完成
  await sleep(3000)

  // 先找到"发货仓库"的span元素，然后在这个span内查找"批量选择"按钮
  const deliveryAddressSpan = document.querySelector('span.order-info-pkg_deliveryAddress__dcPyp') as HTMLElement
  
  if (!deliveryAddressSpan) {
    console.error('[Content] 未找到发货仓库的span元素')
    return false
  }

  // 在发货仓库的span内查找"批量选择"链接
  const batchSelectLink = deliveryAddressSpan.querySelector('a[data-testid="beast-core-button-link"]') as HTMLElement

  if (!batchSelectLink) {
    console.error('[Content] 未找到发货仓库的批量选择按钮')
    return false
  }

  batchSelectLink.click()
  console.log('[Content] 已点击发货仓库的批量选择按钮')
  await sleep(1500)

  // 等待弹窗出现
  const modalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
    timeout: 10000,
    interval: 200
  })

  if (!modalWrapper) {
    console.error('[Content] 未找到批量选择弹窗')
    return false
  }

  // 点击"发货仓库"下拉框
  const selectHeader = modalWrapper.querySelector('div[data-testid="beast-core-select-header"]') as HTMLElement
  if (!selectHeader) {
    console.error('[Content] 未找到发货仓库下拉框')
    return false
  }

  selectHeader.click()
  console.log('[Content] 已点击发货仓库下拉框')
  
  // 等待3秒，让下拉列表完全展开
  await sleep(3000)

  // 等待下拉列表出现
  const dropdown = await findDom('div[data-testid="beast-core-portal"]', {
    timeout: 5000,
    interval: 200
  })

  if (!dropdown) {
    console.error('[Content] 未找到仓库下拉列表')
    return false
  }

  console.log('[Content] 找到下拉列表容器')

  // 等待3秒后再匹配查找元素
  await sleep(3000)

  // 根据HTML结构查找：在portal-main中查找ul[role="listbox"]，然后查找li[role="option"]
  const portalMain = dropdown.querySelector('div[data-testid="beast-core-portal-main"]')
  console.log('[Content] portal-main元素:', !!portalMain)

  // 查找listbox
  const listbox = portalMain?.querySelector('ul[role="listbox"]') || dropdown.querySelector('ul[role="listbox"]')
  console.log('[Content] listbox元素:', !!listbox)

  // 在listbox中查找所有选项
  let warehouseOptions: NodeListOf<Element> | null = null
  if (listbox) {
    warehouseOptions = listbox.querySelectorAll('li[role="option"]')
    console.log(`[Content] 在listbox中找到 ${warehouseOptions.length} 个选项`)
  }

  // 如果还是没找到，尝试其他方式
  if (!warehouseOptions || warehouseOptions.length === 0) {
    warehouseOptions = dropdown.querySelectorAll('li[role="option"]')
    console.log(`[Content] 在dropdown中找到 ${warehouseOptions.length} 个选项`)
  }

  if (!warehouseOptions || warehouseOptions.length === 0) {
    warehouseOptions = document.querySelectorAll('li[role="option"]')
    console.log(`[Content] 在document中找到 ${warehouseOptions.length} 个选项`)
  }

  // 在下拉列表中查找仓库选项
  // 根据用户选择的仓库，匹配"莆田仓库"或"义乌仓库"
  let targetWarehouseName = ''
  if (warehouse.includes('莆田')) {
    targetWarehouseName = '莆田仓库'
  } else if (warehouse.includes('义乌')) {
    targetWarehouseName = '义乌仓库'
  } else {
    // 如果无法匹配，尝试使用原始仓库名称
    targetWarehouseName = warehouse
  }

  console.log(`[Content] 目标仓库名称: "${targetWarehouseName}"`)
  
  if (!warehouseOptions || warehouseOptions.length === 0) {
    console.error('[Content] 未找到任何仓库选项')
    return false
  }

  console.log(`[Content] 最终找到 ${warehouseOptions.length} 个仓库选项`)
  
  // 打印所有选项的文本内容，用于调试
  Array.from(warehouseOptions).forEach((option, index) => {
    const text = option.textContent?.trim() || ''
    console.log(`[Content] 选项 ${index + 1}: "${text}"`)
  })
  
  let found = false
  for (const option of Array.from(warehouseOptions)) {
    const optionElement = option as HTMLElement
    const optionText = optionElement.textContent?.trim() || ''
    const isChecked = option.getAttribute('data-checked') === 'true'
    
    console.log(`[Content] 检查仓库选项: "${optionText}", 已选中: ${isChecked}`)
    
    // 精确匹配仓库名称
    if (optionText === targetWarehouseName) {
      console.log(`[Content] ✅ 找到匹配的仓库选项: ${optionText}`)
      
      // 如果已经选中，跳过点击
      if (isChecked) {
        console.log(`[Content] 仓库选项已选中，跳过点击`)
        found = true
        break
      }
      
      // 触发点击事件
      console.log(`[Content] 触发点击事件...`)
      optionElement.click()
      await sleep(500)
      found = true
      break
    }
  }

  if (!found) {
    console.warn(`[Content] ⚠️ 未找到匹配的仓库选项: ${targetWarehouseName}`)
    return false
  }

  // 点击确认按钮
  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '确认',
    {
      timeout: 5000,
      interval: 200,
      parent: modalWrapper as Element
    }
  )

  if (confirmButton) {
    confirmButton.click()
    console.log('[Content] 已点击批量选择确认按钮')
    
    // 等待弹窗关闭
    await sleep(3000)
    
    // 点击"确认创建"按钮
    const createConfirmButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      '确认创建',
      {
        timeout: 10000,
        interval: 200
      }
    )
    
    if (createConfirmButton) {
      createConfirmButton.click()
      console.log('[Content] 已点击确认创建按钮')
      
      // 等待3秒，让确认弹窗出现
      await sleep(3000)
      
      // 查找并点击"继续创建，已确认一致"按钮
      const continueCreateButton = await findButtonByText(
        'button[data-testid="beast-core-button"]',
        '继续创建，已确认一致',
        {
          timeout: 10000,
          interval: 200
        }
      )
      
      if (continueCreateButton) {
        continueCreateButton.click()
        console.log('[Content] 已点击继续创建，已确认一致按钮')
        
        // 等待3秒，不要立马刷新跳转
        await sleep(3000)
        
        // 发送事件到background，通知跳转到shipping-list页面
        chrome.runtime.sendMessage({
          type: 'NAVIGATE_TO_SHIPPING_LIST',
          data: {
            url: 'https://seller.kuajingmaihuo.com/main/order-manager/shipping-list'
          }
        }).catch((error) => {
          console.error('[Content] 发送跳转消息失败:', error)
        })
        
        return true
      } else {
        console.warn('[Content] 未找到继续创建，已确认一致按钮')
        return false
      }
    } else {
      console.warn('[Content] 未找到确认创建按钮')
      return false
    }
  }

  console.warn('[Content] 未找到批量选择确认按钮')
  return false
}

/**
 * 点击"批量选择"按钮并选择指定仓库
 * @param warehouse 用户选择的仓库名称
 */
async function clickBatchSelectAndChooseWarehouse(warehouse: string) {
  console.log(`[Content] 查找并点击批量选择按钮...`)

  const batchSelectButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '批量选择',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!batchSelectButton) {
    console.error('[Content] 未找到批量选择按钮')
    return false
  }

  batchSelectButton.click()
  console.log('[Content] 已点击批量选择按钮')
  await sleep(1500)

  // 在弹窗中选择仓库
  console.log(`[Content] 在批量选择弹窗中选择仓库: ${warehouse}`)

  // 查找弹窗中的仓库选项
  const modalWrapper = document.querySelector('div[data-testid="beast-core-modal-innerWrapper"]')
  if (!modalWrapper) {
    console.error('[Content] 未找到批量选择弹窗')
    return false
  }

  // 在弹窗中查找仓库选项（单选按钮或checkbox）
  const radioInputs = modalWrapper.querySelectorAll('input[type="radio"], input[type="checkbox"]')

  for (const radio of Array.from(radioInputs)) {
    const label = radio.closest('label')?.textContent || ''
    const text = label.trim()

    console.log(`[Content] 检查仓库选项: "${text}"`)

    if (text.includes(warehouse)) {
      console.log(`[Content] 找到匹配的仓库选项: ${text}`)
      if (radio instanceof HTMLElement) {
        radio.click()
      }
      await sleep(500)
      break
    }
  }

  // 点击确认按钮
  console.log('[Content] 点击批量选择确认按钮...')
  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '确认',
    {
      timeout: 5000,
      interval: 200,
      parent: modalWrapper as Element
    }
  )

  if (confirmButton) {
    confirmButton.click()
    console.log('[Content] 已点击批量选择确认按钮')
    await sleep(1500)
    return true
  }

  console.warn('[Content] 未找到批量选择确认按钮')
  return false
}

/**
 * 点击"下一步"按钮
 */
async function clickNextButton() {
  console.log('[Content] 查找并点击下一步按钮...')

  const nextButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '下一步',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!nextButton) {
    console.error('[Content] 未找到下一步按钮')
    return false
  }

  nextButton.click()
  console.log('[Content] 已点击下一步按钮')
  await sleep(2000)
  return true
}

/**
 * 点击"确认创建"按钮
 */
async function clickConfirmCreateButton() {
  console.log('[Content] 查找并点击确认创建按钮...')

  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '确认创建',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!confirmButton) {
    console.error('[Content] 未找到确认创建按钮')
    return false
  }

  confirmButton.click()
  console.log('[Content] 已点击确认创建按钮')
  await sleep(2000)
  return true
}

/**
 * 等待页面跳转并确认
 * @param expectedUrl 预期的URL关键字
 * @param timeout 超时时间（毫秒）
 */
async function waitForPageNavigation(expectedUrl: string, timeout: number = 30000): Promise<boolean> {
  console.log(`[Content] 等待页面跳转到包含 "${expectedUrl}" 的页面...`)

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkUrl = () => {
      const currentUrl = window.location.href
      if (currentUrl.includes(expectedUrl)) {
        console.log(`[Content] 页面已跳转: ${currentUrl}`)
        resolve(true)
        return
      }

      if (Date.now() - startTime >= timeout) {
        console.warn(`[Content] 等待页面跳转超时`)
        resolve(false)
        return
      }

      setTimeout(checkUrl, 500)
    }

    checkUrl()
  })
}

/**
 * 点击"刷新"按钮
 */
async function clickRefreshButton() {
  console.log('[Content] 查找并点击刷新按钮...')

  const refreshButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '刷新',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!refreshButton) {
    console.error('[Content] 未找到刷新按钮')
    return false
  }

  refreshButton.click()
  console.log('[Content] 已点击刷新按钮')
  await sleep(3000)
  return true
}

/**
 * 全部勾选待装箱发货的订单
 */
async function selectAllOrdersForShipment() {
  console.log('[Content] 全部勾选待装箱发货订单...')

  // 查找表格头部的全选复选框
  const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
  if (!headerRow) {
    console.error('[Content] 未找到表格头部')
    return false
  }

  const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
  if (!headerCheckbox) {
    console.error('[Content] 未找到全选复选框')
    return false
  }

  if (!headerCheckbox.checked) {
    headerCheckbox.click()
    console.log('[Content] 已点击全选复选框')
    await sleep(500)
  }

  return true
}

/**
 * 将元素内的所有canvas转换为img标签
 * 这样可以确保html2canvas能正确捕获canvas内容（特别是二维码）
 * @param element 要处理的元素
 */
function convertCanvasToImage(element: HTMLElement): void {
  // 获取元素所在的文档上下文（可能是主文档或iframe文档）
  const ownerDocument = element.ownerDocument || document
  
  // 查找所有canvas元素
  const canvases = element.querySelectorAll('canvas')
  
  canvases.forEach((canvas, index) => {
    try {
      // 将canvas转换为data URL
      const dataURL = canvas.toDataURL('image/png')
      
      // 在正确的文档上下文中创建img元素
      const img = ownerDocument.createElement('img')
      img.src = dataURL
      img.style.width = canvas.style.width || `${canvas.width}px`
      img.style.height = canvas.style.height || `${canvas.height}px`
      img.style.display = canvas.style.display || 'block'
      img.style.visibility = canvas.style.visibility || 'visible'
      
      // 复制canvas的所有样式
      if (canvas.style.cssText) {
        img.style.cssText = canvas.style.cssText
      }
      
      // 复制canvas的class和id
      if (canvas.className) {
        img.className = canvas.className
      }
      if (canvas.id) {
        img.id = canvas.id
      }
      
      // 替换canvas为img
      if (canvas.parentNode) {
        canvas.parentNode.insertBefore(img, canvas)
        canvas.parentNode.removeChild(canvas)
        console.log(`[Content] 已将canvas #${index} 转换为图片`)
      }
    } catch (error) {
      console.warn(`[Content] 转换canvas #${index} 失败:`, error)
    }
  })
}

/**
 * 生成PDF文件
 * 将页面内容转换为PDF并下载
 * @param element 要转换为PDF的元素（可选，默认使用整个body）
 * @param fileName PDF文件名（可选，默认使用时间戳）
 */
async function generatePDF(element?: HTMLElement, fileName?: string): Promise<void> {
  try {
    console.log('[Content] 开始生成PDF...')
    
    // 确定要转换的元素
    const targetElement = element || document.body
    
    // 在转换前，将元素内的所有canvas转换为img标签
    // 这样可以确保html2canvas能正确捕获canvas内容（特别是二维码）
    console.log('[Content] 正在将canvas转换为图片以确保正确捕获...')
    convertCanvasToImage(targetElement)
    
    // 额外等待一小段时间确保图片已加载
    await sleep(100)
    
    // 使用html2canvas将元素转换为canvas
    console.log('[Content] 正在将页面内容转换为图片...')
    const canvas = await html2canvas(targetElement, {
      scale: 2, // 提高清晰度
      useCORS: true, // 允许跨域图片
      allowTaint: true, // 允许读取canvas内容（重要：用于捕获二维码canvas）
      logging: false, // 关闭日志
      backgroundColor: '#ffffff', // 白色背景
      foreignObjectRendering: false // 禁用foreignObject渲染，确保canvas能被正确捕获
    })
    
    // 获取canvas的宽高（像素转毫米，1英寸=25.4毫米，DPI通常为96）
    const imgWidth = canvas.width
    const imgHeight = canvas.height
    const pdfWidth = (imgWidth * 25.4) / 96 // 转换为毫米
    const pdfHeight = (imgHeight * 25.4) / 96 // 转换为毫米
    
    // 创建PDF对象（A4纸张大小：210mm x 297mm）
    const pdf = new jsPDF({
      orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pdfWidth, pdfHeight] // 使用实际尺寸
    })
    
    // 将canvas转换为图片并添加到PDF
    const imgData = canvas.toDataURL('image/png')
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const finalFileName = fileName || `打印标签_${timestamp}.pdf`
    
    // 保存PDF文件
    pdf.save(finalFileName)
    
    console.log('[Content] PDF文件已生成并下载:', finalFileName)
    
    // 通知background脚本PDF已生成
    chrome.runtime.sendMessage({
      type: 'PDF_GENERATED',
      data: {
        fileName: finalFileName,
        timestamp: Date.now()
      }
    }).catch((error) => {
      console.error('[Content] 发送PDF生成通知失败:', error)
    })
  } catch (error: any) {
    console.error('[Content] 生成PDF时发生错误:', error)
    throw error
  }
}




/**
 * 设置打印接口拦截监听器
 * 通过background脚本注入拦截脚本到页面上下文，然后监听postMessage事件接收打印接口响应
 * @returns Promise，当注入完成时resolve
 */
function interceptPrintAPI(): Promise<void> {
  console.log('[Content] 开始设置打印接口拦截监听器...')
  
  // 检查是否已经设置过监听器
  if ((window as any).__printAPIListenerSetup) {
    console.log('[Content] 打印接口监听器已设置，跳过')
    return Promise.resolve()
  }
  
  // 标记监听器已设置
  ;(window as any).__printAPIListenerSetup = true
  
  // 请求background脚本注入拦截脚本到页面上下文，并返回Promise
  return chrome.runtime.sendMessage({
    type: 'INJECT_PRINT_INTERCEPTOR'
  }).then((response) => {
    if (response && response.success) {
      console.log('[Content] 打印接口拦截脚本注入成功')
    } else {
      console.error('[Content] 打印接口拦截脚本注入失败:', response)
      throw new Error('注入脚本失败')
    }
  }).catch((error) => {
    console.error('[Content] 请求注入打印接口拦截脚本失败:', error)
    throw error
  })
  
  // 监听来自注入脚本的postMessage事件
  window.addEventListener('message', async (event) => {
    // 验证消息来源，确保来自注入脚本
    if (event.data && event.data.type === 'PRINT_API_RESPONSE' && event.data.source === 'injected-script') {
      console.log('[Content] 收到打印接口响应:', event.data.data)
      
      try {
        const printData = event.data.data
        
        // 保存打印数据
        await chrome.storage.local.set({
          lastPrintData: {
            url: printData.url,
            data: printData.data,
            timestamp: printData.timestamp
          }
        })
        
        console.log('[Content] 打印数据已保存，等待打印预览窗口打开...')
        
        // 设置一个标记，表示有打印数据等待处理
        ;(window as any).__hasPrintData = true
        
      } catch (error: any) {
        console.error('[Content] 处理打印接口响应失败:', error)
      }
    }
  })
  
  console.log('[Content] 打印接口拦截监听器已设置')
}

/**
 * 渲染打印标签内容
 * 根据接口返回的数据生成打印标签的HTML
 * @param data 接口返回的数据
 * @returns HTML字符串
 */
function renderPrintLabel(data: any): string {
  try {
    console.log('[Content] 开始渲染打印标签，数据:', data)
    
    // 如果数据是字符串（HTML），直接返回
    if (typeof data === 'string') {
      // 检查是否是HTML字符串
      if (data.trim().startsWith('<')) {
        return data
      }
    }
    
    // 如果数据包含HTML内容
    if (data && (data.html || data.content || data.data)) {
      const html = data.html || data.content || data.data
      if (typeof html === 'string' && html.trim().startsWith('<')) {
        return html
      }
    }
    
    // 解析接口返回的数据结构
    // 数据结构：{ success: true, result: [{ ... }] }
    let labelData: any = null
    
    // 如果数据有result字段且是数组，取第一个元素
    if (data && data.result && Array.isArray(data.result) && data.result.length > 0) {
      labelData = data.result[0]
      console.log('[Content] 从result数组中提取第一个标签数据')
    } else if (data && Array.isArray(data) && data.length > 0) {
      // 如果数据本身就是数组，取第一个元素
      labelData = data[0]
      console.log('[Content] 数据是数组，提取第一个元素')
    } else if (data && typeof data === 'object') {
      // 如果数据本身就是对象，直接使用
      labelData = data
      console.log('[Content] 数据是对象，直接使用')
    } else {
      throw new Error('无法解析打印标签数据')
    }
    
    // 从labelData中提取字段（根据实际接口数据结构）
    // 仓库名称（去除"（前置收货）"后缀）
    const warehouseFull = labelData?.subWarehouseName || ''
    const warehouse = warehouseFull.replace(/\s*[（(]前置收货[）)]\s*$/, '')
    
    // JIT标识（根据purchaseStockType判断，1可能是JIT）
    const isJIT = labelData?.purchaseStockType === 1 || false
    
    // 加急标识（urgencyType === 1 表示加急）
    const isUrgent = labelData?.urgencyType === 1 || false
    
    // 店铺名称
    const shopName = labelData?.supplierName || 'Fk Style'
    
    // 打印时间（deliverTime是时间戳，转换为日期时间字符串）
    const deliverTime = labelData?.deliverTime
    let printTime = new Date().toLocaleString('zh-CN', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-')
    if (deliverTime) {
      const date = new Date(deliverTime)
      printTime = date.toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false
      }).replace(/\//g, '-')
    }
    
    // 产品名称
    const productName = labelData?.productName || ''
    
    // SKC ID
    const skcId = labelData?.productSkcId || ''
    
    // SKU/货号（skcExtCode或nonClothSkuExtCode）
    const sku = labelData?.skcExtCode || labelData?.nonClothSkuExtCode || ''
    
    // 数量（packageSkcNum或deliverSkcNum）
    const quantity = labelData?.packageSkcNum || labelData?.deliverSkcNum || 1
    
    // 包裹号
    const packageNo = labelData?.packageSn || ''
    
    // 包裹索引和总数
    const packageIndex = labelData?.packageIndex || 1
    const totalPackages = labelData?.totalPackageNum || 1
    
    // 司机信息
    const driverName = labelData?.driverName || ''
    const driverPhone = labelData?.driverPhone || ''
    
    // 发货方式（deliveryMethod: 1=自送）
    const deliveryMethodCode = labelData?.deliveryMethod
    let deliveryMethod = '自行配送'
    if (deliveryMethodCode === 1) {
      deliveryMethod = '自行配送'
    } else if (deliveryMethodCode === 2) {
      deliveryMethod = '自行委托第三方物流'
    } else if (deliveryMethodCode === 3) {
      deliveryMethod = '在线物流下单'
    }
    
    // 产品规格（从nonClothSecondarySpecVOList中提取）
    let productSpec = ''
    if (labelData?.nonClothSecondarySpecVOList && Array.isArray(labelData.nonClothSecondarySpecVOList)) {
      const specs = labelData.nonClothSecondarySpecVOList.map((spec: any) => spec.specName).filter(Boolean)
      if (specs.length > 0) {
        productSpec = specs.join('、')
      }
    }
    
    // 如果产品名称中包含规格，提取出来
    let productNameDisplay = productName
    if (productSpec && productName.includes('【')) {
      // 保持原有的规格格式
      productNameDisplay = productName
    } else if (productSpec) {
      productNameDisplay = `${productName}【${productSpec}】`
    }
    
    // 生成打印标签HTML（100x100mm尺寸）
    // 二维码内容为packageSn
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    @page {
      size: 100mm 100mm;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, "Microsoft YaHei", sans-serif;
      background: white;
      width: 100mm;
      height: 100mm;
      overflow: hidden;
    }
    .print-label {
      width: 100mm;
      height: 100mm;
      background: white;
      padding: 3mm 4mm;
      border: 1px solid #000;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2mm;
    }
    .label-header-left {
      flex: 1;
    }
    .warehouse-name {
      font-size: 3.5mm;
      font-weight: bold;
      margin-bottom: 1mm;
      line-height: 1.2;
    }
    .label-tags {
      display: inline-flex;
      gap: 2mm;
      margin-bottom: 2mm;
      flex-wrap: wrap;
    }
    .tag-jit {
      background: #000;
      color: #fff;
      padding: 1mm 2mm;
      font-size: 2.5mm;
      font-weight: bold;
      display: inline-block;
    }
    .tag-urgent {
      background: #fff;
      color: #000;
      border: 1px solid #000;
      padding: 1mm 2mm;
      font-size: 2.5mm;
      font-weight: bold;
      display: inline-block;
    }
    .qr-code-container {
      width: 18mm;
      height: 18mm;
      border: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
    }
    .qr-code-container canvas {
      width: 100% !important;
      height: 100% !important;
    }
    .shop-info {
      font-size: 2.8mm;
      font-weight: 500;
      margin-bottom: 1mm;
    }
    .print-time {
      font-size: 2.2mm;
      color: #333;
      margin-bottom: 2mm;
    }
    .product-info {
      margin-bottom: 2mm;
    }
    .product-name {
      font-size: 2.5mm;
      line-height: 1.3;
      margin-bottom: 1.5mm;
      word-wrap: break-word;
    }
    .sku-info {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2mm;
    }
    .sku-codes {
      font-size: 2.2mm;
      line-height: 1.4;
    }
    .sku-codes div {
      margin-bottom: 0.5mm;
    }
    .quantity {
      font-size: 3.5mm;
      font-weight: bold;
      color: #000;
    }
    .package-info {
      margin-bottom: 2mm;
    }
    .package-no {
      font-size: 3.2mm;
      font-weight: bold;
      margin-bottom: 0.5mm;
    }
    .package-count {
      font-size: 2.2mm;
      color: #333;
    }
    .barcode {
      width: 100%;
      height: 8mm;
      border: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2mm;
      color: #000;
      margin-bottom: 2mm;
      background: white;
      font-family: "Courier New", monospace;
      position: relative;
    }
    .barcode svg {
      width: 100% !important;
      height: 100% !important;
      max-height: 8mm;
    }
    .barcode-text {
      position: absolute;
      bottom: 0;
      font-size: 1.8mm;
      font-weight: bold;
    }
    .delivery-info {
      font-size: 2.2mm;
      color: #333;
      line-height: 1.4;
    }
    @media print {
      .print-label {
        border: 1px solid #000;
      }
    }
  </style>
</head>
<body>
  <div class="print-label">
    <div class="label-header">
      <div class="label-header-left">
        <div class="warehouse-name">${warehouse}</div>
        <div class="label-tags">
          ${isJIT ? '<span class="tag-jit">JIT</span>' : ''}
          ${isUrgent ? '<span class="tag-urgent">加急</span>' : ''}
        </div>
      </div>
      <div class="qr-code-container" id="qrCode"></div>
    </div>
    <div class="shop-info">${shopName}</div>
    <div class="print-time">${printTime}</div>
    <div class="product-info">
      <div class="product-name">${productNameDisplay}</div>
      <div class="sku-info">
        <div class="sku-codes">
          <div>SKC${skcId}</div>
          <div>SKU货号${sku}</div>
        </div>
        <div class="quantity">${quantity}件</div>
      </div>
    </div>
    <div class="package-info">
      <div class="package-no">${packageNo}</div>
      <div class="package-count">第${packageIndex}包 (共${totalPackages}包)</div>
    </div>
    <div class="barcode">
      <svg id="barcode"></svg>
      <div class="barcode-text">${packageNo}</div>
    </div>
    <div class="delivery-info">${deliveryMethod}${driverName ? ' · 司机' + driverName : ''}${driverPhone ? ' · 手机号:' + driverPhone : ''}</div>
  </div>
  <script>
    // 生成二维码和条形码，内容为packageSn
    (function() {
      const packageSn = '${packageNo}';
      
      // 生成二维码
      function generateQRCode() {
        const qrCodeContainer = document.getElementById('qrCode');
        if (!qrCodeContainer || !packageSn) return;
        
        // 等待QRCode库加载
        let retryCount = 0;
        const maxRetries = 20;
        
        function tryGenerateQR() {
          if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(qrCodeContainer, packageSn, {
              width: 18 * 3.779527559, // 18mm转换为像素（1mm = 3.779527559px at 96dpi）
              margin: 1,
              color: {
                dark: '#000000',
                light: '#FFFFFF'
              }
            }, function (error) {
              if (error) {
                console.error('生成二维码失败:', error);
                qrCodeContainer.innerHTML = '<div style="font-size: 2mm; color: #999;">QR</div>';
              } else {
                console.log('二维码生成成功');
                // 通知二维码已生成
                window.dispatchEvent(new CustomEvent('qrCodeGenerated'));
              }
            });
          } else {
            retryCount++;
            if (retryCount < maxRetries) {
              setTimeout(tryGenerateQR, 100);
            } else {
              console.error('QRCode库加载超时');
              qrCodeContainer.innerHTML = '<div style="font-size: 2mm; color: #999;">QR</div>';
            }
          }
        }
        
        tryGenerateQR();
      }
      
      // 生成条形码
      function generateBarcode() {
        const barcodeSvg = document.getElementById('barcode');
        if (!barcodeSvg || !packageSn) return;
        
        // 等待JsBarcode库加载
        let retryCount = 0;
        const maxRetries = 20;
        
        function tryGenerateBarcode() {
          if (typeof JsBarcode !== 'undefined') {
            try {
              JsBarcode(barcodeSvg, packageSn, {
                format: "CODE128",
                width: 1.5,
                height: 50,
                displayValue: false, // 不显示文本，因为我们用单独的div显示
                background: "#FFFFFF",
                lineColor: "#000000",
                margin: 2
              });
              console.log('条形码生成成功');
              // 通知条形码已生成
              window.dispatchEvent(new CustomEvent('barcodeGenerated'));
            } catch (error) {
              console.error('生成条形码失败:', error);
            }
          } else {
            retryCount++;
            if (retryCount < maxRetries) {
              setTimeout(tryGenerateBarcode, 100);
            } else {
              console.error('JsBarcode库加载超时');
            }
          }
        }
        
        tryGenerateBarcode();
      }
      
      // 页面加载完成后生成二维码和条形码
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          generateQRCode();
          generateBarcode();
        });
      } else {
        generateQRCode();
        generateBarcode();
      }
    })();
  </script>
</body>
</html>
    `
    
    return html.trim()
  } catch (error: any) {
    console.error('[Content] 渲染打印标签失败:', error)
    return `<div>渲染失败: ${error.message}</div>`
  }
}

/**
 * 渲染打印内容（通用方法，保留兼容性）
 * 根据接口返回的数据生成HTML内容
 * @param data 接口返回的数据
 * @returns HTML字符串
 */
function renderPrintContent(data: any): string {
  try {
    // 如果数据是字符串，直接返回
    if (typeof data === 'string') {
      return data
    }
    
    // 如果数据包含HTML内容
    if (data.html || data.content || data.data) {
      const html = data.html || data.content || data.data
      if (typeof html === 'string') {
        return html
      }
    }
    
    // 如果数据是数组，渲染列表
    if (Array.isArray(data)) {
      return data.map((item, index) => {
        if (typeof item === 'string') {
          return `<div>${item}</div>`
        }
        return `<div>${JSON.stringify(item)}</div>`
      }).join('')
    }
    
    // 默认渲染JSON格式
    return `<pre>${JSON.stringify(data, null, 2)}</pre>`
  } catch (error: any) {
    console.error('[Content] 渲染打印内容失败:', error)
    return `<div>渲染失败: ${error.message}</div>`
  }
}

/**
 * 从打印预览页面获取PDF内容
 * 通过监听打印预览页面的URL变化来获取PDF
 * 注意：这个方法需要配合background脚本使用
 */
async function capturePrintPreviewPDF(): Promise<void> {
  try {
    console.log('[Content] 尝试从打印预览页面获取PDF...')
    
    // 等待打印预览页面出现
    // Chrome的打印预览页面URL格式：chrome-extension://[extension-id]/[uuid]
    // 我们无法直接访问这个URL，但可以通过监听打印事件来捕获内容
    
    // 监听打印事件，在打印前捕获页面内容
    window.addEventListener('beforeprint', async () => {
      console.log('[Content] 检测到打印事件，准备生成PDF...')
      
      // 等待打印预览页面加载
      await sleep(2000)
      
      // 尝试获取之前保存的打印数据
      const printData = await chrome.storage.local.get('lastPrintData')
      if (printData.lastPrintData) {
        console.log('[Content] 使用保存的打印数据生成PDF')
        
        // 创建隐藏iframe渲染内容
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.top = '-9999px'
        iframe.style.left = '-9999px'
        iframe.style.width = '210mm'
        iframe.style.height = '297mm'
        document.body.appendChild(iframe)
        
        await new Promise((resolve) => {
          iframe.onload = resolve
          iframe.contentDocument!.open()
          iframe.contentDocument!.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <style>
                  body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
                </style>
              </head>
              <body>
                ${renderPrintContent(printData.lastPrintData.data)}
              </body>
            </html>
          `)
          iframe.contentDocument!.close()
        })
        
        await sleep(1000)
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        await generatePDF(iframe.contentDocument!.body, `打印标签_${timestamp}.pdf`)
        
        document.body.removeChild(iframe)
      } else {
        // 如果没有保存的数据，尝试从当前页面生成PDF
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        await generatePDF(undefined, `打印标签_${timestamp}.pdf`)
      }
    })
    
  } catch (error: any) {
    console.error('[Content] 捕获打印预览PDF时发生错误:', error)
  }
}

/**
 * 点击"批量打印商品打包标签"按钮
 * 点击后会触发浏览器打印，自动生成PDF文件
 */
async function clickBatchPrintLabelButton() {
  console.log('[Content] 查找并点击批量打印商品打包标签按钮...')

  const printButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '批量打印商品打包标签',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!printButton) {
    console.error('[Content] 未找到批量打印商品打包标签按钮')
    return false
  }

  // 注入脚本应该在页面加载时就已经注入，这里不需要再次注入
  // 只需要标记PDF监听器已设置
  if (!(window as any).__printPDFListenerSetup) {
    ;(window as any).__printPDFListenerSetup = true
  }

  printButton.click()
  console.log('[Content] 已点击批量打印商品打包标签按钮')
  
  // 等待弹窗出现
  await sleep(1000)
  
  // 检查是否有弹窗出现
  let hasClickedContinuePrint = false
  const modalWrapper = document.querySelector('div[data-testid="beast-core-modal-innerWrapper"]')
  console.log('[Content] 检测到弹窗，弹窗文本:', modalWrapper)
  if (modalWrapper) {
    
    const knowButton =  modalWrapper.querySelector(
        'button[data-testid="beast-core-button"]' ) as HTMLElement
console.log('[Content] 检测到我知道了按钮，按钮文本:', knowButton)
      if (knowButton) {
        knowButton.click()
        hasClickedContinuePrint = true
      }
      
  } 
    
  return true
}

/**
 * 点击"批量装箱发货"按钮
 * 点击后会弹出确认弹窗，需要点击"去装箱发货"按钮
 * 然后等待抽屉出现，填写表单并确认发货
 * @param shippingMethod 发货方式（可选，如果提供则自动填写）
 */
async function clickBatchBoxingShipButton(shippingMethod?: string) {
  console.log('[Content] 查找并点击批量装箱发货按钮...')

  const boxingButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '批量装箱发货',
    {
      timeout: 10000,
      interval: 200
    }
  )

  if (!boxingButton) {
    console.error('[Content] 未找到批量装箱发货按钮')
    return false
  }

  boxingButton.click()
  console.log('[Content] 已点击批量装箱发货按钮')
  
  // 等待3秒，让弹窗出现
  console.log('[Content] 等待3秒，让弹窗出现...')
  await sleep(3000)
  
  // 查找弹窗中的"去装箱发货"按钮
  const modalWrapper = document.querySelector('div[data-testid="beast-core-modal-innerWrapper"]')
  if (modalWrapper) {
    const modalText = modalWrapper.textContent || ''
    if (modalText.includes('请务必确认包裹和发货数') || modalText.includes('去装箱发货')) {
      console.log('[Content] 检测到确认弹窗，准备点击"去装箱发货"按钮')
      
      // 查找"去装箱发货"按钮
      const goBoxingButton = await findButtonByText(
        'button[data-testid="beast-core-button"]',
        '去装箱发货',
        {
          timeout: 5000,
          interval: 200,
          parent: modalWrapper as Element
        }
      )
      
      if (goBoxingButton) {
        goBoxingButton.click()
        console.log('[Content] 已点击"去装箱发货"按钮')
        
        // 等待抽屉出现
        console.log('[Content] 等待抽屉出现...')
        await sleep(2000)
        
        // 等待抽屉内容加载完成
        const drawerContent = await findDom('div[data-testid="beast-core-drawer-content"]', {
          timeout: 10000,
          interval: 200
        })
        
        if (!drawerContent) {
          console.warn('[Content] 未找到抽屉内容')
          return false
        }
        
        console.log('[Content] 抽屉已出现，开始填写表单...')
        
        // 如果提供了发货方式，则自动选择
        if (shippingMethod) {
          await selectShippingMethod(shippingMethod)
        }
        
        // 选择"不合包"
        await selectNoBoxing()
        
        // 填写箱/包数为1
        await selectQuantityOne()
        
        // 点击"确认发货"按钮
        await clickConfirmShipmentButton()
        
        return true
      } else {
        console.warn('[Content] 未找到"去装箱发货"按钮')
        return false
      }
    }
  }
  
  console.warn('[Content] 未检测到确认弹窗')
  return false
}

/**
 * 选择发货方式
 * @param shippingMethod 发货方式（自送、自行委托第三方物流、在线物流下单）
 */
async function selectShippingMethod(shippingMethod: string) {
  console.log(`[Content] 选择发货方式: ${shippingMethod}`)

  // 等待抽屉内容加载
  await sleep(1500)

  // 在抽屉中查找发货方式选项
  const drawerContent = document.querySelector('div[data-testid="beast-core-drawer-content"]')
  const searchScope = drawerContent || document

  // 查找发货方式选项（通过label的textContent）
  const radioLabels = searchScope.querySelectorAll('label[data-testid="beast-core-radio"]')

  for (const label of Array.from(radioLabels)) {
    const labelText = label.textContent || ''
    const text = labelText.trim()

    console.log(`[Content] 检查发货方式选项: "${text}"`)

    // 支持精确匹配和模糊匹配
    let shouldSelect = false
    
    if (shippingMethod === '自送' && (text === '自送' || text.includes('自送'))) {
      shouldSelect = true
    } else if (shippingMethod === '自行委托第三方物流' && (text === '自行委托第三方物流' || text.includes('自行委托') || text.includes('第三方物流'))) {
      shouldSelect = true
    } else if (shippingMethod === '在线物流下单' && (text === '在线物流下单' || text.includes('在线物流') || text.includes('在线下单'))) {
      shouldSelect = true
    }

    if (shouldSelect) {
      // 检查是否已经选中
      const isChecked = label.getAttribute('data-checked') === 'true'
      if (isChecked) {
        console.log(`[Content] 发货方式"${text}"已选中`)
        return true
      }
      
      // 点击label或内部的radio input
      const radioInput = label.querySelector('input[type="radio"]') as HTMLInputElement
      if (radioInput) {
        radioInput.click()
      } else {
        (label as HTMLElement).click()
      }
      console.log(`[Content] 已选择发货方式: ${text}`)
      await sleep(500)
      return true
    }
  }

  console.warn(`[Content] 未找到匹配的发货方式: ${shippingMethod}`)
  return false
}

/**
 * 选择"不合包"选项
 */
async function selectNoBoxing() {
  console.log('[Content] 选择不合包选项...')

  // 在抽屉中查找不合包选项
  const drawerContent = document.querySelector('div[data-testid="beast-core-drawer-content"]')
  const searchScope = drawerContent || document

  // 查找不合包选项（通过label的textContent或data-checked属性）
  const radioLabels = searchScope.querySelectorAll('label[data-testid="beast-core-radio"]')

  for (const label of Array.from(radioLabels)) {
    const labelText = label.textContent || ''
    const text = labelText.trim()

    if (text.includes('不合包') || text.includes('不合并')) {
      console.log(`[Content] 找到不合包选项`)
      // 检查是否已经选中
      const isChecked = label.getAttribute('data-checked') === 'true'
      if (isChecked) {
        console.log('[Content] 不合包选项已选中')
        return true
      }
      
      // 点击label或内部的radio input
      const radioInput = label.querySelector('input[type="radio"]') as HTMLInputElement
      if (radioInput) {
        radioInput.click()
      } else {
        (label as HTMLElement).click()
      }
      await sleep(500)
      return true
    }
  }

  console.warn('[Content] 未找到不合包选项')
  return false
}

/**
 * 选择数量为1（填写箱/包数）
 */
async function selectQuantityOne() {
  console.log('[Content] 填写箱/包数为1...')

  // 查找箱/包数输入框（根据placeholder或label查找）
  // 先尝试查找包含"箱/包数"标签的输入框
  const drawerContent = document.querySelector('div[data-testid="beast-core-drawer-content"]')
  if (!drawerContent) {
    console.warn('[Content] 未找到抽屉内容')
    return false
  }

  // 查找label包含"箱/包数"的表单项
  const labels = drawerContent.querySelectorAll('label')
  let targetInput: HTMLInputElement | null = null
  
  for (const label of Array.from(labels)) {
    const labelText = label.textContent || ''
    if (labelText.includes('箱/包数') || labelText.includes('箱数') || labelText.includes('包数')) {
      // 找到对应的输入框
      const formItem = label.closest('div[data-testid="beast-core-form-item"]')
      if (formItem) {
        // 查找输入框（可能是type="text"或type="number"）
        const input = formItem.querySelector('input[data-testid="beast-core-inputNumber-htmlInput"]') as HTMLInputElement
        if (input) {
          targetInput = input
          break
        }
      }
    }
  }

  // 如果没找到，尝试查找所有输入框，通过placeholder判断
  if (!targetInput) {
    const allInputs = drawerContent.querySelectorAll('input[data-testid="beast-core-inputNumber-htmlInput"]')
    for (const input of Array.from(allInputs)) {
      const placeholder = (input as HTMLInputElement).placeholder || ''
      if (placeholder.includes('箱子数') || placeholder.includes('包数') || placeholder.includes('箱/包')) {
        targetInput = input as HTMLInputElement
        break
      }
    }
  }

  if (targetInput) {
    targetInput.value = '1'
    // 触发input和change事件
    targetInput.dispatchEvent(new Event('input', { bubbles: true }))
    targetInput.dispatchEvent(new Event('change', { bubbles: true }))
    console.log('[Content] 已填写箱/包数为1')
    await sleep(500)
    return true
  }

  console.warn('[Content] 未找到箱/包数输入框')
  return false
}

/**
 * 点击最终"确认发货"按钮
 * 在抽屉的footer中查找
 * 点击后会弹出确认弹窗，需要点击"确认"按钮
 */
async function clickConfirmShipmentButton() {
  console.log('[Content] 查找并点击最终确认发货按钮...')

  // 在抽屉中查找确认发货按钮
  const drawerContent = document.querySelector('div[data-testid="beast-core-drawer-content"]')
  const searchScope = drawerContent || document

  const confirmButton = await findButtonByText(
    'button[data-testid="beast-core-button"]',
    '确认发货',
    {
      timeout: 10000,
      interval: 200,
      parent: searchScope as Element
    }
  )

  if (!confirmButton) {
    console.error('[Content] 未找到最终确认发货按钮')
    return false
  }

  confirmButton.click()
  console.log('[Content] 已点击最终确认发货按钮')
  
  // 等待确认弹窗出现并完全渲染
  console.log('[Content] 等待确认弹窗出现并完全渲染...')
  await sleep(3000)
  
  // 先通过文本"确认装箱完毕并发货？"找到包含这个文本的元素
  console.log('[Content] 通过文本"确认装箱完毕并发货？"查找弹窗...')
  
  // 查找所有包含文本的元素，跳过HTML、BODY等顶层元素
  const allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6')
  let titleElement: Element | null = null
  
  for (const el of Array.from(allElements)) {
    // 跳过顶层元素
    if (el.tagName === 'HTML' || el.tagName === 'BODY') {
      continue
    }
    
    const text = el.textContent || ''
    // 精确匹配文本，避免匹配到包含这个文本的父元素
    if (text.trim() === '确认装箱完毕并发货？' || (text.includes('确认装箱完毕并发货') && el.children.length === 0)) {
      titleElement = el
      console.log('[Content] 找到包含"确认装箱完毕并发货"的元素:', el.tagName, el.className)
      break
    }
  }
  
  if (!titleElement) {
    console.warn('[Content] 未找到包含"确认装箱完毕并发货"的元素，尝试查找弹窗容器...')
    // 如果找不到标题元素，直接查找弹窗容器
    const popover = await findDom('div[data-testid="beast-core-portal"]', {
      timeout: 5000,
      interval: 200
    })
    if (popover) {
      const popoverMain = popover.querySelector('div[data-testid="beast-core-portal-main"]')
      if (popoverMain) {
        // 验证这个portal-main是否包含"确认装箱完毕并发货"
        const popoverText = popoverMain.textContent || ''
        if (popoverText.includes('确认装箱完毕并发货')) {
          console.log('[Content] 通过弹窗容器找到 portal-main')
          // 在portal-main中查找所有按钮
          const buttons = popoverMain.querySelectorAll('button[data-testid="beast-core-button"]')
          console.log(`[Content] 在portal-main中找到 ${buttons.length} 个按钮`)
          
          // 查找文本为"确认"的按钮
          for (const btn of Array.from(buttons)) {
            const span = btn.querySelector('span')
            const spanText = span ? (span.textContent || '').trim() : ''
            const btnText = (btn.textContent || '').trim()
            
            console.log(`[Content] 检查按钮: textContent="${btnText}", span="${spanText}"`)
            
            if (spanText === '确认' || btnText === '确认') {
              (btn as HTMLElement).click()
              console.log('[Content] 已点击确认弹窗中的"确认"按钮')
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
  
  // 向上查找 portal-main
  let popoverMain = titleElement.closest('div[data-testid="beast-core-portal-main"]')
  
  if (!popoverMain) {
    console.warn('[Content] 未找到 portal-main，尝试查找弹窗容器...')
    // 如果找不到portal-main，尝试查找portal容器
    const popover = await findDom('div[data-testid="beast-core-portal"]', {
      timeout: 5000,
      interval: 200
    })
    if (popover) {
      popoverMain = popover.querySelector('div[data-testid="beast-core-portal-main"]')
    }
  }
  
  if (!popoverMain) {
    console.warn('[Content] 未找到 portal-main')
    await sleep(2000)
    return false
  }
  
  // 验证这个portal-main是否包含"确认装箱完毕并发货"
  const popoverText = popoverMain.textContent || ''
  if (!popoverText.includes('确认装箱完毕并发货')) {
    console.warn('[Content] 找到的 portal-main 不包含"确认装箱完毕并发货"，可能是错误的弹窗')
    await sleep(2000)
    return false
  }
  
  console.log('[Content] 找到正确的 portal-main，继续查找按钮...')
  
  // 在portal-main中查找所有按钮
  const buttons = popoverMain.querySelectorAll('button[data-testid="beast-core-button"]')
  console.log(`[Content] 在portal-main中找到 ${buttons.length} 个按钮`)
  
  // 查找文本为"确认"的按钮
  for (const btn of Array.from(buttons)) {
    // 检查按钮内的span文本
    const span = btn.querySelector('span')
    const spanText = span ? (span.textContent || '').trim() : ''
    const btnText = (btn.textContent || '').trim()
    
    console.log(`[Content] 检查按钮: textContent="${btnText}", span="${spanText}"`)
    
    if (spanText === '确认' || btnText === '确认') {
      (btn as HTMLElement).click()
      console.log('[Content] 已点击确认弹窗中的"确认"按钮')
      await sleep(2000)
      return true
    }
  }
  
  console.warn('[Content] 未找到"确认"按钮')
  await sleep(2000)
  return false
}

/**
 * 执行完整的发货流程
 * @param warehouse 仓库名称
 * @param shippingMethod 发货方式
 * @returns 是否成功
 */
async function executeShipmentProcess(warehouse: string, shippingMethod: string): Promise<boolean> {
  try {
    console.log(`[Content] 开始执行完整发货流程，仓库: ${warehouse}，发货方式: ${shippingMethod}`)

    // 步骤1: 点击"创建发货单"按钮
    if (!await clickCreateShippingOrderButton()) {
      return false
    }

    // 步骤2: 等待跳转到创建发货单页面
    if (!await waitForPageNavigation('/shipping-desk/create', 10000)) {
      console.warn('[Content] 未跳转到创建发货单页面')
      // 尝试使用"批量选择"方式
      if (!await clickBatchSelectAndChooseWarehouse(warehouse)) {
        return false
      }
    } else {
      // 步骤3: 在创建发货单页面选择仓库
      if (!await selectWarehouseInCreatePage(warehouse)) {
        return false
      }
    }

    // 步骤4: 点击"下一步"按钮
    if (!await clickNextButton()) {
      return false
    }

    // 步骤5: 点击"确认创建"按钮
    if (!await clickConfirmCreateButton()) {
      return false
    }

    // 步骤6: 等待跳转回发货台页面
    console.log('[Content] 等待跳转回发货台页面...')
    await sleep(3000)

    // 步骤7: 点击"刷新"按钮
    if (!await clickRefreshButton()) {
      return false
    }

    // 步骤8: 全部勾选待装箱发货订单
    if (!await selectAllOrdersForShipment()) {
      return false
    }

    // 步骤9: 点击"批量打印商品打包标签"按钮
    if (!await clickBatchPrintLabelButton()) {
      return false
    }

    // 步骤10: 点击"批量装箱发货"按钮（会自动填写表单）
    if (!await clickBatchBoxingShipButton(shippingMethod)) {
      return false
    }

    console.log('[Content] 完整发货流程执行成功')
    return true
  } catch (error: any) {
    console.error('[Content] 执行发货流程时发生错误:', error)
    return false
  }
}

/**
 * 测试关闭打印弹窗功能
 * 点击表格第一行的"打印商品打包标签"，处理确认弹窗，等待5秒后关闭打印弹窗
 */
async function testClosePrintDialog() {
  console.log('[Content] ============== 开始测试关闭打印弹窗 =============')
  
  try {
    // 等待表格加载完成
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000,
      interval: 200
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素')
      return false
    }

    // 等待3秒，确保表格完全渲染完成
    await sleep(3000)

    // 查找表格第一行
    const firstRow = document.querySelector('tr[data-testid="beast-core-table-body-tr"]')
    if (!firstRow) {
      console.error('[Content] 未找到表格第一行')
      return false
    }

    // 在第一行中查找所有链接，找到包含"打印商品打包标签"文本的链接
    const allLinks = firstRow.querySelectorAll('a[data-testid="beast-core-button-link"]')
    let printLink: HTMLElement | null = null
    
    for (const link of Array.from(allLinks)) {
      const linkText = link.textContent?.trim() || ''
      if (linkText.includes('打印商品打包标签')) {
        printLink = link as HTMLElement
        break
      }
    }
    
    if (!printLink) {
      console.error('[Content] 未找到打印商品打包标签链接')
      return false
    }

    console.log('[Content] 找到打印商品打包标签链接，准备点击...')
    printLink.click()
    console.log('[Content] 已点击打印商品打包标签链接')
    
    // 等待确认弹窗出现
    await sleep(1000)
    
    // 检查是否有确认弹窗（"当前发货单已打印过打包标签，确认再次打印？"）
    const modalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
      timeout: 5000,
      interval: 200
    })
    
    if (modalWrapper) {
      const modalText = modalWrapper.textContent || ''
      if (modalText.includes('当前发货单已打印过打包标签') || modalText.includes('确认再次打印')) {
        console.log('[Content] 检测到确认弹窗，准备点击"继续打印"按钮')
        
        // 查找"继续打印"按钮
        const continuePrintButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          '继续打印',
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper as Element
          }
        )
        
        if (continuePrintButton) {
          continuePrintButton.click()
          console.log('[Content] 已点击"继续打印"按钮')
          await sleep(500)
        } else {
          console.warn('[Content] 未找到"继续打印"按钮')
        }
      }
    }
    
    // 等待5秒，让打印弹窗出现（打印弹窗出现较慢）
    console.log('[Content] 等待5秒，让打印弹窗出现...')
    await sleep(5000)
    
    // 关闭打印弹窗（通过发送ESC键事件）
    console.log('[Content] 开始关闭打印弹窗...')
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    })
    window.dispatchEvent(escEvent)
    
    // 也尝试发送keyup事件
    const escKeyUpEvent = new KeyboardEvent('keyup', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    })
    window.dispatchEvent(escKeyUpEvent)
    
    // 也尝试发送keypress事件
    const escKeyPressEvent = new KeyboardEvent('keypress', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true
    })
    window.dispatchEvent(escKeyPressEvent)
    
    console.log('[Content] 已尝试关闭打印弹窗')
    await sleep(500)
    
    console.log('[Content] ============== 测试关闭打印弹窗完成 =============')
    return true
  } catch (error: any) {
    console.error('[Content] 测试关闭打印弹窗时发生错误:', error)
    return false
  }
}

/**
 * 从表格行中提取备货单号
 * @param row 表格行元素
 * @returns 备货单号，如果未找到则返回空字符串
 */
function extractStockOrderNoFromRow(row: HTMLElement): string {
  try {
    // 查找包含"备货单号："文本的div元素（data-testid="beast-core-box"）
    const stockOrderDivs = row.querySelectorAll('div[data-testid="beast-core-box"]')
    for (const div of Array.from(stockOrderDivs)) {
      const text = div.textContent || ''
      if (text.includes('备货单号：')) {
        // 在div中查找a标签，提取备货单号
        const stockOrderLink = div.querySelector('a[data-testid="beast-core-button-link"]')
        if (stockOrderLink) {
          const stockOrderNo = stockOrderLink.textContent?.trim() || ''
          if (stockOrderNo) {
            return stockOrderNo
          }
        }
      }
    }
    return ''
  } catch (error: any) {
    console.error('[Content] 提取备货单号时发生错误:', error)
    return ''
  }
}

/**
 * 监听并处理 blob URL，生成 PDF
 * @param blobURL blob URL
 * @param fileName PDF文件名（不含扩展名）
 */
async function handleBlobURLAndGeneratePDF(blobURL: string, fileName: string): Promise<void> {
  try {
    console.log(`[Content] 开始处理 blob URL: ${blobURL}`)
    
    // 使用 fetch 获取 blob 内容
    const response = await fetch(blobURL)
    const blob = await response.blob()
    
    // 将 blob 转换为文本
    const text = await blob.text()
    console.log(`[Content] 获取到 blob 内容，长度: ${text.length}`)
    
    // 创建隐藏的 iframe 来渲染 blob 内容
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '210mm'
    iframe.style.height = '297mm'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    
    // 等待 iframe 加载
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve()
      iframe.src = blobURL
    })
    
    // 等待内容渲染
    await sleep(2000)
    
    // 从 iframe 中生成 PDF
    const iframeBody = iframe.contentDocument?.body
    if (iframeBody) {
      const pdfFileName = `${fileName}.pdf`
      await generatePDF(iframeBody, pdfFileName)
      console.log(`[Content] PDF 已生成: ${pdfFileName}`)
    } else {
      console.error('[Content] 无法获取 iframe body')
    }
    
    // 移除 iframe
    document.body.removeChild(iframe)
  } catch (error: any) {
    console.error('[Content] 处理 blob URL 并生成 PDF 时发生错误:', error)
  }
}

/**
 * 监听 blob URL 的创建（针对特定域名）
 * 使用全局监听器，在点击"继续打印"时设置标记，然后捕获下一个匹配的 blob URL
 * @param expectedDomain 期望的域名（如 seller.kuajingmaihuo.com）
 * @param timeout 超时时间（毫秒）
 * @returns Promise，resolve 时返回 blob URL
 */
function waitForBlobURL(expectedDomain: string, timeout: number = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    
    // 创建一个唯一的标记ID
    const markerId = `blob_listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 设置全局标记，表示正在等待 blob URL
    ;(window as any).__waitingForBlobURL = markerId
    
    // 保存原始的 createObjectURL 函数（如果还没有保存）
    if (!(window as any).__originalCreateObjectURL) {
      ;(window as any).__originalCreateObjectURL = URL.createObjectURL
    }
    const originalCreateObjectURL = (window as any).__originalCreateObjectURL
    
    // 创建一个临时的拦截器
    const blobInterceptor = function(blob: Blob | MediaSource): string {
      const blobURL = originalCreateObjectURL.call(URL, blob)
      
      // 检查是否正在等待，且是目标域名的 blob URL
      if ((window as any).__waitingForBlobURL === markerId && blobURL.includes(expectedDomain)) {
        console.log(`[Content] 检测到目标 blob URL: ${blobURL}`)
        
        // 清除等待标记
        ;(window as any).__waitingForBlobURL = null
        
        // 清除超时检查
        clearTimeout(timeoutId)
        
        resolve(blobURL)
        return blobURL
      }
      
      return blobURL
    }
    
    // 设置拦截器
    URL.createObjectURL = blobInterceptor as typeof URL.createObjectURL
    
    // 设置超时
    const timeoutId = setTimeout(() => {
      // 清除等待标记
      if ((window as any).__waitingForBlobURL === markerId) {
        ;(window as any).__waitingForBlobURL = null
      }
      
      // 恢复原始函数（如果当前还是我们的拦截器）
      if (URL.createObjectURL === blobInterceptor) {
        URL.createObjectURL = originalCreateObjectURL
      }
      
      reject(new Error('等待 blob URL 超时'))
    }, timeout)
  })
}

/**
 * 点击待仓库收货标签页
 * 查找并点击"待仓库收货"标签，然后等待页面和表格加载完成
 */
async function clickWarehouseReceiptTab() {
  console.log('[Content] ============== 开始点击待仓库收货标签 =============')
  
  try {
    // 查找包含"待仓库收货"文本的标签元素
    // 根据用户提供的HTML结构，标签在 data-testid="beast-core-tab-itemLabel" 的div中
    const tabLabels = document.querySelectorAll('div[data-testid="beast-core-tab-itemLabel"]')
    
    let targetTab: HTMLElement | null = null
    
    // 遍历所有标签，查找文本内容为"待仓库收货"的标签
    for (const label of Array.from(tabLabels)) {
      const labelText = label.textContent?.trim() || ''
      console.log('[Content] 检查标签:', labelText)
      
      if (labelText === '待仓库收货') {
        // 找到目标标签，向上查找可点击的父元素
        // 根据HTML结构，可点击的元素应该是包含 data-testid="beast-core-tab-itemLabel-wrapper" 的div
        const wrapper = label.closest('div[data-testid="beast-core-tab-itemLabel-wrapper"]')
        
        if (wrapper) {
          targetTab = wrapper as HTMLElement
          console.log('[Content] 找到待仓库收货标签')
          break
        }
      }
    }
    
    if (!targetTab) {
      console.error('[Content] 未找到待仓库收货标签')
      return false
    }
    
    // 检查标签是否已经激活（已选中）
    // 由于class是动态的，通过检查是否包含TAB_active相关的class来判断
    const isActive = Array.from(targetTab.classList).some(className => className.includes('TAB_active'))
    if (isActive) {
      console.log('[Content] 待仓库收货标签已经激活，无需点击')
    } else {
      // 点击标签
      console.log('[Content] 点击待仓库收货标签...')
      targetTab.click()
      console.log('[Content] 已点击待仓库收货标签')
    }
    
    // 等待3秒，让页面加载和表格加载
    console.log('[Content] 等待3秒，让页面和表格加载...')
    await sleep(3000)
    
    // 验证表格是否已加载（查找分页元素）
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 10000,
      interval: 200
    })
    
    if (paginationElement) {
      console.log('[Content] 表格已加载完成')
    } else {
      console.warn('[Content] 表格可能未完全加载，但继续执行')
    }
    
    // 等待表格完全渲染
    await sleep(2000)
    
    // ========== 第一部分：主动流程 - 依次触发各种点击事件 ==========
    console.log('[Content] ========== 【主动流程】开始依次触发点击事件 ==========')
    
    // 步骤1：点击全选checkbox
    console.log('[Content] 【主动流程】步骤1：查找并点击全选checkbox')
    const checkboxes = document.querySelectorAll('input[type="checkbox"]')
    let selectAllCheckbox: HTMLElement | null = null
    
    // 查找全选checkbox（通常是表头的第一个checkbox）
    for (const checkbox of Array.from(checkboxes)) {
      const checkboxElement = checkbox as HTMLElement
      // 检查是否在表头区域（thead）
      const isInHeader = checkbox.closest('thead') !== null
      if (isInHeader) {
        selectAllCheckbox = checkboxElement
        console.log('[Content] 【主动流程】找到全选checkbox')
        break
      }
    }
    
    if (!selectAllCheckbox) {
      console.error('[Content] 【主动流程】未找到全选checkbox')
      return false
    }
    
    // 检查是否已选中，如果未选中则点击
    const isChecked = (selectAllCheckbox as HTMLInputElement).checked
    if (!isChecked) {
      console.log('[Content] 【主动流程】点击全选checkbox...')
      selectAllCheckbox.click()
      console.log('[Content] 【主动流程】已点击全选checkbox')
      await sleep(1000) // 等待选中状态更新
    } else {
      console.log('[Content] 【主动流程】表格已全选，跳过点击')
    }
    
    // 步骤2：处理全选后可能出现的弹窗
    console.log('[Content] 【主动流程】步骤2：检查并处理全选后的弹窗')
    await sleep(500) // 等待弹窗出现
    const modalWrapperAfterSelect = document.querySelector('div[data-testid="beast-core-modal-innerWrapper"]')
    if (modalWrapperAfterSelect) {
      console.log('[Content] 【主动流程】检测到弹窗，查找确认按钮...')
      const confirmButton = modalWrapperAfterSelect.querySelector('button[data-testid="beast-core-button"]') as HTMLElement
      if (confirmButton) {
        const buttonText = confirmButton.textContent?.trim() || ''
        console.log(`[Content] 【主动流程】找到弹窗按钮: ${buttonText}`)
        confirmButton.click()
        console.log('[Content] 【主动流程】已点击弹窗确认按钮')
        await sleep(1000) // 等待弹窗关闭
      }
    } else {
      console.log('[Content] 【主动流程】未检测到弹窗，继续执行')
    }
    
    // 步骤3：查找并点击批量打印按钮
    console.log('[Content] 【主动流程】步骤3：查找并点击批量打印按钮')
    const buttons = document.querySelectorAll('button[data-testid="beast-core-button"]')
    let batchPrintButton: HTMLElement | null = null
    
    // 遍历所有按钮，查找文本内容为"批量打印商品打包标签"的按钮
    for (const button of Array.from(buttons)) {
      const buttonText = button.textContent?.trim() || ''
      if (buttonText === '批量打印商品打包标签') {
        batchPrintButton = button as HTMLElement
        console.log('[Content] 【主动流程】找到批量打印商品打包标签按钮')
        break
      }
    }
    
    if (!batchPrintButton) {
      console.error('[Content] 【主动流程】未找到批量打印商品打包标签按钮')
      return false
    }
    
    // 步骤4：点击批量打印按钮
    console.log('[Content] 【主动流程】步骤4：点击批量打印按钮')
    batchPrintButton.click()
    console.log('[Content] 【主动流程】已点击批量打印商品打包标签按钮')
    
    // 步骤5：等待打印弹窗出现，并点击弹窗中的按钮
    console.log('[Content] 【主动流程】步骤5：等待打印弹窗出现并点击按钮')
    await sleep(1000) // 等待弹窗出现
    const printModalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
      timeout: 5000,
      interval: 200
    })
    
    if (printModalWrapper) {
      console.log('[Content] 【主动流程】打印弹窗已出现，查找弹窗中的按钮')
      // 查找弹窗中的"继续打印"或其他按钮
      const printModalButtons = printModalWrapper.querySelectorAll('button[data-testid="beast-core-button"]')
      let continuePrintButton: HTMLElement | null = null
      
      for (const button of Array.from(printModalButtons)) {
        const buttonText = button.textContent?.trim() || ''
        console.log(`[Content] 【主动流程】检查弹窗按钮: ${buttonText}`)
        // 查找"继续打印"或类似的按钮
        if (buttonText.includes('继续') || buttonText.includes('打印') || buttonText.includes('确认')) {
          continuePrintButton = button as HTMLElement
          console.log(`[Content] 【主动流程】找到弹窗按钮: ${buttonText}`)
          break
        }
      }
      
      if (continuePrintButton) {
        console.log('[Content] 【主动流程】点击弹窗中的按钮...')
        continuePrintButton.click()
        console.log('[Content] 【主动流程】已点击弹窗中的按钮')
      } else {
        console.warn('[Content] 【主动流程】未找到弹窗中的按钮，继续执行')
      }
    } else {
      console.warn('[Content] 【主动流程】未检测到打印弹窗，继续执行')
    }
    
    console.log('[Content] ========== 【主动流程】所有点击操作已完成 ==========')
    
    // ========== 第二部分：被动监听流程 - 等待接口拦截器发送事件 ==========
    console.log('[Content] ========== 【被动监听】开始设置接口拦截监听器 ==========')
    
    // 确保接口拦截器已设置（全局拦截器应该在页面加载时就已经设置）
    if (!(window as any).__printAPIListenerSetup) {
      console.warn('[Content] 【被动监听】警告：全局拦截器未设置，立即设置...')
      await interceptPrintAPI()
      await sleep(500) // 等待注入完成
    } else {
      console.log('[Content] 【被动监听】全局接口拦截器已就绪')
    }
    
    // 创建Promise来等待批量打印接口数据
    let printDataResolve: ((data: any) => void) | null = null
    let printDataReject: ((error: Error) => void) | null = null
    const printDataPromise = new Promise<any>((resolve, reject) => {
      printDataResolve = resolve
      printDataReject = reject
    })
    
    // 设置临时标记，用于识别本次批量打印接口
    const tempMarkerId = `batch_print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    ;(window as any).__waitingForBatchPrintData = tempMarkerId
    
    // 设置postMessage监听器，被动接收来自注入脚本的打印接口数据
    const messageHandler = async (event: MessageEvent) => {
      // 验证消息来源，确保来自注入脚本
      if (event.data && event.data.type === 'PRINT_API_RESPONSE' && event.data.source === 'injected-script') {
        const printData = event.data.data
        const url = printData.url || ''
        
        // 检查是否是批量打印接口（printBoxMarks）
        if (url.includes('printBoxMarks')) {
          console.log(`[Content] 【被动监听】✅ 检测到批量打印标签接口调用: ${url}`)
          
          // 检查是否正在等待批量打印数据（通过标记ID匹配）
          if ((window as any).__waitingForBatchPrintData === tempMarkerId) {
            // 移除监听器
            window.removeEventListener('message', messageHandler)
            
            // 清除等待标记
            ;(window as any).__waitingForBatchPrintData = null
            
            try {
              // ========== 打印拦截到的完整接口数据 ==========
              console.log('========================================')
              console.log('[Content] 【被动监听】🎯 ========== 拦截到打印接口数据 ==========')
              console.log('========================================')
              
              // 打印原始数据对象
              console.log('[Content] 【被动监听】📋 原始 printData 对象:', printData)
              console.log('[Content] 【被动监听】📋 接口URL:', url)
              console.log('[Content] 【被动监听】📋 时间戳:', printData.timestamp)
              
              let data = printData.data
              
              // 打印原始数据类型
              console.log('[Content] 【被动监听】📋 原始数据类型:', typeof data)
              console.log('[Content] 【被动监听】📋 原始数据长度:', typeof data === 'string' ? data.length : 'N/A')
              
              // 如果数据是字符串，尝试解析JSON
              if (typeof data === 'string') {
                console.log('[Content] 【被动监听】📋 原始字符串数据（完整）:')
                console.log(data)
                
                try {
                  data = JSON.parse(data)
                  console.log('[Content] 【被动监听】📋 解析后的JSON数据:')
                  console.log(JSON.stringify(data, null, 2))
                  console.log('[Content] 【被动监听】📋 JSON数据类型:', typeof data)
                  console.log('[Content] 【被动监听】📋 JSON数据键名:', data && typeof data === 'object' ? Object.keys(data) : 'N/A')
                } catch (parseError) {
                  console.log('[Content] 【被动监听】📋 数据不是有效的JSON格式')
                  console.log('[Content] 【被动监听】📋 解析错误:', parseError)
                }
              } else {
                console.log('[Content] 【被动监听】📋 数据（非字符串）:')
                console.log(data)
                console.log('[Content] 【被动监听】📋 数据类型:', typeof data)
                if (data && typeof data === 'object') {
                  console.log('[Content] 【被动监听】📋 数据键名:', Object.keys(data))
                  console.log('[Content] 【被动监听】📋 数据字符串化:')
                  console.log(JSON.stringify(data, null, 2))
                }
              }
              
              console.log('========================================')
              console.log('[Content] 【被动监听】✅ ========== 数据打印完成 ==========')
              console.log('========================================')
              
              // 保存数据到background
              try {
                console.log('[Content] 【被动监听】📦 保存打印数据到background...')
                await chrome.runtime.sendMessage({
                  type: 'SAVE_BATCH_PRINT_DATA',
                  data: {
                    printData: data,
                    timestamp: Date.now()
                  }
                })
                console.log('[Content] 【被动监听】✅ 打印数据已保存到background')
              } catch (error: any) {
                console.error('[Content] 【被动监听】❌ 保存打印数据到background失败:', error)
              }
              
              // ========== 开始渲染并生成PDF ==========
              console.log('[Content] 【被动监听】🎨 ========== 开始渲染打印标签并生成PDF ==========')
              
              try {
                // 解析打印数据
                let printDataToRender = data
                
                // 如果数据有result字段且是数组，遍历每个标签数据并生成PDF
                if (printDataToRender && printDataToRender.result && Array.isArray(printDataToRender.result)) {
                  console.log(`[Content] 【被动监听】📋 找到 ${printDataToRender.result.length} 个打印标签数据`)
                  
                  // 遍历每个标签数据，生成PDF
                  for (let i = 0; i < printDataToRender.result.length; i++) {
                    const labelData = printDataToRender.result[i]
                    
                    // 提取备货单号作为文件名
                    const stockOrderNo = labelData.subPurchaseOrderSn || labelData.deliveryOrderSn || `打印标签_${Date.now()}_${i}`
                    const fileName = `${stockOrderNo}`
                    
                    console.log(`[Content] 【被动监听】🎨 开始渲染第 ${i + 1}/${printDataToRender.result.length} 个标签: ${fileName}`)
                    
                    // 渲染打印标签HTML（只渲染单个标签数据）
                    const printLabelHTML = renderPrintLabel({ result: [labelData] })
                    
                    // 创建隐藏的iframe来渲染打印标签（100x100mm）
                    const iframe = document.createElement('iframe')
                    iframe.style.position = 'fixed'
                    iframe.style.top = '-9999px'
                    iframe.style.left = '-9999px'
                    iframe.style.width = '100mm'
                    iframe.style.height = '100mm'
                    iframe.style.border = 'none'
                    document.body.appendChild(iframe)
                    
                    // 等待iframe加载
                    await new Promise<void>((resolve) => {
                      iframe.onload = () => resolve()
                      iframe.contentDocument!.open()
                      iframe.contentDocument!.write(printLabelHTML)
                      iframe.contentDocument!.close()
                    })
                    
                    // 等待内容渲染和二维码、条形码生成
                    await sleep(2000)
                    
                    // 等待二维码和条形码生成完成
                    const iframeWindow = iframe.contentWindow
                    if (iframeWindow) {
                      // 创建Promise等待二维码和条形码生成事件
                      const waitForQRCode = new Promise<void>((resolve) => {
                        iframeWindow.addEventListener('qrCodeGenerated', () => {
                          console.log('[Content] 【被动监听】✅ 二维码已生成')
                          resolve()
                        }, { once: true })
                        // 超时检查
                        setTimeout(() => {
                          const qrCodeElement = iframe.contentDocument?.getElementById('qrCode')
                          if (qrCodeElement && qrCodeElement.querySelector('canvas')) {
                            console.log('[Content] 【被动监听】✅ 二维码已生成（通过检查）')
                            resolve()
                          } else {
                            console.warn('[Content] 【被动监听】⚠️ 二维码生成超时，继续执行')
                            resolve()
                          }
                        }, 5000)
                      })
                      
                      const waitForBarcode = new Promise<void>((resolve) => {
                        iframeWindow.addEventListener('barcodeGenerated', () => {
                          console.log('[Content] 【被动监听】✅ 条形码已生成')
                          resolve()
                        }, { once: true })
                        // 超时检查
                        setTimeout(() => {
                          const barcodeElement = iframe.contentDocument?.getElementById('barcode')
                          if (barcodeElement && barcodeElement.querySelector('svg')) {
                            console.log('[Content] 【被动监听】✅ 条形码已生成（通过检查）')
                            resolve()
                          } else {
                            console.warn('[Content] 【被动监听】⚠️ 条形码生成超时，继续执行')
                            resolve()
                          }
                        }, 5000)
                      })
                      
                      // 等待二维码和条形码都生成完成
                      await Promise.all([waitForQRCode, waitForBarcode])
                      
                      // 额外等待500ms确保渲染完成
                      await sleep(500)
                    } else {
                      // 如果无法访问iframe window，使用传统方式等待
                      await sleep(3000)
                      console.warn('[Content] 【被动监听】⚠️ 无法访问iframe window，使用传统等待方式')
                    }
                    
                    // 从iframe中生成PDF
                    const iframeBody = iframe.contentDocument?.body
                    if (iframeBody) {
                      const pdfFileName = `${fileName}.pdf`
                      await generatePDF(iframeBody, pdfFileName)
                      console.log(`[Content] 【被动监听】✅ PDF 已生成并下载: ${pdfFileName}`)
                    } else {
                      console.error(`[Content] 【被动监听】❌ 无法获取iframe body`)
                    }
                    
                    // 移除iframe
                    document.body.removeChild(iframe)
                    
                    // 等待一段时间再处理下一个（避免浏览器下载冲突）
                    if (i < printDataToRender.result.length - 1) {
                      await sleep(1000)
                    }
                  }
                  
                  console.log('[Content] 【被动监听】✅ ========== 所有PDF生成完成 ==========')
                } else if (printDataToRender && Array.isArray(printDataToRender)) {
                  // 如果数据本身就是数组
                  console.log(`[Content] 【被动监听】📋 数据是数组，找到 ${printDataToRender.length} 个打印标签数据`)
                  
                  for (let i = 0; i < printDataToRender.length; i++) {
                    const labelData = printDataToRender[i]
                    const stockOrderNo = labelData.subPurchaseOrderSn || labelData.deliveryOrderSn || `打印标签_${Date.now()}_${i}`
                    const fileName = `${stockOrderNo}`
                    
                    console.log(`[Content] 【被动监听】🎨 开始渲染第 ${i + 1}/${printDataToRender.length} 个标签: ${fileName}`)
                    
                    const printLabelHTML = renderPrintLabel({ result: [labelData] })
                    
                    const iframe = document.createElement('iframe')
                    iframe.style.position = 'fixed'
                    iframe.style.top = '-9999px'
                    iframe.style.left = '-9999px'
                    iframe.style.width = '100mm'
                    iframe.style.height = '100mm'
                    iframe.style.border = 'none'
                    document.body.appendChild(iframe)
                    
                    await new Promise<void>((resolve) => {
                      iframe.onload = () => resolve()
                      iframe.contentDocument!.open()
                      iframe.contentDocument!.write(printLabelHTML)
                      iframe.contentDocument!.close()
                    })
                    
                    // 等待内容渲染和二维码、条形码生成
                    await sleep(2000)
                    
                    // 等待二维码和条形码生成完成
                    const iframeWindow = iframe.contentWindow
                    if (iframeWindow) {
                      const waitForQRCode = new Promise<void>((resolve) => {
                        iframeWindow.addEventListener('qrCodeGenerated', () => resolve(), { once: true })
                        setTimeout(() => {
                          const qrCodeElement = iframe.contentDocument?.getElementById('qrCode')
                          if (qrCodeElement && qrCodeElement.querySelector('canvas')) {
                            resolve()
                          } else {
                            resolve()
                          }
                        }, 5000)
                      })
                      
                      const waitForBarcode = new Promise<void>((resolve) => {
                        iframeWindow.addEventListener('barcodeGenerated', () => resolve(), { once: true })
                        setTimeout(() => {
                          const barcodeElement = iframe.contentDocument?.getElementById('barcode')
                          if (barcodeElement && barcodeElement.querySelector('svg')) {
                            resolve()
                          } else {
                            resolve()
                          }
                        }, 5000)
                      })
                      
                      await Promise.all([waitForQRCode, waitForBarcode])
                      await sleep(500)
                    } else {
                      await sleep(3000)
                    }
                    
                    const iframeBody = iframe.contentDocument?.body
                    if (iframeBody) {
                      const pdfFileName = `${fileName}.pdf`
                      await generatePDF(iframeBody, pdfFileName)
                      console.log(`[Content] 【被动监听】✅ PDF 已生成并下载: ${pdfFileName}`)
                    }
                    
                    document.body.removeChild(iframe)
                    
                    if (i < printDataToRender.length - 1) {
                      await sleep(1000)
                    }
                  }
                  
                  console.log('[Content] 【被动监听】✅ ========== 所有PDF生成完成 ==========')
                } else {
                  // 单个标签数据
                  console.log('[Content] 【被动监听】📋 处理单个打印标签数据')
                  
                  const stockOrderNo = printDataToRender?.subPurchaseOrderSn || printDataToRender?.deliveryOrderSn || `打印标签_${Date.now()}`
                  const fileName = `${stockOrderNo}`
                  
                  const printLabelHTML = renderPrintLabel(printDataToRender)
                  
                  const iframe = document.createElement('iframe')
                  iframe.style.position = 'fixed'
                  iframe.style.top = '-9999px'
                  iframe.style.left = '-9999px'
                  iframe.style.width = '100mm'
                  iframe.style.height = '100mm'
                  iframe.style.border = 'none'
                  document.body.appendChild(iframe)
                  
                  await new Promise<void>((resolve) => {
                    iframe.onload = () => resolve()
                    iframe.contentDocument!.open()
                    iframe.contentDocument!.write(printLabelHTML)
                    iframe.contentDocument!.close()
                  })
                  
                  // 等待内容渲染和二维码生成
                  await sleep(3000)
                  
                  // 检查二维码是否已生成
                  const qrCodeElement = iframe.contentDocument?.getElementById('qrCode')
                  if (qrCodeElement) {
                    let retryCount = 0
                    while (retryCount < 10 && !qrCodeElement.querySelector('canvas')) {
                      await sleep(500)
                      retryCount++
                    }
                  }
                  
                  const iframeBody = iframe.contentDocument?.body
                  if (iframeBody) {
                    const pdfFileName = `${fileName}.pdf`
                    await generatePDF(iframeBody, pdfFileName)
                    console.log(`[Content] 【被动监听】✅ PDF 已生成并下载: ${pdfFileName}`)
                  }
                  
                  document.body.removeChild(iframe)
                  console.log('[Content] 【被动监听】✅ ========== PDF生成完成 ==========')
                }
              } catch (renderError: any) {
                console.error('[Content] 【被动监听】❌ 渲染并生成PDF时发生错误:', renderError)
                console.error('[Content] 【被动监听】❌ 错误详情:', renderError.message)
                console.error('[Content] 【被动监听】❌ 错误堆栈:', renderError.stack)
              }
              
              // 解析数据并resolve Promise
              if (printDataResolve) {
                printDataResolve(data)
              }
              
              console.log('[Content] 【被动监听】✅ 所有操作已完成，不会刷新页面')
              
            } catch (error: any) {
              console.error(`[Content] 【被动监听】❌ 处理批量打印接口数据失败:`, error)
              console.error(`[Content] 【被动监听】❌ 错误详情:`, error.message)
              console.error(`[Content] 【被动监听】❌ 错误堆栈:`, error.stack)
              if (printDataReject) {
                printDataReject(error)
              }
            }
          }
        }
      }
    }
    
    // 添加postMessage监听器（被动监听）
    window.addEventListener('message', messageHandler)
    console.log('[Content] 【被动监听】postMessage监听器已设置，等待接口拦截器发送事件...')
    
    // 设置超时（15秒后清理）
    const timeoutId = setTimeout(() => {
      if ((window as any).__waitingForBatchPrintData === tempMarkerId) {
        ;(window as any).__waitingForBatchPrintData = null
        window.removeEventListener('message', messageHandler)
        if (printDataReject) {
          printDataReject(new Error('等待批量打印接口数据超时'))
        }
      }
    }, 15000)
    
    // 等待接口拦截器被动发送的数据（最多15秒）
    console.log('[Content] 【被动监听】等待接口拦截器发送打印接口数据...')
    console.log('[Content] 【被动监听】📋 接收到数据后将自动渲染并生成PDF下载，不会刷新页面')
    
    try {
      // 注意：由于在 messageHandler 中不 resolve Promise，这里会一直等待
      // 数据会在 messageHandler 中打印，然后暂停
      const printData = await Promise.race([
        printDataPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 15000))
      ]) as any
      
      // 清理超时定时器和监听器
      clearTimeout(timeoutId)
      window.removeEventListener('message', messageHandler)
      
      console.log('[Content] 【被动监听】✅ 成功接收到批量打印接口数据')
      
      // ========== PDF已生成，不刷新页面 ==========
      console.log('[Content] 【被动监听】✅ PDF文件已生成并下载完成')
      console.log('[Content] 【被动监听】📋 所有打印标签已处理完成，不会刷新页面')
      
      // 不刷新页面，保持当前页面状态
      // PDF文件已在 messageHandler 中生成并下载
      
      return true
    } catch (error: any) {
      // 清理超时定时器和监听器
      clearTimeout(timeoutId)
      window.removeEventListener('message', messageHandler)
      ;(window as any).__waitingForBatchPrintData = null
      
      console.error('[Content] 【被动监听】❌ 获取批量打印接口数据失败:', error)
      console.error('[Content] 【被动监听】❌ 错误详情:', error.message)
      return false
    }
  } catch (error: any) {
    console.error('[Content] 点击待仓库收货标签时发生错误:', error)
    return false
  }
}

/**
    
    if (tableRows.length === 0) {
      console.warn('[Content] 未找到表格行数据')
      return false
    }
    
    // 只处理第一行，不循环
    if (tableRows.length === 0) {
      console.warn('[Content] 未找到表格行数据')
      return false
    }
    
    const row = tableRows[0] as HTMLElement
    console.log(`[Content] 处理第 1 行（仅执行第一行）...`)
    
    // 在当前行中查找所有"打印商品打包标签"链接
    const printLinks = row.querySelectorAll('a[data-testid="beast-core-button-link"]')
    let firstPrintLink: HTMLElement | null = null
    
    // 遍历所有链接，找到第一个文本内容为"打印商品打包标签"的链接
    for (const link of Array.from(printLinks)) {
      const linkText = link.textContent?.trim() || ''
      if (linkText === '打印商品打包标签') {
        firstPrintLink = link as HTMLElement
        console.log(`[Content] 第 1 行找到第一个"打印商品打包标签"链接`)
        break
      }
    }
    
    if (!firstPrintLink) {
      console.warn(`[Content] 第 1 行未找到"打印商品打包标签"链接`)
      return false
    }
    
    // 点击第一个"打印商品打包标签"链接
    console.log(`[Content] 点击第 1 行的第一个"打印商品打包标签"...`)
    firstPrintLink.click()
    
    // 等待弹窗出现
    console.log(`[Content] 等待弹窗出现...`)
    const modalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
      timeout: 5000,
      interval: 200
    })
    
    if (modalWrapper) {
      console.log(`[Content] 第 1 行点击后弹窗已出现`)
      
      // 从当前行提取备货单号
      const stockOrderNo = extractStockOrderNoFromRow(row)
      console.log(`[Content] 第 1 行备货单号: ${stockOrderNo || '未找到'}`)
      
      // 在弹窗中查找"继续打印"按钮
      const continuePrintButton = await findButtonByText(
        'button[data-testid="beast-core-button"]',
        '继续打印',
        {
          timeout: 5000,
          interval: 200,
          parent: modalWrapper as Element
        }
      )
      
      if (continuePrintButton) {
        console.log(`[Content] 找到"继续打印"按钮，准备点击...`)
        
        // 使用备货单号作为文件名（如果没有备货单号，使用时间戳）
        const fileName = stockOrderNo || `打印标签_${Date.now()}`
        
        // 创建一个Promise来等待打印接口数据
        let printDataResolve: ((data: any) => void) | null = null
        let printDataReject: ((error: Error) => void) | null = null
        const printDataPromise = new Promise<any>((resolve, reject) => {
          printDataResolve = resolve
          printDataReject = reject
        })
        
        // 设置一个临时的接口拦截器，专门捕获这次打印的数据
        const tempMarkerId = `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        ;(window as any).__waitingForPrintData = tempMarkerId
        
        // 保存原始的fetch函数（如果还没有保存）
        if (!(window as any).__originalFetchForPrint) {
          ;(window as any).__originalFetchForPrint = window.fetch
        }
        const originalFetch = (window as any).__originalFetchForPrint
        
        // 创建临时拦截器
        const tempFetchInterceptor = async function(...args: any[]) {
          const url = typeof args[0] === 'string' ? args[0] : args[0].url
          const urlStr = String(url)
          
          // 调用原始fetch
          const response = await originalFetch.apply(this, args)
          
          // 检查是否是打印标签接口：printBoxMarks（优先匹配）
          const isPrintBoxMarksAPI = urlStr.includes('printBoxMarks')
          
          // 如果正在等待打印数据，且是打印标签接口
          if ((window as any).__waitingForPrintData === tempMarkerId && isPrintBoxMarksAPI) {
            console.log(`[Content] ✅ 检测到打印标签接口调用: ${urlStr}`)
            
            // 克隆响应以便读取
            const clonedResponse = response.clone()
            
            // 异步处理响应数据
            clonedResponse.text().then(async (text) => {
              try {
                let data: any
                try {
                  data = JSON.parse(text)
                  console.log(`[Content] 📦 打印接口返回的JSON数据:`, JSON.stringify(data, null, 2))
                } catch {
                  // 如果不是JSON，可能是HTML或其他格式
                  data = text
                  console.log(`[Content] 📦 打印接口返回的文本数据（前1000字符）:`, text.substring(0, 1000))
                }
                
                console.log(`[Content] 📦 获取到打印接口数据，数据类型:`, typeof data)
                console.log(`[Content] 📦 数据键名:`, data && typeof data === 'object' ? Object.keys(data) : 'N/A')
                
                // 清除等待标记
                ;(window as any).__waitingForPrintData = null
                
                // 恢复原始fetch
                window.fetch = originalFetch
                
                // 解析数据
                if (printDataResolve) {
                  printDataResolve(data)
                }
              } catch (error: any) {
                console.error(`[Content] ❌ 处理打印接口数据失败:`, error)
                // 清除等待标记
                ;(window as any).__waitingForPrintData = null
                // 恢复原始fetch
                window.fetch = originalFetch
                if (printDataReject) {
                  printDataReject(error)
                }
              }
            }).catch((error) => {
              console.error(`[Content] ❌ 读取打印接口响应失败:`, error)
              // 清除等待标记
              ;(window as any).__waitingForPrintData = null
              // 恢复原始fetch
              window.fetch = originalFetch
              if (printDataReject) {
                printDataReject(error)
              }
            })
          }
          
          return response
        }
        
        // 设置临时拦截器
        window.fetch = tempFetchInterceptor as typeof window.fetch
        
        // 设置超时（10秒后恢复）
        setTimeout(() => {
          if ((window as any).__waitingForPrintData === tempMarkerId) {
            ;(window as any).__waitingForPrintData = null
            window.fetch = originalFetch
            if (printDataReject) {
              printDataReject(new Error('等待打印接口数据超时'))
            }
          }
        }, 10000)
        
        // 创建一个Promise来等待打印内容生成（保留作为备用）
        let printContentResolve: ((content: HTMLElement) => void) | null = null
        let printContentReject: ((error: Error) => void) | null = null
        const printContentPromise = new Promise<HTMLElement>((resolve, reject) => {
          printContentResolve = resolve
          printContentReject = reject
        })
        
        // 设置打印事件监听器，在打印预览打开时捕获内容
        // 注意：beforeprint事件触发时，页面已经应用了打印样式，此时可以捕获打印内容
        const printHandler = async () => {
          console.log(`[Content] 检测到打印事件（beforeprint），准备捕获打印内容...`)
          
          // beforeprint事件触发时，页面已经应用了打印样式
          // 等待一小段时间确保样式完全应用
          await sleep(500)
          
          try {
            // 查找打印内容区域
            let printContent: HTMLElement | null = null
            
            // 方法1：查找包含打印标签内容的元素
            // 打印标签通常包含：仓库名称、JIT、加急、SKC、SKU等信息
            const allDivs = document.querySelectorAll('div')
            let bestMatch: { element: HTMLElement; score: number } | null = null
            
            for (const div of Array.from(allDivs)) {
              const text = div.textContent || ''
              const rect = div.getBoundingClientRect()
              
              // 计算匹配分数
              let score = 0
              if (text.includes('义乌宝湾') || text.includes('莆田') || text.includes('东莞')) score += 3
              if (text.includes('JIT')) score += 2
              if (text.includes('加急')) score += 2
              if (text.includes('SKC')) score += 2
              if (text.includes('SKU') || text.includes('货号')) score += 2
              if (text.includes('PC') && /PC\d+/.test(text)) score += 2 // 包裹号
              if (rect.width > 400 && rect.height > 300) score += 2 // 尺寸合适
              if (rect.width > 600 && rect.height > 400) score += 3 // 尺寸很大
              
              // 如果分数足够高，且尺寸合适，记录这个元素
              if (score >= 5 && rect.width > 200 && rect.height > 200) {
                if (!bestMatch || score > bestMatch.score) {
                  bestMatch = { element: div as HTMLElement, score }
                }
              }
            }
            
            if (bestMatch) {
              printContent = bestMatch.element
              console.log(`[Content] 找到打印内容区域（方法1，匹配分数: ${bestMatch.score}）`)
            }
            
            // 方法2：如果没找到，查找包含打印样式的元素
            // 打印时，通常会有一个主要的打印容器
            if (!printContent) {
              // 查找可能包含打印内容的容器
              const possibleContainers = [
                document.querySelector('[class*="print"]'),
                document.querySelector('[id*="print"]'),
                document.querySelector('[class*="label"]'),
                document.querySelector('[id*="label"]')
              ]
              
              for (const container of possibleContainers) {
                if (container) {
                  const rect = (container as HTMLElement).getBoundingClientRect()
                  if (rect.width > 300 && rect.height > 300) {
                    printContent = container as HTMLElement
                    console.log(`[Content] 找到打印内容区域（方法2）`)
                    break
                  }
                }
              }
            }
            
            // 方法3：查找body中最大的可见元素
            if (!printContent) {
              const bodyChildren = Array.from(document.body.children) as HTMLElement[]
              let maxArea = 0
              for (const child of bodyChildren) {
                const rect = child.getBoundingClientRect()
                const area = rect.width * rect.height
                // 打印标签通常是横向的，宽度大于高度
                if (area > maxArea && rect.width > 400 && rect.height > 200) {
                  maxArea = area
                  printContent = child
                }
              }
              if (printContent) {
                console.log(`[Content] 找到打印内容区域（方法3）`)
              }
            }
            
            // 方法4：如果还是没找到，使用整个body
            if (!printContent) {
              printContent = document.body
              console.log(`[Content] 使用整个body作为打印内容`)
            }
            
            if (printContent && printContentResolve) {
              printContentResolve(printContent)
            } else {
              throw new Error('未找到打印内容区域')
            }
          } catch (error: any) {
            console.error(`[Content] 捕获打印内容时发生错误:`, error)
            if (printContentReject) {
              printContentReject(error)
            }
          }
        }
        
        // 监听打印事件（只监听一次）
        window.addEventListener('beforeprint', printHandler, { once: true })
        
        // 同时尝试监听blob URL（作为备用方案）
        const blobURLPromise = waitForBlobURL('seller.kuajingmaihuo.com', 3000).catch(() => {
          console.log(`[Content] blob URL监听超时，将使用打印事件方式`)
          return null
        })
        
        // 点击"继续打印"按钮
        continuePrintButton.click()
        console.log(`[Content] 已点击"继续打印"按钮`)
        
        // 等待打印接口调用并获取数据
        try {
          console.log(`[Content] 等待打印接口调用...`)
          const printData = await Promise.race([
            printDataPromise,
            new Promise<any>((_, reject) => 
              setTimeout(() => reject(new Error('等待打印接口数据超时')), 10000)
            )
          ])
          
          console.log(`[Content] 获取到打印接口数据，开始渲染...`)
          
          // 渲染打印标签HTML
          const printLabelHTML = renderPrintLabel(printData)
          console.log(`[Content] 打印标签HTML已生成`)
          
          // 创建隐藏的iframe来渲染打印标签
          const iframe = document.createElement('iframe')
          iframe.style.position = 'fixed'
          iframe.style.top = '-9999px'
          iframe.style.left = '-9999px'
          iframe.style.width = '210mm'
          iframe.style.height = '297mm'
          iframe.style.border = 'none'
          document.body.appendChild(iframe)
          
          // 等待iframe加载
          await new Promise<void>((resolve) => {
            iframe.onload = () => resolve()
            iframe.contentDocument!.open()
            iframe.contentDocument!.write(printLabelHTML)
            iframe.contentDocument!.close()
          })
          
          // 等待内容渲染
          await sleep(2000)
          
          // 从iframe中生成PDF
          const iframeBody = iframe.contentDocument?.body
          if (iframeBody) {
            const pdfFileName = `${fileName}.pdf`
            await generatePDF(iframeBody, pdfFileName)
            console.log(`[Content] PDF 已生成: ${pdfFileName}`)
          } else {
            throw new Error('无法获取iframe body')
          }
          
          // 移除iframe
          document.body.removeChild(iframe)
          
        } catch (error: any) {
          console.error(`[Content] 处理打印接口数据时发生错误:`, error)
          console.error(`[Content] 错误详情:`, error.message)
          
          // 恢复原始fetch
          if ((window as any).__originalFetchForPrint) {
            window.fetch = (window as any).__originalFetchForPrint
          }
          
          // 如果接口拦截失败，尝试其他方法
          console.log(`[Content] 接口拦截失败，尝试其他方法...`)
          
          // 尝试等待blob URL
          try {
            const blobURLPromise = waitForBlobURL('seller.kuajingmaihuo.com', 3000).catch(() => null)
            const blobURL = await Promise.race([
              blobURLPromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
            ])
            
            if (blobURL) {
              console.log(`[Content] 检测到 blob URL: ${blobURL}`)
              await handleBlobURLAndGeneratePDF(blobURL, fileName)
            } else {
              throw new Error('未检测到blob URL')
            }
          } catch (blobError: any) {
            console.error(`[Content] blob URL方法也失败:`, blobError)
            
            // 最后的备用方案：尝试从页面捕获
            try {
              console.log(`[Content] 尝试从页面捕获打印内容...`)
              const printContent = await Promise.race([
                printContentPromise,
                new Promise<HTMLElement>((_, reject) => 
                  setTimeout(() => reject(new Error('等待打印内容超时')), 5000)
                )
              ])
              
              if (printContent) {
                const pdfFileName = `${fileName}.pdf`
                await generatePDF(printContent, pdfFileName)
                console.log(`[Content] PDF 已生成（从页面）: ${pdfFileName}`)
              }
            } catch (pageError: any) {
              console.error(`[Content] 所有方法都失败了:`, pageError)
            }
          }
        }
        
        // 等待3秒，让操作完成
        console.log(`[Content] 等待3秒，让操作完成...`)
        await sleep(3000)
        
        // 等待弹窗关闭
        console.log(`[Content] 等待弹窗关闭...`)
        await sleep(1000)
      } else {
        console.warn(`[Content] 第 1 行未找到"继续打印"按钮`)
        return false
      }
    } else {
      console.warn(`[Content] 第 1 行点击后未检测到弹窗`)
      return false
    }
    
    console.log('[Content] ============== 批量点击打印商品打包标签完成 =============')
    return true
  } catch (error: any) {
    console.error('[Content] 点击待仓库收货标签时发生错误:', error)
    return false
  }
}

/**
 * 继续执行发货步骤（打印后刷新页面继续）
 * 执行批量装箱发货等后续步骤
 * @param config 用户配置（仓库、发货方式）
 */
async function continueShipmentSteps(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] ============== 继续执行发货步骤（打印后刷新） =============')
  console.log('[Content] 配置:', config)
  
  // 设置视口大小
  setViewportSize()

  try {
    // 等待页面加载完成
    await sleep(3000)

    // 等待表格加载完成
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000,
      interval: 200
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素，可能已超时')
      return
    }

    console.log('[Content] 找到表格分页元素，表格已加载完成')

    // 等待3秒，确保表格完全渲染完成
    await sleep(3000)

    // 步骤1: 点击全选
    console.log('[Content] 开始点击全选...')
    const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
    if (!headerRow) {
      console.error('[Content] 未找到表格头部')
      return
    }

    const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
    if (!headerCheckbox) {
      console.error('[Content] 未找到全选复选框')
      return
    }

    if (!headerCheckbox.checked) {
      headerCheckbox.click()
      console.log('[Content] 已点击全选复选框')
      await sleep(500)
    } else {
      console.log('[Content] 全选复选框已选中')
    }

    // 步骤2: 直接点击"批量装箱发货"按钮（会自动填写表单）
    console.log('[Content] 开始点击批量装箱发货按钮...')
    await clickBatchBoxingShipButton(config.shippingMethod)

    console.log('[Content] ============== 发货步骤执行完成 =============')
  } catch (error: any) {
    console.error('[Content] 继续执行发货步骤时发生错误:', error)
  }
}

/**
 * 直接执行发货步骤（开发阶段测试用）
 * 在shipping-list页面点击"批量"按钮，然后执行发货步骤
 * 
 * 注意：这是开发阶段的功能，用于测试发货步骤
 * 正式版本应该从第一步开始执行完整流程
 * 
 * @param config 用户配置（仓库、发货方式）
 */
async function executeShipmentStepsDirectly(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] ============== 直接执行发货步骤（开发测试） =============')
  console.log('[Content] 配置:', config)
  
  // 设置视口大小
  setViewportSize()

  try {
    // 等待页面加载完成
    await sleep(3000)

    // 等待表格加载完成
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000,
      interval: 200
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素，可能已超时')
      return
    }

    console.log('[Content] 找到表格分页元素，表格已加载完成')

    // 等待3秒，确保表格完全渲染完成
    await sleep(3000)

    // 步骤1: 点击全选
    console.log('[Content] 开始点击全选...')
    const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
    if (!headerRow) {
      console.error('[Content] 未找到表格头部')
      return
    }

    const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
    if (!headerCheckbox) {
      console.error('[Content] 未找到全选复选框')
      return
    }

    if (!headerCheckbox.checked) {
      headerCheckbox.click()
      console.log('[Content] 已点击全选复选框')
      await sleep(500)
    } else {
      console.log('[Content] 全选复选框已选中')
    }

    // 步骤2: 直接点击"批量打印商品打包标签"按钮（不需要点击"批量"按钮）
    console.log('[Content] 开始点击批量打印商品打包标签按钮...')
    
    const printButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      '批量打印商品打包标签',
      {
        timeout: 10000,
        interval: 200
      }
    )

    if (!printButton) {
      console.error('[Content] 未找到批量打印商品打包标签按钮')
      return
    }

    printButton.click()
    console.log('[Content] 已点击批量打印商品打包标签按钮')
    
    // 等待弹窗出现
    await sleep(1000)
    
    // 检查是否有弹窗出现
    let hasClickedContinuePrint = false
    const modalWrapper = document.querySelector('div[data-testid="beast-core-modal-innerWrapper"]')
    
    if (modalWrapper) {
      const modalText = modalWrapper.textContent || ''
      console.log('[Content] 检测到弹窗，弹窗文本:', modalText.substring(0, 200))
      
      // 情况1：警告弹窗（"部分发货单已打印过打包标签，不支持批量打印"）
      if (modalText.includes('部分发货单已打印过打包标签') || modalText.includes('不支持批量打印')) {
        console.log('[Content] 检测到警告弹窗：已打印过，准备点击"我知道了"按钮')
        
        // 查找"我知道了"按钮
        const knowButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          '我知道了',
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper as Element
          }
        )
        
        if (knowButton) {
          knowButton.click()
          console.log('[Content] 已点击"我知道了"按钮')
          await sleep(1000)
          
          // 已打印过，点击批量装箱发货（会自动填写表单）
          console.log('[Content] 已打印过，开始点击批量装箱发货按钮...')
          await clickBatchBoxingShipButton(config.shippingMethod)

          console.log('[Content] ============== 发货步骤执行完成（已打印过） =============')
          return
        } else {
          console.warn('[Content] 未找到"我知道了"按钮')
        }
      }
      
      // 情况2：打印顺序选择弹窗（"已选1个发货单，请选择打包标签打印顺序"）
      if (modalText.includes('已选') && modalText.includes('个发货单') && modalText.includes('请选择打包标签打印顺序')) {
        console.log('[Content] 检测到打印顺序选择弹窗，准备点击"继续打印"按钮')
        
        // 查找"继续打印"按钮
        const continuePrintButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          '继续打印',
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper as Element
          }
        )
        
        if (continuePrintButton) {
          console.log('[Content] 找到"继续打印"按钮，准备点击...')
          continuePrintButton.click()
          console.log('[Content] 已点击"继续打印"按钮，系统将自动触发打印事件')
          hasClickedContinuePrint = true
          await sleep(3000) // 等待3秒，让系统打印弹窗完全出现
          console.log('[Content] 系统打印弹窗应该已出现，准备刷新页面关闭...')
          
          // 刷新页面来关闭系统打印弹窗
          console.log('[Content] 刷新页面来关闭系统打印弹窗...')
          window.location.reload()
          
          console.log('[Content] 已刷新页面，等待background继续执行后续步骤...')
          return
        } else {
          console.warn('[Content] 未找到"继续打印"按钮')
        }
      }
    } else {
      console.log('[Content] 未检测到任何弹窗')
    }
    
    // 只有在没有点击"继续打印"按钮的情况下，才执行刷新页面的逻辑
    if (!hasClickedContinuePrint) {
      // 如果没有警告弹窗，说明出现了系统打印弹窗
      // 等待5秒，让打印弹窗出现（打印弹窗出现较慢）
      console.log('[Content] 未检测到打印顺序弹窗，等待5秒让系统打印弹窗出现...')
      await sleep(5000)
    
      // 生成唯一标识，用于区分系统刷新和用户主动刷新
      const refreshId = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      console.log('[Content] 生成刷新标识:', refreshId)
      
      // 在刷新前，保存标志到storage，标记这是系统触发的刷新
      await chrome.storage.local.set({
        shouldContinueAfterRefresh: {
          refreshId: refreshId,
          tabId: null, // background会设置
          warehouse: config.warehouse,
          shippingMethod: config.shippingMethod,
          timestamp: Date.now()
        }
      })
      console.log('[Content] 已保存刷新标志到storage')
      
      // 先发送消息到background，通知刷新页面后继续执行
      console.log('[Content] 发送消息到background，通知刷新页面后继续执行...')
      chrome.runtime.sendMessage({
        type: 'CONTINUE_AFTER_PRINT_REFRESH',
        data: {
          refreshId: refreshId,
          warehouse: config.warehouse,
          shippingMethod: config.shippingMethod,
          url: window.location.href
        }
      }).catch((error) => {
        console.error('[Content] 发送消息到background失败:', error)
      })
      
      // 等待1秒后刷新页面来关闭打印弹窗
      console.log('[Content] 等待1秒后刷新页面来关闭打印弹窗...')
      await sleep(1000)
      window.location.reload()
      
      console.log('[Content] ============== 已刷新页面，等待background继续执行 =============')
    }

    // 后面的步骤暂时不执行，用于测试
    // // 步骤4: 点击"批量装箱发货"按钮
    // console.log('[Content] 开始点击批量装箱发货按钮...')
    // await clickBatchBoxingShipButton()

    // // 步骤5: 选择发货方式
    // console.log('[Content] 开始选择发货方式...')
    // await selectShippingMethod(config.shippingMethod)

    // // 步骤6: 选择"不合包"
    // console.log('[Content] 开始选择不合包...')
    // await selectNoBoxing()

    // // 步骤7: 选择数量为1
    // console.log('[Content] 开始选择数量为1...')
    // await selectQuantityOne()

    // // 步骤8: 点击最终"确认发货"按钮
    // console.log('[Content] 开始点击确认发货按钮...')
    // await clickConfirmShipmentButton()

    // console.log('[Content] ============== 发货步骤执行完成 =============')
  } catch (error: any) {
    console.error('[Content] 执行发货步骤时发生错误:', error)
  }
}

/**
 * 开始装箱任务
 * 接收来自background的消息后执行装箱操作
 * @param config 用户配置（仓库、发货方式）
 */
async function startBoxingTasks(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] ============== 开始装箱任务 =============')
  console.log('[Content] 收到background通知，开始装箱任务，配置:', config)
  
  // 设置视口大小
  setViewportSize()

  try {
    // 等待页面加载完成
    await sleep(3000)

    // 等待表格加载完成
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000,
      interval: 200
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素，可能已超时')
      return
    }

    console.log('[Content] 找到表格分页元素，表格已加载完成')

    // 等待3秒，确保表格完全渲染完成
    await sleep(3000)

    // 测试关闭打印弹窗功能（暂时不点击批量打印）
    console.log('[Content] 开始测试关闭打印弹窗功能...')
    await testClosePrintDialog()

    // 暂时注释掉批量打印，用于测试
    // // 点击全选
    // console.log('[Content] 开始点击全选...')
    // const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
    // if (!headerRow) {
    //   console.error('[Content] 未找到表格头部')
    //   return
    // }

    // const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
    // if (!headerCheckbox) {
    //   console.error('[Content] 未找到全选复选框')
    //   return
    // }

    // if (!headerCheckbox.checked) {
    //   headerCheckbox.click()
    //   console.log('[Content] 已点击全选复选框')
    //   await sleep(500)
    // } else {
    //   console.log('[Content] 全选复选框已选中')
    // }

    // // 点击"批量打印商品打包标签"按钮
    // console.log('[Content] 开始点击批量打印商品打包标签按钮...')
    // await clickBatchPrintLabelButton()

    console.log('[Content] 装箱任务执行完成')
  } catch (error: any) {
    console.error('[Content] 执行装箱任务时发生错误:', error)
  }
}

/**
 * 开始发货台任务
 * 接收来自background的消息后执行发货台操作
 * @param config 用户配置（仓库、发货方式）
 */
async function startShippingDeskTasks(config: { warehouse: string; shippingMethod: string }) {
  // 设置视口大小
  setViewportSize()

  try {
    // 等待表格分页元素出现，表示表格已加载完成
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000,
      interval: 200
    })

    if (!paginationElement) {
      return
    }

    // 等待3秒，确保表格完全渲染完成
    await sleep(3000)

    // 提取表格数据
    const tableData = extractTableData()

    if (tableData.length === 0) {
      return
    }

    // 过滤已发货的备货单号
    const stockOrderNos = tableData.map(row => row.stockOrderNo)
    const checkResult = await chrome.runtime.sendMessage({
      type: 'CHECK_STOCK_ORDER_SHIPPED',
      data: {
        stockOrderNos
      }
    })

    // 过滤出未发货的订单
    const unshippedOrderNos = new Set(checkResult.data?.notShipped || [])
    const filteredTableData = tableData.filter(row => unshippedOrderNos.has(row.stockOrderNo))

    if (filteredTableData.length === 0) {
      return
    }

    // 按仓库分组数据
    const groupedData = groupDataByWarehouse(filteredTableData)

    // 获取所有仓库，按顺序处理
    const warehouses = Object.keys(groupedData)
    const targetWarehouses = warehouses

    // 获取店铺名称
    const shopName = getShopName()

    // 第七步：准备下载图片的数据和记录列表
    // 只包含有货号的行，使用货号作为文件名
    const baseFolder = `JIT${getTodayDateString()}` // JIT+今天日期
    const finalShopName = shopName || '未知店铺'

    // 创建数据记录列表，记录所有表格数据和对应的图片名称
    const dataRecordList: Array<{
      stockOrderNo: string // 备货单号
      productCode: string // 货号
      warehouse: string // 收货仓库
      skuId: string // SKU ID
      quantity: number // 数量
      imageUrl: string // 图片URL（原始URL，已去除参数）
      imageFileName: string // 图片文件名（货号.jpg）
      imageFilePath: string // 图片完整路径
      shopName: string // 店铺名称
      downloadDate: string // 下载日期
    }> = []

    // 构建下载数据和记录列表
    const downloadData = {
      baseFolder,
      shopName: finalShopName,
      groupedData: Object.keys(groupedData).map(warehouse => ({
        warehouse,
        rows: groupedData[warehouse]
          .filter(row => row.productCode && row.imageUrl) // 只包含有货号和图片URL的行
          .map(row => {
            const fileName = row.productCode // 使用货号作为文件名
            const imageFileName = `${fileName}.jpg` // 图片文件名
            const imageFilePath = `${baseFolder}/${finalShopName}/${warehouse}/${imageFileName}` // 完整路径

            // 添加到记录列表
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
              fileName: row.productCode // 使用货号作为文件名
            }
          })
      })).filter(group => group.rows.length > 0) // 过滤掉没有数据的仓库组
    }

    // 打印详细的表格数据信息
    console.log('[Content] ==================== 表格数据详情 ====================')
    console.log(`[Content] 总共找到 ${tableData.length} 行数据（包含已发货），过滤后 ${filteredTableData.length} 行未发货`)
    console.log('[Content] 以下是每条数据的详细信息：')
    filteredTableData.forEach((row, index) => {
      console.log(`[Content] 行 ${index + 1}:`)
      console.log(`  - 备货单号: ${row.stockOrderNo}`)
      console.log(`  - 货号 (SKU): ${row.productCode}`)
      console.log(`  - 仓库: ${row.warehouse}`)
      console.log(`  - SKU ID: ${row.skuId}`)
      console.log(`  - 数量: ${row.quantity}`)
      console.log(`  - 图片URL: ${row.imageUrl}`)
    })
    console.log('[Content] ==================== 表格数据详情结束 ====================')

    // 将数据保存到background（暂时不下载图片，等最后一步完成后统一下载）
    // 注释掉下载图片的代码，只保存数据
    // chrome.runtime.sendMessage({
    //   type: 'SAVE_SHIPPING_DESK_DATA_AND_DOWNLOAD_IMAGES',
    //   data: {
    //     ...downloadData,
    //     dataRecordList
    //   }
    // }).catch((error) => {
    //   console.error('[Content] 保存数据到background失败:', error)
    // })
    
    // 只保存数据，不触发下载
    chrome.runtime.sendMessage({
      type: 'SAVE_SHIPPING_DESK_DATA',
      data: {
        ...downloadData,
        dataRecordList
      }
    }).catch((error) => {
      console.error('[Content] 保存数据到background失败:', error)
    })

    // 等待1秒，确保页面状态稳定
    await sleep(1000)

    // 勾选第一行
    if (targetWarehouses.length > 0) {
      await selectRowsByWarehouse(targetWarehouses[0], groupedData)
      
      // 等待勾选完成
      await sleep(500)
      
      // 点击"创建发货单"按钮
      await clickCreateShippingOrderButton()
      
      // 等待页面跳转到创建发货单页面后，点击批量选择并选择仓库
      await clickBatchSelectAndChooseWarehouseInCreatePage(config.warehouse)
    }

  } catch (error: any) {
    console.error('[Content] 执行发货台任务时发生错误:', error)
  }
}

/**
 * 执行批量发货操作
 * @param config 用户配置（仓库、发货方式）
 */
async function executeBatchShipment(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] 执行批量发货，配置:', config)

  try {
    // 第一步：等待表格分页元素出现，表示表格已加载完成
    console.log('[Content] 等待表格分页元素加载...')
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000, // 30秒超时，给足够时间等待页面加载
      interval: 200   // 每200ms检查一次
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素，可能已超时')
      return
    }

    console.log('[Content] 找到表格分页元素，表格已加载完成')

    // 第二步：等待5秒，确保表格完全渲染完成
    console.log('[Content] 等待5秒，确保表格完全渲染...')
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // 第三步：查找表格头部的全选复选框并点击
    console.log('[Content] 查找表格头部的全选复选框...')
    
    // 查找表格头部行（包含全选复选框）
    const headerRow = await findDom('tr[data-testid="beast-core-table-header-tr"]', {
      timeout: 10000,
      interval: 200
    })

    if (!headerRow) {
      console.error('[Content] 未找到表格头部行')
      return
    }

    // 在头部行中查找全选复选框
    // 根据用户提供的HTML结构，复选框在 .CBX_squareInputWrapper_5-120-1 中
    const checkboxWrapper = headerRow.querySelector('.CBX_squareInputWrapper_5-120-1')
    
    if (!checkboxWrapper) {
      console.error('[Content] 未找到全选复选框容器')
      return
    }

    // 查找实际的checkbox input元素
    const checkboxInput = checkboxWrapper.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
    
    if (!checkboxInput) {
      console.error('[Content] 未找到全选复选框input元素')
      return
    }

    // 检查复选框是否已选中
    if (checkboxInput.checked) {
      console.log('[Content] 全选复选框已选中，无需再次点击')
    } else {
      // 点击复选框来批量勾选
      console.log('[Content] 点击全选复选框，批量勾选所有订单...')
      
      // 使用多种方式确保点击成功
      // 方式1：直接点击input元素
      checkboxInput.click()
      
      // 方式2：如果方式1不生效，尝试点击包装元素
      setTimeout(() => {
        if (!checkboxInput.checked) {
          console.log('[Content] 尝试点击复选框包装元素...')
          // 将Element转换为HTMLElement以使用click方法
          const wrapperElement = checkboxWrapper as HTMLElement
          if (wrapperElement && typeof wrapperElement.click === 'function') {
            wrapperElement.click()
          }
        }
      }, 100)

      // 方式3：如果前两种方式都不生效，尝试触发change事件
      setTimeout(() => {
        if (!checkboxInput.checked) {
          console.log('[Content] 尝试触发change事件...')
          checkboxInput.checked = true
          checkboxInput.dispatchEvent(new Event('change', { bubbles: true }))
          checkboxInput.dispatchEvent(new Event('click', { bubbles: true }))
        }
      }, 200)

      // 验证是否选中成功
      setTimeout(() => {
        if (checkboxInput.checked) {
          console.log('[Content] 全选复选框已成功选中，批量勾选完成')
        } else {
          console.warn('[Content] 全选复选框可能未成功选中，请检查页面状态')
        }
      }, 500)
    }

    // 第四步：等待1-3秒后，检查并点击"批量加入发货台"按钮
    console.log('[Content] 等待2秒后检查批量加入发货台按钮...')
    await sleep(2000) // 等待2秒（1-3秒之间）

    // 查找"批量加入发货台"按钮
    // 使用findButtonByText函数，通过文本内容来查找，避免动态class的问题
    console.log('[Content] 查找批量加入发货台按钮...')
    const batchAddButton = await findButtonByText(
      'button[data-testid="beast-core-button"]',
      '批量加入发货台',
      {
        timeout: 10000,
        interval: 200
      }
    )

    // 检查按钮是否存在、是否disabled、是否有数据
    let shouldSkipBatchAdd = false
    
    if (!batchAddButton) {
      console.warn('[Content] 未找到批量加入发货台按钮，跳过此步骤')
      shouldSkipBatchAdd = true
    } else {
      // 检查按钮是否disabled
      const isDisabled = batchAddButton.hasAttribute('disabled') || 
                         batchAddButton.classList.contains('BTN_disabled') ||
                         batchAddButton.getAttribute('disabled') !== null
      
      if (isDisabled) {
        console.warn('[Content] 批量加入发货台按钮处于disabled状态，跳过此步骤')
        shouldSkipBatchAdd = true
      } else {
        // 通过分页数据判断是否有数据
        const hasData = hasDataFromPagination()
        
        if (!hasData) {
          console.warn('[Content] 分页数据显示没有数据，跳过批量加入发货台步骤')
          shouldSkipBatchAdd = true
        }
      }
    }

    if (!shouldSkipBatchAdd) {
      console.log('[Content] 找到批量加入发货台按钮，准备点击...')
      batchAddButton.click()
      console.log('[Content] 已点击批量加入发货台按钮')

      // 第五步：等待弹窗出现
      console.log('[Content] 等待确认弹窗出现...')
      const modalWrapper = await findDom('div[data-testid="beast-core-modal-innerWrapper"]', {
        timeout: 10000,
        interval: 200
      })

      if (!modalWrapper) {
        console.warn('[Content] 未找到确认弹窗，可能操作失败或已跳过')
        // 即使弹窗没出现，也继续执行后续步骤
      } else {
        console.log('[Content] 找到确认弹窗')

        // 第六步：在弹窗中查找并点击"确认"按钮
        console.log('[Content] 查找弹窗中的确认按钮...')
        // 等待一小段时间，确保弹窗内容完全渲染
        await sleep(500)

        // 在弹窗中查找确认按钮，使用findButtonByText函数
        const confirmButton = await findButtonByText(
          'button[data-testid="beast-core-button"]',
          '确认',
          {
            timeout: 5000,
            interval: 200,
            parent: modalWrapper
          }
        )

        if (!confirmButton) {
          console.warn('[Content] 未找到弹窗中的确认按钮')
        } else {
          console.log('[Content] 找到确认按钮，准备点击...')
          confirmButton.click()
          console.log('[Content] 已点击确认按钮')

          // 等待一小段时间，确保确认操作完成
          await sleep(1000)
        }
      }
    } else {
      console.log('[Content] 跳过批量加入发货台步骤，直接进入下一步')
    }

    // 在当前页面跳转到发货台页面
    console.log('[Content] 批量发货完成，通知Background准备跳转到发货台页面...')
    const shippingDeskUrl = 'https://seller.kuajingmaihuo.com/main/order-manager/shipping-desk'

    // 等待一小段时间，确保之前的操作完成
    await sleep(1000)

    // 通知 Background 批量发货完成
    chrome.runtime.sendMessage({
      type: 'BATCH_SHIPMENT_COMPLETED'
    }).then((response) => {
      console.log('[Content] Background响应:', response)
      // 收到响应后跳转到发货台页面
      window.location.href = shippingDeskUrl
      console.log('[Content] 已跳转到发货台页面:', shippingDeskUrl)
    }).catch((error) => {
      console.error('[Content] 通知Background失败:', error)
      // 即使通知失败也跳转
      window.location.href = shippingDeskUrl
    })

  } catch (error: any) {
    console.error('[Content] 执行批量发货时发生错误:', error)
  }
}

// 监听来自background的消息（适用于所有目标网站）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 处理开始批量发货的消息（temu备货单页面）
  if (message.type === 'START_BATCH_SHIPMENT') {
    console.log('[Content] 收到START_BATCH_SHIPMENT消息:', message.data)
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      startBatchTasks(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startBatchTasks(message.data)
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到批量发货任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理开始发货台任务的消息（发货台页面）
  if (message.type === 'START_SHIPPING_DESK_TASK') {
    console.log('[Content] 收到START_SHIPPING_DESK_TASK消息:', message.data)
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      startShippingDeskTasks(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startShippingDeskTasks(message.data)
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到发货台任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理开始装箱任务的消息（shipping-list页面）
  if (message.type === 'START_BOXING_TASK') {
    console.log('[Content] 收到START_BOXING_TASK消息:', message.data)
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      startBoxingTasks(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          startBoxingTasks(message.data)
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到装箱任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理直接执行发货步骤的消息（开发阶段测试用）
  // 注意：这是开发阶段的功能，正式版本应该从第一步开始执行完整流程
  if (message.type === 'START_SHIPMENT_STEPS_DIRECTLY') {
    console.log('[Content] 收到START_SHIPMENT_STEPS_DIRECTLY消息（开发测试）:', message.data)
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      executeShipmentStepsDirectly(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          executeShipmentStepsDirectly(message.data)
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到直接执行发货步骤任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理继续执行发货步骤的消息（打印后刷新页面继续）
  if (message.type === 'CONTINUE_SHIPMENT_STEPS') {
    console.log('[Content] 收到CONTINUE_SHIPMENT_STEPS消息:', message.data)
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      continueShipmentSteps(message.data)
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          continueShipmentSteps(message.data)
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到继续执行发货步骤任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  // 处理打印接口调用的通知
  if (message.type === 'PRINT_API_CALLED') {
    console.log('[Content] 收到打印接口调用通知:', message.data)
    // 打印接口拦截器会自动处理
    sendResponse({ success: true, message: '已收到打印接口调用通知' })
    return true
  }

  // 处理点击待仓库收货标签的消息
  if (message.type === 'CLICK_WAREHOUSE_RECEIPT_TAB') {
    console.log('[Content] 收到CLICK_WAREHOUSE_RECEIPT_TAB消息')
    
    // 确保页面已加载完成后再执行
    if (document.readyState === 'complete') {
      // 页面已完全加载，直接执行
      clickWarehouseReceiptTab()
    } else {
      // 等待页面完全加载
      window.addEventListener('load', () => {
        // 再次设置视口大小，确保生效
        setViewportSize()
        // 延迟一点时间，确保页面元素都已渲染
        setTimeout(() => {
          clickWarehouseReceiptTab()
        }, 500)
      })
    }
    
    // 发送响应
    sendResponse({ success: true, message: '已收到点击待仓库收货标签任务' })
    return true // 保持消息通道开放以支持异步响应
  }

  return false
})

// 只在目标网站执行
if (window.location.href.includes('agentseller.temu.com')) {
  // 立即设置视口大小
  setViewportSize()

  // 页面加载完成后再次设置视口大小（确保生效）
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      setViewportSize()
    })
  }
}

// 发货台页面
if (window.location.href.includes('seller.kuajingmaihuo.com')) {
  // 立即设置视口大小
  setViewportSize()

  // 页面加载完成后再次设置视口大小（确保生效）
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      setViewportSize()
    })
  }
}

/**
 * 检查并渲染批量打印数据
 * 页面加载时检查是否有保存的批量打印数据，如果有则自动渲染并生成PDF
 */
async function checkAndRenderBatchPrintData() {
  try {
    console.log('[Content] ========== 检查是否有保存的批量打印数据 ==========')
    
    // 从background获取保存的批量打印数据
    const response = await chrome.runtime.sendMessage({
      type: 'GET_BATCH_PRINT_DATA'
    })
    
    if (!response || !response.success || !response.data) {
      console.log('[Content] 未找到保存的批量打印数据')
      return
    }
    
    const batchPrintData = response.data
    console.log('[Content] 找到保存的批量打印数据，时间戳:', batchPrintData.timestamp)
    
    // 等待页面完全加载
    await sleep(3000)
    
    // 检查是否是shipping-list页面
    const isShippingListPage = window.location.href.includes('/main/order-manager/shipping-list')
    if (!isShippingListPage) {
      console.log('[Content] 当前不是shipping-list页面，跳过渲染')
      return
    }
    
    // 解析打印数据
    const printData = batchPrintData.printData
    
    // 如果数据有result字段且是数组，遍历每个标签数据并生成PDF
    if (printData && printData.result && Array.isArray(printData.result)) {
      console.log(`[Content] 找到 ${printData.result.length} 个打印标签数据`)
      
      // 遍历每个标签数据，生成PDF
      for (let i = 0; i < printData.result.length; i++) {
        const labelData = printData.result[i]
        
        // 提取备货单号作为文件名
        const stockOrderNo = labelData.subPurchaseOrderSn || labelData.deliveryOrderSn || `打印标签_${Date.now()}_${i}`
        const fileName = `${stockOrderNo}`
        
        console.log(`[Content] 开始渲染第 ${i + 1}/${printData.result.length} 个标签: ${fileName}`)
        
        // 渲染打印标签HTML（只渲染单个标签数据）
        const printLabelHTML = renderPrintLabel({ result: [labelData] })
        
        // 创建隐藏的iframe来渲染打印标签
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.top = '-9999px'
        iframe.style.left = '-9999px'
        iframe.style.width = '210mm'
        iframe.style.height = '297mm'
        iframe.style.border = 'none'
        document.body.appendChild(iframe)
        
        // 等待iframe加载
        await new Promise<void>((resolve) => {
          iframe.onload = () => resolve()
          iframe.contentDocument!.open()
          iframe.contentDocument!.write(printLabelHTML)
          iframe.contentDocument!.close()
        })
        
        // 等待内容渲染
        await sleep(2000)
        
        // 从iframe中生成PDF
        const iframeBody = iframe.contentDocument?.body
        if (iframeBody) {
          const pdfFileName = `${fileName}.pdf`
          await generatePDF(iframeBody, pdfFileName)
          console.log(`[Content] PDF 已生成: ${pdfFileName}`)
        } else {
          console.error(`[Content] 无法获取iframe body`)
        }
        
        // 移除iframe
        document.body.removeChild(iframe)
        
        // 等待一段时间再处理下一个
        await sleep(1000)
      }
      
      // 清除保存的批量打印数据
      await chrome.storage.local.remove('batchPrintData')
      console.log('[Content] 批量打印数据已清除')
      
      console.log('[Content] ========== 批量打印PDF生成完成 ==========')
    } else {
      console.warn('[Content] 打印数据格式不正确')
    }
  } catch (error: any) {
    console.error('[Content] 检查并渲染批量打印数据时发生错误:', error)
  }
}

/**
 * Content Script 初始化
 * 在页面加载时自动注入打印接口拦截脚本
 */
(function initContentScript() {
  console.log('[Content] Content Script 初始化...')
  
  // 设置视口大小
  setViewportSize()
  
  // 在页面加载完成后注入打印接口拦截脚本
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Content] DOM加载完成，开始注入打印接口拦截脚本...')
      interceptPrintAPI().catch((error) => {
        console.error('[Content] 初始化注入脚本失败:', error)
      })
    })
  } else {
    // 如果页面已经加载完成，立即注入
    console.log('[Content] 页面已加载，立即注入打印接口拦截脚本...')
    interceptPrintAPI().catch((error) => {
      console.error('[Content] 初始化注入脚本失败:', error)
    })
  }
  
  console.log('[Content] Content Script 初始化完成')
})()
