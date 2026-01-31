# 插件实现文档

## 完整执行流程

### 1. 用户操作入口
**文件**: `popup.tsx`
**函数**: `handleOpenShippingDesk()`

用户点击"打开发货台"按钮后触发：
1. 获取表单配置（仓库、发货方式、产品）
2. 发送 `OPEN_SHIPPING_DESK` 消息到 background
3. Background 打开新窗口并跳转到发货台页面

---

### 2. Background 打开发货台页面
**文件**: `background.ts`
**函数**: `handleOpenShippingDeskPage()`

流程：
1. 创建新窗口（1200x800）
2. 跳转到 `https://seller.kuajingmaihuo.com/main/order-manager/shipping-desk`
3. 监听标签页更新事件
4. 检测到发货台页面加载完成后，等待3秒
5. 发送 `START_SHIPPING_DESK_TASK` 消息到 content script

---

### 3. Content Script 消息转发
**文件**: `content.ts`
**监听消息**: `START_SHIPPING_DESK_TASK`

接收消息后：
1. 调用 `startShippingDeskTasks()` 函数
2. 传递配置参数（warehouse, shippingMethod, product）

---

### 4. 发货台完整流程（核心逻辑）
**文件**: `pages/batch-shipment.ts`
**函数**: `startShippingDeskTasks(config)`

#### 步骤1: 等待页面加载
- 使用 `findDom()` 查找分页元素 `ul[data-testid="beast-core-pagination"]`
- 超时时间：30秒

#### 步骤2: 刷新表格
**函数**: `refreshTable()`
- 查找"刷新"按钮并点击
- 等待3秒后检查分页元素

#### 步骤3: 提取表格数据
**函数**: `extractTableData()`
- 查找表格 body：`tbody[data-testid="beast-core-table-middle-tbody"]`
- 遍历每行，提取：
  - 备货单号
  - 货号
  - 仓库
  - SKU ID
  - 数量（固定为1）

#### 步骤4: 过滤已发货订单
**消息**: `CHECK_STOCK_ORDER_SHIPPED`
- 将备货单号发送到 background
- Background 检查已发货记录
- 返回未发货的订单列表

#### 步骤5: 按仓库和产品分组
**函数**: `groupDataByWarehouseAndProduct()`
- 按 `仓库|产品` 作为 key 分组
- 支持多仓库处理

#### 步骤6: 保存数据
**消息**: `SAVE_SHIPPING_DESK_DATA`
- Background 创建文件夹结构：`日期/店铺名/产品/发货清单.xlsx`
- 使用 ExcelJS 生成 Excel 文件

#### 步骤7: 按仓库处理发货流程
对每个仓库循环执行：

##### 步骤7.1: 刷新表格
**函数**: `refreshTable()`
- 刷新表格确保数据最新

##### 步骤7.2: 勾选同仓库订单
**函数**: `selectOrdersByWarehouse(warehouse, rows)`
- 遍历表格，查找匹配的备货单号
- 勾选对应订单的复选框

##### 步骤7.3: 点击创建发货单
**函数**: `clickCreateShippingOrderButton()`
- 查找"创建发货单"按钮并点击
- 等待2秒

##### 步骤7.4: 处理创建发货单页面
**函数**: `handleCreateShippingOrderPage(warehouse)`
- 点击"批量选择"按钮
- 在弹窗中查找匹配的仓库选项（单选框）
- 点击"确认"按钮
- 点击"下一步"按钮

##### 步骤7.5: 等待跳转到发货列表
**函数**: `waitForPageNavigation(url, timeout)`
- 监听 URL 变化
- 等待跳转到 `https://seller.kuajingmaihuo.com/main/order-manager/shipping-list`
- 超时时间：15秒

##### 步骤7.6: 处理发货列表页面
**函数**: `handleShippingListPage(shippingMethod)`
- 刷新表格
- 全选订单
- 点击"批量打印商品打包标签"
- 点击"批量装箱发货"
- 选择发货方式（自送/自行委托第三方物流/在线物流下单）
- 选择"不合包"
- 设置数量为1
- 确认发货

##### 步骤7.7: 返回发货台处理下一个仓库
**消息**: `NAVIGATE_TO_SHIPPING_DESK`
- Background 更新标签页 URL 返回发货台
- 等待3秒后继续下一个仓库

---

## 消息传递机制

### Popup → Background
| 消息类型 | 数据 | 处理函数 |
|---------|------|---------|
| `OPEN_SHIPPING_DESK` | warehouse, shippingMethod, product, url | `handleOpenShippingDeskPage()` |
| `NAVIGATE_TO_SHIPPING_DESK` | url | `handleNavigateToShippingDesk()` |

### Background → Content
| 消息类型 | 数据 | 处理文件 |
|---------|------|---------|
| `START_SHIPPING_DESK_TASK` | warehouse, shippingMethod, product | content.ts → batch-shipment.ts |

### Content → Background
| 消息类型 | 数据 | 处理函数 |
|---------|------|---------|
| `CHECK_STOCK_ORDER_SHIPPED` | stockOrderNos[] | 检查已发货记录 |
| `SAVE_SHIPPING_DESK_DATA` | baseFolder, shopName, product, groupedData | `handleSaveShippingDeskData()` |

---

## 关键辅助函数

### DOM 操作工具
**文件**: `pages/batch-shipment.ts`

| 函数 | 功能 |
|-----|------|
| `findDom(selector, options)` | 查找 DOM 元素，支持超时和重试 |
| `findButtonByText(selector, text, options)` | 根据文本查找按钮 |
| `sleep(ms)` | 延迟执行 |

### 表格操作
| 函数 | 功能 |
|-----|------|
| `selectAllOrders()` | 全选订单（点击表头复选框） |
| `refreshTable()` | 刷新表格（点击刷新按钮） |

### 发货流程操作
| 函数 | 功能 |
|-----|------|
| `selectOrdersByWarehouse(warehouse, rows)` | 勾选指定仓库的订单 |
| `clickCreateShippingOrderButton()` | 点击创建发货单按钮 |
| `handleCreateShippingOrderPage(warehouse)` | 处理创建发货单页面 |
| `handleShippingListPage(shippingMethod)` | 处理发货列表页面完整流程 |
| `selectShippingMethod(shippingMethod)` | 选择发货方式 |
| `selectNotMergeBoxing()` | 选择不合包 |
| `selectQuantity(quantity)` | 设置发货数量 |
| `confirmShipment()` | 确认发货 |

### 页面导航
| 函数 | 功能 |
|-----|------|
| `waitForPageNavigation(url, timeout)` | 等待页面跳转到指定 URL |

---

## 数据结构

### TableRowData
```typescript
interface TableRowData {
  rowElement: HTMLElement
  stockOrderNo: string
  productCode: string
  warehouse: string
  skuId: string
  quantity: number
}
```

### UserConfig
```typescript
interface UserConfig {
  warehouse: string
  shippingMethod: string
  product: string
}
```

---

## 重要注意事项

### 1. CSS 选择器限制
网页的 class 是动态的，不能使用 class 选择器。必须使用：
- `data-testid` 属性
- 文本内容
- 其他稳定的属性

### 2. 页面加载等待
每次页面跳转后需要等待页面加载完成：
- 使用 `sleep()` 函数延迟
- 检查关键元素是否存在
- 使用 `waitForPageNavigation()` 监听 URL 变化

### 3. 多仓库处理
流程支持多仓库处理：
- 按仓库分组订单
- 循环处理每个仓库
- 每次处理完返回发货台继续下一个

### 4. 已发货订单过滤
避免重复发货：
- Background 维护已发货订单记录
- 每次执行前过滤已发货订单
- 备货单号作为唯一标识

### 5. 错误处理
所有关键操作都有 try-catch 错误处理：
- 记录详细错误日志
- 失败后继续执行或提示用户

---

## 配置选项

### 发货仓库
- 莆田仓库
- 义乌仓库
- 可在设置页面添加更多仓库

### 发货方式
- 自送
- 自行委托第三方物流
- 在线物流下单

### 产品
- 0.2亚克力、0.5亚克力、1亚克力等
- 可在设置页面管理产品列表

---

## 扩展和维护

### 添加新仓库
1. 在 `popup.tsx` 中添加到 `DEFAULT_WAREHOUSE_OPTIONS`
2. 或在设置页面中添加

### 添加新产品
1. 在 `popup.tsx` 中添加到 `DEFAULT_PRODUCT_OPTIONS`
2. 或在设置页面中添加

### 修改发货流程
1. 主要逻辑在 `batch-shipment.ts` 的 `startShippingDeskTasks()` 函数
2. 每个子步骤都有对应的辅助函数
3. 可单独修改某个步骤而不影响其他步骤

### 修改消息处理
1. Background 消息监听在 `background.ts` 的 `chrome.runtime.onMessage` 中
2. Content 消息监听在 `content.ts` 中
3. 添加新消息类型需要两端同时处理
