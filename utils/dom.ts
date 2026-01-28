/**
 * DOM 工具函数
 * 提供查找和等待DOM元素的工具方法
 */

/**
 * Sleep函数
 * 等待指定的毫秒数
 * @param ms 等待的毫秒数
 * @returns Promise
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 查找包含特定文本的按钮
 * 在指定选择器匹配的所有元素中，查找文本内容包含目标文本的元素
 * @param selector CSS选择器
 * @param text 目标文本
 * @param options 配置选项
 * @returns 找到的元素，如果超时则返回null
 */
export async function findButtonByText(
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
      const elements = (parent as Element | Document).querySelectorAll(selector)

      for (const element of Array.from(elements)) {
        const elementText = element.textContent?.trim() || ""
        if (elementText.includes(text)) {
          resolve(element as HTMLElement)
          return
        }
      }

      const elapsed = Date.now() - startTime
      if (elapsed >= timeout) {
        resolve(null)
        return
      }

      setTimeout(checkElement, interval)
    }

    checkElement()
  })
}

/**
 * 查找DOM元素
 * 定时检查元素是否存在，直到找到或超时
 * @param selector CSS选择器或XPath表达式
 * @param options 配置选项
 * @returns 找到的元素，如果超时则返回null
 */
export async function findDom(
  selector: string,
  options: {
    timeout?: number // 超时时间（毫秒），默认10000ms
    interval?: number // 检查间隔（毫秒），默认200ms
    useXPath?: boolean // 是否使用XPath选择器，默认false
    parent?: Element | Document // 父元素，默认document
  } = {}
): Promise<Element | null> {
  const {
    timeout = 10000,
    interval = 200,
    useXPath = false,
    parent = document
  } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    // 立即检查一次
    const checkElement = () => {
      let element: Element | null = null

      if (useXPath) {
        // 使用XPath查找元素
        const xpathResult = document.evaluate(
          selector,
          parent as Document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        element = xpathResult.singleNodeValue as Element | null
      } else {
        // 使用CSS选择器查找元素
        element = (parent as Element | Document).querySelector(selector)
      }

      if (element) {
        // 找到元素，返回
        resolve(element)
        return
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

/**
 * 等待多个元素中的任意一个出现
 * @param selectors 选择器数组
 * @param options 配置选项
 * @returns 找到的元素和对应的选择器索引，如果超时则返回null
 */
export async function waitForAnyElement(
  selectors: string[],
  options: {
    timeout?: number
    interval?: number
    useXPath?: boolean
    parent?: Element | Document
  } = {}
): Promise<{ element: Element; index: number } | null> {
  const {
    timeout = 10000,
    interval = 200,
    useXPath = false,
    parent = document
  } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkElements = () => {
      // 依次检查每个选择器
      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i]
        let element: Element | null = null

        if (useXPath) {
          const xpathResult = document.evaluate(
            selector,
            parent as Document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          )
          element = xpathResult.singleNodeValue as Element | null
        } else {
          element = (parent as Element | Document).querySelector(selector)
        }

        if (element) {
          // 找到元素，返回元素和索引
          resolve({ element, index: i })
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
      setTimeout(checkElements, interval)
    }

    // 开始检查
    checkElements()
  })
}

/**
 * 等待元素消失
 * 定时检查元素是否不存在，直到消失或超时
 * @param selector CSS选择器或XPath表达式
 * @param options 配置选项
 * @returns 如果元素消失返回true，如果超时仍存在返回false
 */
export async function waitForElementToDisappear(
  selector: string,
  options: {
    timeout?: number
    interval?: number
    useXPath?: boolean
    parent?: Element | Document
  } = {}
): Promise<boolean> {
  const {
    timeout = 10000,
    interval = 200,
    useXPath = false,
    parent = document
  } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkElement = () => {
      let element: Element | null = null

      if (useXPath) {
        const xpathResult = document.evaluate(
          selector,
          parent as Document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        element = xpathResult.singleNodeValue as Element | null
      } else {
        element = (parent as Element | Document).querySelector(selector)
      }

      if (!element) {
        // 元素已消失，返回true
        resolve(true)
        return
      }

      // 检查是否超时
      const elapsed = Date.now() - startTime
      if (elapsed >= timeout) {
        // 超时，元素仍存在，返回false
        resolve(false)
        return
      }

      // 未超时，继续等待
      setTimeout(checkElement, interval)
    }

    // 开始检查
    checkElement()
  })
}

/**
 * 等待元素满足特定条件
 * @param selector CSS选择器或XPath表达式
 * @param condition 条件函数，返回true表示满足条件
 * @param options 配置选项
 * @returns 满足条件的元素，如果超时则返回null
 */
export async function waitForElementCondition(
  selector: string,
  condition: (element: Element) => boolean,
  options: {
    timeout?: number
    interval?: number
    useXPath?: boolean
    parent?: Element | Document
  } = {}
): Promise<Element | null> {
  const {
    timeout = 10000,
    interval = 200,
    useXPath = false,
    parent = document
  } = options

  const startTime = Date.now()

  return new Promise((resolve) => {
    const checkElement = () => {
      let element: Element | null = null

      if (useXPath) {
        const xpathResult = document.evaluate(
          selector,
          parent as Document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        )
        element = xpathResult.singleNodeValue as Element | null
      } else {
        element = (parent as Element | Document).querySelector(selector)
      }

      if (element && condition(element)) {
        // 找到元素且满足条件，返回
        resolve(element)
        return
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
