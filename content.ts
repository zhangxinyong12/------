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
 * 开始发货台任务
 * 接收来自background的消息后执行发货台操作
 * @param config 用户配置（仓库、发货方式）
 */
async function startShippingDeskTasks(config: { warehouse: string; shippingMethod: string }) {
  console.log('[Content] 收到background通知，开始发货台任务，配置:', config)
  
  // TODO: 在这里实现发货台页面的操作逻辑
  // 例如：记录店铺名字、记录货号、记录仓库地址等
  console.log('[Content] 发货台页面已加载，准备执行后续操作...')
  
  // 设置视口大小
  setViewportSize()
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
    console.log('[Content] 在当前页面跳转到发货台页面...')
    const shippingDeskUrl = 'https://seller.kuajingmaihuo.com/main/order-manager/shipping-desk'
    
    // 等待一小段时间，确保之前的操作完成
    await sleep(1000)
    
    // 跳转到发货台页面
    window.location.href = shippingDeskUrl
    console.log('[Content] 已跳转到发货台页面:', shippingDeskUrl)

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
