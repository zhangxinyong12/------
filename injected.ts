/**
 * 注入脚本 (Injected Script)
 * 此脚本会被注入到页面上下文中，用于拦截页面的fetch请求
 * 由于content script运行在isolated world，无法直接访问页面的window.fetch
 * 因此需要通过注入脚本的方式在页面上下文中拦截fetch，然后通过postMessage与content script通信
 */

// 插件运行状态标记
let isPluginRunning = false

// 监听来自content script的消息，更新插件运行状态
window.addEventListener("message", (event) => {
  if (event.source !== window) return

  if (event.data.type === "SET_PLUGIN_RUNNING_STATUS") {
    isPluginRunning = event.data.status
    console.log(
      "[Injected] 插件运行状态已更新:",
      isPluginRunning ? "运行中" : "已停止"
    )
  }
})

/**
 * 拦截window.print()，根据插件运行状态决定是否拦截
 */
function interceptWindowPrint(): void {
  console.log("[Injected] 开始拦截window.print()...")

  // 检查是否已经设置过拦截器
  if ((window as any).__windowPrintIntercepted) {
    console.log("[Injected] window.print()拦截器已设置，跳过")
    return
  }

  // 保存原始的print函数
  const originalPrint = window.print

  // 重写print函数
  window.print = function (...args) {
    if (isPluginRunning) {
      console.log("[Injected] 插件运行中，拦截window.print()调用")
      // 插件运行时，不弹出打印窗口，直接返回
      return
    }

    // 插件未运行时，正常调用原始print函数，允许用户打印
    console.log("[Injected] 插件未运行，正常调用window.print()")
    return originalPrint.apply(this, args)
  }

  // 标记拦截器已设置
  ;(window as any).__windowPrintIntercepted = true

  console.log("[Injected] window.print()拦截器已设置")
}

/**
 * 拦截fetch请求，获取打印接口返回的数据
 * 当检测到打印接口调用时，拦截响应数据并通过postMessage通知content script
 */
function interceptPrintAPI(): void {
  console.log("[Injected] 开始拦截打印接口请求...")

  // 检查是否已经设置过拦截器
  if ((window as any).__printAPIIntercepted) {
    console.log("[Injected] 打印接口拦截器已设置，跳过")
    return
  }

  // 保存原始的fetch函数
  const originalFetch = window.fetch

  // 重写fetch函数
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url
    const urlLower = url.toLowerCase()

    // 检查是否是打印相关的接口
    const isPrintRequest =
      urlLower.includes("print") ||
      urlLower.includes("label") ||
      urlLower.includes("packing") ||
      urlLower.includes("shipping") ||
      urlLower.includes("batchprint") ||
      urlLower.includes("batch-print") ||
      urlLower.includes("printlabel")

    if (isPrintRequest) {
      console.log("[Injected] 检测到打印接口请求:", url)

      try {
        // 调用原始的fetch
        const response = await originalFetch.apply(this, args)

        // 克隆响应，以便我们可以读取数据而不影响原始响应
        const clonedResponse = response.clone()

        // 异步处理响应数据
        clonedResponse
          .text()
          .then(async (text) => {
            try {
              // 尝试解析JSON
              let data: any
              try {
                data = JSON.parse(text)
              } catch {
                // 如果不是JSON，可能是HTML或其他格式
                data = text
              }

              console.log("[Injected] 获取到打印接口返回的数据:", data)

              // 通过postMessage通知content script
              // 使用window.postMessage发送消息，content script通过window.addEventListener('message')接收
              window.postMessage(
                {
                  type: "PRINT_API_RESPONSE",
                  source: "injected-script",
                  data: {
                    url: url,
                    data: data,
                    timestamp: Date.now()
                  }
                },
                "*"
              )

              console.log("[Injected] 已通过postMessage通知content script")
            } catch (error: any) {
              console.error("[Injected] 处理打印接口响应失败:", error)
            }
          })
          .catch((error) => {
            console.error("[Injected] 读取打印接口响应失败:", error)
          })

        return response
      } catch (error: any) {
        console.error("[Injected] 拦截打印接口请求失败:", error)
        return originalFetch.apply(this, args)
      }
    }

    // 非打印请求，直接调用原始fetch
    return originalFetch.apply(this, args)
  }

  // 标记拦截器已设置
  ;(window as any).__printAPIIntercepted = true

  console.log("[Injected] 打印接口拦截器已设置")
}

// 页面加载完成后立即执行拦截
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    interceptWindowPrint()
    interceptPrintAPI()
  })
} else {
  // 如果页面已经加载完成，立即执行
  interceptWindowPrint()
  interceptPrintAPI()
}
