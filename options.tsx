/**
 * Options 页面（设置页面）
 * 用于编辑发货仓库和产品选项
 */

import { DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons"
import { Button, Card, Form, Input, List, Space, Typography, message } from "antd"
import React, { useEffect, useState } from "react"

import "./style.css"

const { Title } = Typography

// 默认配置数据
const DEFAULT_WAREHOUSE_OPTIONS = [
  { label: "莆田仓库", value: "莆田仓库" },
  { label: "义乌仓库", value: "义乌仓库" }
]

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

const OptionsPage: React.FC = () => {
  const [warehouseOptions, setWarehouseOptions] = useState<OptionItem[]>(DEFAULT_WAREHOUSE_OPTIONS)
  const [productOptions, setProductOptions] = useState<OptionItem[]>(DEFAULT_PRODUCT_OPTIONS)
  const [loading, setLoading] = useState(false)
  const [newWarehouse, setNewWarehouse] = useState("")
  const [newProduct, setNewProduct] = useState("")

  /**
   * 从 chrome.storage 加载配置
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await chrome.storage.local.get(["warehouseOptions", "productOptions"])
        
        if (result.warehouseOptions && Array.isArray(result.warehouseOptions) && result.warehouseOptions.length > 0) {
          setWarehouseOptions(result.warehouseOptions)
        }
        
        if (result.productOptions && Array.isArray(result.productOptions) && result.productOptions.length > 0) {
          setProductOptions(result.productOptions)
        }
      } catch (error) {
        console.error("[Options] 加载配置失败:", error)
      }
    }

    loadConfig()
  }, [])

  /**
   * 保存配置到 chrome.storage
   */
  const handleSave = async () => {
    setLoading(true)

    try {
      await chrome.storage.local.set({
        warehouseOptions: warehouseOptions,
        productOptions: productOptions
      })

      message.success("配置已保存")
    } catch (error: any) {
      console.error("[Options] 保存配置失败:", error)
      message.error(`保存失败: ${error?.message || "未知错误"}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 添加新的发货仓库
   */
  const handleAddWarehouse = () => {
    if (!newWarehouse.trim()) {
      message.warning("请输入仓库名称")
      return
    }

    // 检查是否已存在
    if (warehouseOptions.some(item => item.value === newWarehouse.trim())) {
      message.warning("该仓库已存在")
      return
    }

    const newItem: OptionItem = {
      label: newWarehouse.trim(),
      value: newWarehouse.trim()
    }

    setWarehouseOptions([...warehouseOptions, newItem])
    setNewWarehouse("")
    message.success("仓库已添加")
  }

  /**
   * 删除发货仓库
   */
  const handleDeleteWarehouse = (value: string) => {
    if (warehouseOptions.length <= 1) {
      message.warning("至少需要保留一个仓库选项")
      return
    }

    setWarehouseOptions(warehouseOptions.filter(item => item.value !== value))
    message.success("仓库已删除")
  }

  /**
   * 添加新的产品
   */
  const handleAddProduct = () => {
    if (!newProduct.trim()) {
      message.warning("请输入产品名称")
      return
    }

    // 检查是否已存在
    if (productOptions.some(item => item.value === newProduct.trim())) {
      message.warning("该产品已存在")
      return
    }

    const newItem: OptionItem = {
      label: newProduct.trim(),
      value: newProduct.trim()
    }

    setProductOptions([...productOptions, newItem])
    setNewProduct("")
    message.success("产品已添加")
  }

  /**
   * 删除产品
   */
  const handleDeleteProduct = (value: string) => {
    if (productOptions.length <= 1) {
      message.warning("至少需要保留一个产品选项")
      return
    }

    setProductOptions(productOptions.filter(item => item.value !== value))
    message.success("产品已删除")
  }

  /**
   * 编辑仓库选项
   */
  const handleEditWarehouse = (oldValue: string, newValue: string) => {
    if (!newValue.trim()) {
      message.warning("仓库名称不能为空")
      return
    }

    // 检查新值是否与其他项重复
    if (warehouseOptions.some(item => item.value === newValue.trim() && item.value !== oldValue)) {
      message.warning("该仓库名称已存在")
      return
    }

    setWarehouseOptions(
      warehouseOptions.map(item =>
        item.value === oldValue
          ? { label: newValue.trim(), value: newValue.trim() }
          : item
      )
    )
  }

  /**
   * 编辑产品选项
   */
  const handleEditProduct = (oldValue: string, newValue: string) => {
    if (!newValue.trim()) {
      message.warning("产品名称不能为空")
      return
    }

    // 检查新值是否与其他项重复
    if (productOptions.some(item => item.value === newValue.trim() && item.value !== oldValue)) {
      message.warning("该产品名称已存在")
      return
    }

    setProductOptions(
      productOptions.map(item =>
        item.value === oldValue
          ? { label: newValue.trim(), value: newValue.trim() }
          : item
      )
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 pb-24">
      <div className="max-w-4xl mx-auto">
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* 标题 */}
          <div className="text-center">
            <Title level={2}>插件设置</Title>
          </div>

          {/* 发货仓库配置 */}
          <Card title="发货仓库配置" extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>保存配置</Button>}>
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {/* 添加新仓库 */}
              <Space>
                <Input
                  placeholder="输入新仓库名称"
                  value={newWarehouse}
                  onChange={(e) => setNewWarehouse(e.target.value)}
                  onPressEnter={handleAddWarehouse}
                  style={{ width: 300 }}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddWarehouse}>
                  添加仓库
                </Button>
              </Space>

              {/* 仓库列表 */}
              <List
                bordered
                dataSource={warehouseOptions}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteWarehouse(item.value)}
                        key="delete">
                        删除
                      </Button>
                    ]}>
                    <EditableText
                      value={item.label}
                      onSave={(newValue) => handleEditWarehouse(item.value, newValue)}
                    />
                  </List.Item>
                )}
              />
            </Space>
          </Card>

          {/* 产品配置 */}
          <Card title="产品配置" extra={<Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>保存配置</Button>}>
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {/* 添加新产品 */}
              <Space>
                <Input
                  placeholder="输入新产品名称"
                  value={newProduct}
                  onChange={(e) => setNewProduct(e.target.value)}
                  onPressEnter={handleAddProduct}
                  style={{ width: 300 }}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddProduct}>
                  添加产品
                </Button>
              </Space>

              {/* 产品列表 */}
              <List
                bordered
                dataSource={productOptions}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteProduct(item.value)}
                        key="delete">
                        删除
                      </Button>
                    ]}>
                    <EditableText
                      value={item.label}
                      onSave={(newValue) => handleEditProduct(item.value, newValue)}
                    />
                  </List.Item>
                )}
              />
            </Space>
          </Card>
        </Space>
      </div>

      {/* 保存按钮 - 固定在底部 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-4 px-6 shadow-lg z-50">
        <div className="max-w-4xl mx-auto text-center">
          <Button
            type="primary"
            size="large"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={loading}>
            保存所有配置
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * 可编辑文本组件
 * 支持双击编辑
 */
interface EditableTextProps {
  value: string
  onSave: (newValue: string) => void
}

const EditableText: React.FC<EditableTextProps> = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleSave = () => {
    if (inputValue.trim() !== value) {
      onSave(inputValue.trim())
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setInputValue(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onPressEnter={handleSave}
        onBlur={handleSave}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            handleCancel()
          }
        }}
        style={{ width: 200 }}
      />
    )
  }

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      style={{ cursor: "pointer", userSelect: "none" }}
      title="双击编辑">
      {value}
    </span>
  )
}

export default OptionsPage
