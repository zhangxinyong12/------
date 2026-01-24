/**
 * Content Script
 * 在打开的页面中注入，设置视口大小并执行批量任务
 */

import { findDom } from "./utils/dom"

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
          // 删除"（前置收货）"后缀
          warehouse = warehouse.replace(/\s*（前置收货）\s*$/, '')
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

  console.log('[Content] 数据分组结果:', Object.keys(grouped).map(warehouse => ({
    warehouse,
    count: grouped[warehouse].length
  })))

  return grouped
}

/**
 * 勾选指定仓库的所有行
 * @param warehouse 仓库名称
 * @param groupedData 分组后的数据
 */
async function selectRowsByWarehouse(warehouse: string, groupedData: Record<string, TableRowData[]>) {
  const rows = groupedData[warehouse]
  
  if (!rows || rows.length === 0) {
    console.warn(`[Content] 仓库 ${warehouse} 没有数据`)
    return
  }

  console.log(`[Content] 开始勾选仓库 ${warehouse} 的 ${rows.length} 行数据...`)

  // 先取消全选（如果已选中）
  const tbody = document.querySelector('tbody[data-testid="beast-core-table-middle-tbody"]')
  if (tbody) {
    // 查找表头的全选复选框
    const headerRow = document.querySelector('tr[data-testid="beast-core-table-header-tr"]')
    if (headerRow) {
      const headerCheckbox = headerRow.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
      if (headerCheckbox && headerCheckbox.checked) {
        console.log('[Content] 取消全选...')
        headerCheckbox.click()
        await sleep(500)
      }
    }
  }

  // 勾选指定仓库的所有行
  for (const rowData of rows) {
    try {
      const checkbox = rowData.rowElement.querySelector('input[type="checkbox"][mode="checkbox"]') as HTMLInputElement
      
      if (checkbox && !checkbox.checked) {
        checkbox.click()
        await sleep(100) // 每行之间稍作延迟
      }
    } catch (error: any) {
      console.error(`[Content] 勾选行时发生错误:`, error)
    }
  }

  console.log(`[Content] 已完成勾选仓库 ${warehouse} 的所有行`)
}

/**
 * 开始发货台任务
 * 接收来自background的消息后执行发货台操作
 * @param config 用户配置（仓库、发货方式）
 */
async function startShippingDeskTasks(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] 收到background通知，开始发货台任务，配置:', config)
  
  // 设置视口大小
  setViewportSize()

  try {
    // 第一步：等待表格分页元素出现，表示表格已加载完成
    console.log('[Content] 等待表格分页元素加载...')
    const paginationElement = await findDom('ul[data-testid="beast-core-pagination"]', {
      timeout: 30000, // 30秒超时
      interval: 200   // 每200ms检查一次
    })

    if (!paginationElement) {
      console.error('[Content] 未找到表格分页元素，可能已超时')
      return
    }

    console.log('[Content] 找到表格分页元素，表格已加载完成')

    // 第二步：等待3秒，确保表格完全渲染完成
    console.log('[Content] 等待3秒，确保表格完全渲染...')
    await sleep(3000)

    // 第三步：提取表格数据
    console.log('[Content] 开始提取表格数据...')
    const tableData = extractTableData()

    if (tableData.length === 0) {
      console.warn('[Content] 未提取到任何数据')
      return
    }

    // 第四步：按仓库分组数据
    console.log('[Content] 按仓库分组数据...')
    const groupedData = groupDataByWarehouse(tableData)

    // 第五步：获取店铺名称
    console.log('[Content] 获取店铺名称...')
    const shopName = getShopName()

    // 第六步：准备下载图片的数据和记录列表
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

    console.log(`[Content] 数据记录列表已创建，共 ${dataRecordList.length} 条记录`)

    // 打印详细的表格数据信息
    console.log('[Content] ==================== 表格数据详情 ====================')
    console.log(`[Content] 总共找到 ${tableData.length} 行数据`)
    console.log('[Content] 以下是每条数据的详细信息：')
    tableData.forEach((row, index) => {
      console.log(`[Content] 行 ${index + 1}:`)
      console.log(`  - 备货单号: ${row.stockOrderNo}`)
      console.log(`  - 货号 (SKU): ${row.productCode}`)
      console.log(`  - 仓库: ${row.warehouse}`)
      console.log(`  - SKU ID: ${row.skuId}`)
      console.log(`  - 数量: ${row.quantity}`)
      console.log(`  - 图片URL: ${row.imageUrl}`)
    })
    console.log('[Content] ==================== 表格数据详情结束 ====================')

    // 打印下载分组数据
    console.log('[Content] ==================== 下载分组数据 ====================')
    downloadData.groupedData.forEach((group, groupIndex) => {
      console.log(`[Content] 仓库组 ${groupIndex + 1}: ${group.warehouse}`)
      console.log(`[Content] 该仓库共有 ${group.rows.length} 行需要下载`)
      group.rows.forEach((row, rowIndex) => {
        console.log(`  - 行 ${rowIndex + 1}: 货号=${row.fileName}, 图片=${row.imageUrl}`)
      })
    })
    console.log('[Content] ==================== 下载分组数据结束 ====================')

    // 第七步：将数据保存到background并开始下载图片
    console.log('[Content] 将数据保存到background并开始下载图片...')
    chrome.runtime.sendMessage({
      type: 'SAVE_SHIPPING_DESK_DATA_AND_DOWNLOAD_IMAGES',
      data: {
        ...downloadData,
        dataRecordList // 包含数据记录列表
      }
    }).catch((error) => {
      console.error('[Content] 保存数据到background失败:', error)
    })

    // 第六步：根据用户选择的仓库，勾选对应仓库的所有行
    // 如果用户选择的仓库在数据中存在，则勾选该仓库的所有行
    if (groupedData[config.warehouse]) {
      console.log(`[Content] 用户选择的仓库是 ${config.warehouse}，开始勾选该仓库的所有行...`)
      await selectRowsByWarehouse(config.warehouse, groupedData)
    } else {
      console.warn(`[Content] 用户选择的仓库 ${config.warehouse} 在数据中不存在`)
      // 列出所有可用的仓库
      const availableWarehouses = Object.keys(groupedData)
      console.log('[Content] 可用的仓库:', availableWarehouses)
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
