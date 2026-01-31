/**
 * Popup 页面（弹窗页面）
 * 插件的主要控制界面，包含批量自动发货表单
 */

import { SendOutlined, SettingOutlined } from "@ant-design/icons"
import { Button, Card, Form, message, Select, Space, Typography } from "antd"
import React, { useEffect, useState } from "react"

import "./style.css"

const { Title } = Typography
const { Option } = Select

// 默认发货仓库选项
const DEFAULT_WAREHOUSE_OPTIONS = [
  { label: "莆田仓库", value: "莆田仓库" },
  { label: "义乌仓库", value: "义乌仓库" }
]

// 发货方式选项
const SHIPPING_METHOD_OPTIONS = [
  { label: "自送", value: "自送" },
  { label: "自行委托第三方物流", value: "自行委托第三方物流" },
  { label: "在线物流下单", value: "在线物流下单" }
]

// 默认产品选项
const DEFAULT_PRODUCT_OPTIONS = [
  { label: "0.2亚克力", value: "0.2亚克力" },
  { label: "0.5亚克力", value: "0.5亚克力" },
  { label: "1亚克力", value: "1亚克力" },
  { label: "1.2亚克力", value: "1.2亚克力" },
  { label: "0.3木板", value: "0.3木板" },
  { label: "0.5木板", value: "0.5木板" },
  { label: "1.5木板", value: "1.5木板" },
  { label: "0.4中空板", value: "0.4中空板" },
  { label: "0.9木板", value: "0.9木板" },
  { label: "0.9支架", value: "0.9支架" },
  { label: "30*45框画", value: "30*45框画" },
  { label: "40*60框画", value: "40*60框画" },
  { label: "四叶草", value: "四叶草" },
  { label: "0.3叠雕", value: "0.3叠雕" },
  { label: "挂钩架", value: "挂钩架" },
  { label: "置物架", value: "置物架" },
  { label: "15圆", value: "15圆" },
  { label: "椭圆", value: "椭圆" },
  { label: "椭圆三联", value: "椭圆三联" },
  { label: "四叶草三联", value: "四叶草三联" },
  { label: "浴室挂钩", value: "浴室挂钩" },
  { label: "0.5桌牌", value: "0.5桌牌" },
  { label: "0.3挂钩", value: "0.3挂钩" },
  { label: "0.5挂钩", value: "0.5挂钩" },
  { label: "雪弗板挂钩", value: "雪弗板挂钩" },
  { label: "三层托盘", value: "三层托盘" },
  { label: "小挂钩", value: "小挂钩" },
  { label: "雪弗板", value: "雪弗板" },
  { label: "化妆包", value: "化妆包" },
  { label: "纸巾架", value: "纸巾架" },
  { label: "包边雪弗板", value: "包边雪弗板" },
  { label: "亚克力立牌", value: "亚克力立牌" },
  { label: "方框", value: "方框" },
  { label: "八角框", value: "八角框" }
]

// 选项数据类型
interface OptionItem {
  label: string
  value: string
}

// 表单数据类型定义
interface ShipmentFormData {
  warehouse: string // 发货仓库
  shippingMethod: string // 发货方式
  product: string // 产品
}

const PopupPage: React.FC = () => {
  const [form] = Form.useForm<ShipmentFormData>()
  const [loading, setLoading] = useState(false)
  const [warehouseOptions, setWarehouseOptions] = useState<OptionItem[]>(
    DEFAULT_WAREHOUSE_OPTIONS
  )
  const [productOptions, setProductOptions] = useState<OptionItem[]>(
    DEFAULT_PRODUCT_OPTIONS
  )

  /**
   * 从 chrome.storage 加载配置
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await chrome.storage.local.get([
          "warehouseOptions",
          "productOptions"
        ])

        if (
          result.warehouseOptions &&
          Array.isArray(result.warehouseOptions) &&
          result.warehouseOptions.length > 0
        ) {
          setWarehouseOptions(result.warehouseOptions)
        }

        if (
          result.productOptions &&
          Array.isArray(result.productOptions) &&
          result.productOptions.length > 0
        ) {
          setProductOptions(result.productOptions)
        }
      } catch (error) {
        console.error("[Popup] 加载配置失败:", error)
      }
    }

    loadConfig()

    // 监听 storage 变化，当 options 页面保存配置后自动更新
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange
    }) => {
      if (changes.warehouseOptions) {
        setWarehouseOptions(
          changes.warehouseOptions.newValue || DEFAULT_WAREHOUSE_OPTIONS
        )
      }
      if (changes.productOptions) {
        setProductOptions(
          changes.productOptions.newValue || DEFAULT_PRODUCT_OPTIONS
        )
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  /**
   * 打开设置页面
   * 使用 mousedown 触发，避免 popup 在 click 完成前关闭导致无反应
   * 先尝试 openOptionsPage，失败时用 tabs.create 打开 options 地址
   */
  const handleOpenSettings = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const optionsUrl = chrome.runtime.getURL("options.html")
    const openOptions = () => {
      if (typeof chrome.runtime.openOptionsPage === "function") {
        Promise.resolve(chrome.runtime.openOptionsPage()).catch(() => {
          chrome.tabs.create({ url: optionsUrl })
        })
      } else {
        chrome.tabs.create({ url: optionsUrl })
      }
    }
    openOptions()
  }

  /**
   * 直接执行发货步骤（开发阶段测试用）
   * 跳过前面的步骤，直接执行发货操作
   *
   * 注意：这是开发阶段的功能，用于测试发货步骤
   * 正式版本应该从第一步开始执行完整流程
   */
  const handleDirectShipment = async () => {
    setLoading(true)

    try {
      // 获取当前活动标签页
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!activeTab || !activeTab.id) {
        throw new Error("无法获取当前标签页")
      }

      // 检查当前页面是否是支持的网站
      const currentUrl = activeTab.url || ""
      const isTemuSite = currentUrl.includes("agentseller.temu.com")
      const isKuajingSite = currentUrl.includes("seller.kuajingmaihuo.com")

      if (!isTemuSite && !isKuajingSite) {
        message.warning("请在 Temu 或 抖音跨境商城 页面上使用此功能")
        setLoading(false)
        return
      }

      // 对于抖音跨境商城，检查是否是shipping-list页面
      if (
        isKuajingSite &&
        !currentUrl.includes("/main/order-manager/shipping-list")
      ) {
        message.warning("请先打开发货单列表页面（shipping-list）")
        setLoading(false)
        return
      }

      // 获取表单值
      const values = form.getFieldsValue()

      // 发送消息到content script，直接执行发货步骤
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: "START_SHIPMENT_STEPS_DIRECTLY",
        data: {
          warehouse: values.warehouse || "义乌仓库",
          shippingMethod: values.shippingMethod || "自送",
          product: values.product || ""
        }
      })

      if (response && response.success) {
        message.success("已开始执行发货步骤")
      } else {
        throw new Error("执行失败，未收到有效响应")
      }
    } catch (error: any) {
      const errorMessage =
        error?.message || chrome.runtime.lastError?.message || "操作失败"
      console.error("[Popup] 直接执行发货步骤失败:", error)
      message.error(`操作失败: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 测试点击待仓库收货标签页
   * 点击后自动切换到待仓库收货标签，并等待页面和表格加载
   */
  const handleTestWarehouseReceipt = async () => {
    setLoading(true)

    try {
      // 获取当前活动标签页
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!activeTab || !activeTab.id) {
        throw new Error("无法获取当前标签页")
      }

      // 检查当前页面是否是shipping-list页面
      const currentUrl = activeTab.url || ""
      if (
        !currentUrl.includes("seller.kuajingmaihuo.com") ||
        !currentUrl.includes("/main/order-manager/shipping-list")
      ) {
        message.warning("请先打开发货单列表页面（shipping-list）")
        setLoading(false)
        return
      }

      // 尝试发送消息，带重试机制
      let response = null
      const maxRetries = 3
      const retryDelay = 1000

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Popup] 尝试发送消息 (第 ${attempt} 次)...`)
          response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "CLICK_WAREHOUSE_RECEIPT_TAB",
            data: {}
          })
          console.log("[Popup] 收到响应:", response)
          break
        } catch (sendMessageError: any) {
          const errorMessage = sendMessageError?.message || ""
          const isConnectionError =
            errorMessage.includes("Could not establish connection") ||
            errorMessage.includes("Receiving end does not exist") ||
            errorMessage.includes("Extension context invalidated")

          if (isConnectionError && attempt < maxRetries) {
            console.warn(
              `[Popup] 消息发送失败 (第 ${attempt} 次)，${retryDelay}ms 后重试...`
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
            continue
          } else {
            throw sendMessageError
          }
        }
      }

      if (response && response.success) {
        message.success("已启动批量下载，将逐个下载PDF文件...")
      } else {
        throw new Error("执行失败，未收到有效响应")
      }
    } catch (error: any) {
      const errorMessage =
        error?.message || chrome.runtime.lastError?.message || "操作失败"
      console.error("[Popup] 点击待仓库收货标签失败:", error)
      message.error(`操作失败: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 测试打印条码功能
   * 点击"打印商品条码"链接，然后点击"打印"按钮，检查是否有系统弹窗
   */
  const handleTestPrintBarcode = async () => {
    setLoading(true)

    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      })

      if (!activeTab || !activeTab.id) {
        throw new Error("无法获取当前标签页")
      }

      // 检查当前页面是否是支持的网站
      const currentUrl = activeTab.url || ""
      const isTemuSite = currentUrl.includes("agentseller.temu.com")
      const isKuajingSite = currentUrl.includes("seller.kuajingmaihuo.com")

      if (!isTemuSite && !isKuajingSite) {
        message.warning("请在 Temu 或 抖音跨境商城 页面上使用此功能")
        setLoading(false)
        return
      }

      // 尝试发送消息，带重试机制
      let response = null
      const maxRetries = 3
      const retryDelay = 1000

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[Popup] 尝试发送消息 (第 ${attempt} 次)...`)
          response = await chrome.tabs.sendMessage(activeTab.id, {
            type: "TEST_PRINT_BARCODE",
            data: {}
          })
          console.log("[Popup] 收到响应:", response)
          break
        } catch (sendMessageError: any) {
          const errorMessage = sendMessageError?.message || ""
          const isConnectionError =
            errorMessage.includes("Could not establish connection") ||
            errorMessage.includes("Receiving end does not exist") ||
            errorMessage.includes("Extension context invalidated")

          if (isConnectionError && attempt < maxRetries) {
            console.warn(
              `[Popup] 消息发送失败 (第 ${attempt} 次)，${retryDelay}ms 后重试...`
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
            continue
          } else {
            throw sendMessageError
          }
        }
      }

      if (response && response.success) {
        message.success("测试已完成，请检查控制台日志")
      } else {
        throw new Error("执行失败，未收到有效响应")
      }
    } catch (error: any) {
      const errorMessage =
        error?.message || chrome.runtime.lastError?.message || "操作失败"
      console.error("[Popup] 测试打印条码失败:", error)
      message.error(`操作失败: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 打开发货台页面并执行完整自动化流程
   * 1. 跳转到发货台 URL
   * 2. 等待页面加载
   * 3. 自动刷新表格
   * 4. 全选订单
   * 5. 提取数据并保存
   */
  const handleOpenShippingDesk = async () => {
    setLoading(true)

    try {
      const values = form.getFieldsValue()

      // 发送消息到 background，打开发货台页面
      const response = await chrome.runtime.sendMessage({
        type: "OPEN_SHIPPING_DESK",
        data: {
          warehouse: values.warehouse || "义乌仓库",
          shippingMethod: values.shippingMethod || "自送",
          product: values.product || "0.2亚克力",
          url: "https://seller.kuajingmaihuo.com/main/order-manager/shipping-desk"
        }
      })

      if (response && response.success) {
        message.success("已打开发货台页面，将自动执行流程...")
      } else {
        const errorMsg = response?.error || "操作失败，未收到有效响应"
        throw new Error(errorMsg)
      }
    } catch (error: any) {
      const errorMessage =
        error?.message || chrome.runtime.lastError?.message || "操作失败"
      console.error("[Popup] 打开发货台页面失败:", error)
      message.error(`操作失败: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 处理表单提交
   * 开始批量自动发货
   * 保存用户配置到 background，并打开新窗口
   */
  const handleSubmit = async (values: ShipmentFormData) => {
    setLoading(true)

    try {
      // 每次开始执行时，先清空之前保存的数据
      console.log("[Popup] 清空之前保存的数据...")
      await chrome.storage.local.remove([
        "shippingDeskData",
        "shippingDeskDataRecordList"
      ])
      console.log("[Popup] 数据已清空")

      // 发送消息到 background，保存配置并打开新窗口
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_CONFIG_AND_OPEN_URL",
        data: {
          warehouse: values.warehouse,
          shippingMethod: values.shippingMethod,
          product: values.product,
          url: "https://agentseller.temu.com/stock/fully-mgt/order-manage-urgency"
        }
      })

      if (response && response.success) {
        message.success("配置已保存，正在打开页面...")
      } else {
        const errorMsg = response?.error || "操作失败，未收到有效响应"
        throw new Error(errorMsg)
      }
    } catch (error: any) {
      // 如果消息发送失败，可能是 background script 未加载，尝试直接打开窗口
      const errorMessage =
        error?.message || chrome.runtime.lastError?.message || "操作失败"
      const isConnectionError =
        errorMessage.includes("Could not establish connection") ||
        errorMessage.includes("Extension context invalidated") ||
        chrome.runtime.lastError

      if (isConnectionError) {
        try {
          await chrome.windows.create({
            url: "https://agentseller.temu.com/stock/fully-mgt/order-manage-urgency",
            type: "normal",
            focused: true
          })
          // 尝试保存配置
          await chrome.storage.local.set({
            userConfig: {
              warehouse: values.warehouse,
              shippingMethod: values.shippingMethod,
              product: values.product
            }
          })
          message.success("页面已打开，配置已保存")
        } catch (directError: any) {
          console.error("[Popup] 直接打开窗口失败:", directError)
          message.error(
            `无法打开页面: ${directError?.message || "请检查插件权限"}`
          )
        }
      } else {
        console.error("[Popup] 批量自动发货失败:", error)
        message.error(`操作失败: ${errorMessage}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-[400px] p-4">
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {/* 标题和设置按钮 */}
        <div className="relative">
          <div className="text-center">
            <Title level={4} style={{ margin: 0 }}>
              批量自动发货
            </Title>
          </div>
          {/* 右上角设置按钮：用 onMouseDown 避免 popup 先关闭导致点击无反应 */}
          <Button
            type="text"
            htmlType="button"
            icon={<SettingOutlined />}
            onMouseDown={handleOpenSettings}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              padding: "4px 8px",
              minWidth: 32,
              minHeight: 32
            }}
            title="打开设置页面"
          />
        </div>

        {/* 表单 */}
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          initialValues={{
            warehouse: "义乌仓库",
            shippingMethod: "自送",
            product: "0.2亚克力"
          }}>
          {/* 发货仓库选择 */}
          <Form.Item
            label="发货仓库"
            name="warehouse"
            rules={[{ required: true, message: "请选择发货仓库" }]}>
            <Select placeholder="请选择发货仓库" size="large">
              {warehouseOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* 发货方式选择 */}
          <Form.Item
            label="发货方式"
            name="shippingMethod"
            rules={[{ required: true, message: "请选择发货方式" }]}>
            <Select placeholder="请选择发货方式" size="large">
              {SHIPPING_METHOD_OPTIONS.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* 产品选择 */}
          <Form.Item
            label="产品"
            name="product"
            rules={[{ required: true, message: "请选择产品" }]}>
            <Select
              placeholder="请选择产品"
              size="large"
              showSearch
              filterOption={(input, option) =>
                (option?.children as unknown as string)
                  ?.toLowerCase()
                  .includes(input.toLowerCase())
              }>
              {productOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* 打开发货台按钮 */}
          <Form.Item>
            <Button
              type="primary"
              onClick={handleOpenShippingDesk}
              loading={loading}
              block
              size="large">
              自动发货
            </Button>
          </Form.Item>
        </Form>
      </Space>
    </div>
  )
}

export default PopupPage
