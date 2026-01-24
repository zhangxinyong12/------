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
const WAREHOUSE_OPTIONS = [
  { label: "莆田仓库", value: "putian" },
  { label: "义乌仓库", value: "yiwu" }
]

// 发货方式选项
const SHIPPING_METHOD_OPTIONS = [
  { label: "自送", value: "self_delivery" },
  { label: "自行委托第三方物流", value: "third_party_logistics" },
  { label: "在线物流下单", value: "online_logistics" }
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
   * 处理表单提交
   * 开始批量自动发货
   */
  const handleSubmit = async (values: ShipmentFormData) => {
    console.log("表单提交数据:", values)
    setLoading(true)

    try {
      // TODO: 在这里实现批量自动发货的逻辑
      // 1. 获取待发货订单列表
      // 2. 根据选择的仓库和发货方式批量处理订单
      // 3. 更新订单状态

      // 模拟异步操作
      await new Promise((resolve) => setTimeout(resolve, 1000))

      message.success("批量自动发货已开始！")
      console.log("发货仓库:", values.warehouse)
      console.log("发货方式:", values.shippingMethod)

      // 提交成功后可以重置表单（可选）
      // form.resetFields()
    } catch (error) {
      console.error("批量自动发货失败:", error)
      message.error("批量自动发货失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-[400px] p-4">
      <Card>
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
            autoComplete="off">
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
          </Form>
        </Space>
      </Card>
    </div>
  )
}

export default PopupPage
