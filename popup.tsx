/**
 * Popup 页面（弹窗页面）
 * 插件的主要控制界面，包含批量自动发货表单
 */

import { SendOutlined } from "@ant-design/icons"
import { Button, Card, Form, Select, Space, Typography, message } from "antd"
import React, { useState } from "react"

import "./style.css"

const { Title } = Typography
const { Option } = Select

// 发货仓库选项
// value和label保持一致，便于理解和使用
const WAREHOUSE_OPTIONS = [
  { label: "莆田仓库", value: "莆田仓库" },
  { label: "义乌仓库", value: "义乌仓库" }
]

// 发货方式选项
// value和label保持一致，便于理解和使用
const SHIPPING_METHOD_OPTIONS = [
  { label: "自送", value: "自送" },
  { label: "自行委托第三方物流", value: "自行委托第三方物流" },
  { label: "在线物流下单", value: "在线物流下单" }
]

// 表单数据类型定义
interface ShipmentFormData {
  warehouse: string // 发货仓库
  shippingMethod: string // 发货方式
}

const PopupPage: React.FC = () => {
  const [form] = Form.useForm<ShipmentFormData>()
  const [loading, setLoading] = useState(false)

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
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!activeTab || !activeTab.id) {
        throw new Error('无法获取当前标签页')
      }

      // 检查当前页面是否是shipping-list页面
      const currentUrl = activeTab.url || ''
      if (!currentUrl.includes('seller.kuajingmaihuo.com') || !currentUrl.includes('/main/order-manager/shipping-list')) {
        message.warning('请先打开发货单列表页面（shipping-list）')
        setLoading(false)
        return
      }

      // 获取表单值
      const values = form.getFieldsValue()
      
      // 发送消息到content script，直接执行发货步骤
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'START_SHIPMENT_STEPS_DIRECTLY',
        data: {
          warehouse: values.warehouse || '义乌仓库',
          shippingMethod: values.shippingMethod || '自送'
        }
      })

      if (response && response.success) {
        message.success('已开始执行发货步骤')
      } else {
        throw new Error('执行失败，未收到有效响应')
      }
    } catch (error: any) {
      const errorMessage = error?.message || chrome.runtime.lastError?.message || '操作失败'
      console.error('[Popup] 直接执行发货步骤失败:', error)
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
      console.log('[Popup] 清空之前保存的数据...')
      await chrome.storage.local.remove(['shippingDeskData', 'shippingDeskDataRecordList'])
      console.log('[Popup] 数据已清空')

      // 发送消息到 background，保存配置并打开新窗口
      const response = await chrome.runtime.sendMessage({
        type: "SAVE_CONFIG_AND_OPEN_URL",
        data: {
          warehouse: values.warehouse,
          shippingMethod: values.shippingMethod,
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
      const errorMessage = error?.message || chrome.runtime.lastError?.message || "操作失败"
      const isConnectionError = errorMessage.includes("Could not establish connection") || 
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
              shippingMethod: values.shippingMethod
            }
          })
          message.success("页面已打开，配置已保存")
        } catch (directError: any) {
          console.error("[Popup] 直接打开窗口失败:", directError)
          message.error(`无法打开页面: ${directError?.message || "请检查插件权限"}`)
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
          {/* 标题 */}
          <div className="text-center">
            <Title level={4} style={{ margin: 0 }}>
              批量自动发货
            </Title>
          </div>

          {/* 表单 */}
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            autoComplete="off"
            initialValues={{
              warehouse: "义乌仓库", // 默认选择义乌仓库
              shippingMethod: "自送" // 默认选择自送方式
            }}>
            {/* 发货仓库选择 */}
            <Form.Item
              label="发货仓库"
              name="warehouse"
              rules={[
                { required: true, message: "请选择发货仓库" }
              ]}>
              <Select
                placeholder="请选择发货仓库"
                size="large">
                {WAREHOUSE_OPTIONS.map((option) => (
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
              rules={[
                { required: true, message: "请选择发货方式" }
              ]}>
              <Select
                placeholder="请选择发货方式"
                size="large">
                {SHIPPING_METHOD_OPTIONS.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {option.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* 提交按钮 */}
            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                loading={loading}
                block
                size="large">
                开始批量自动发货
              </Button>
            </Form.Item>

            {/* 直接执行发货步骤按钮（开发阶段测试用） */}
            {/* 注意：这是开发阶段的功能，正式版本应该从第一步开始执行完整流程 */}
            <Form.Item>
              <Button
                type="default"
                onClick={handleDirectShipment}
                loading={loading}
                block
                size="large">
                直接执行发货步骤（开发测试用）
              </Button>
            </Form.Item>
          </Form>
        </Space>
    </div>
  )
}

export default PopupPage
