/**
 * 打印标签React组件
 * 使用React组件渲染二维码和条形码，确保PDF导出时能正确显示
 */

import React, { useEffect } from 'react'
import QRCode from 'react-qr-code'
import Barcode from 'react-barcode'

interface PrintLabelProps {
  // 仓库名称
  warehouse: string
  // 是否JIT
  isJIT: boolean
  // 是否加急
  isUrgent: boolean
  // 店铺名称
  shopName: string
  // 打印时间
  printTime: string
  // 产品名称
  productName: string
  // SKC ID
  skcId: string
  // SKU/货号
  sku: string
  // 数量
  quantity: number
  // 包裹号（用于生成二维码和条形码）
  packageNo: string
  // 包裹索引
  packageIndex: number
  // 总包裹数
  totalPackages: number
  // 发货方式
  deliveryMethod: string
  // 司机姓名
  driverName?: string
  // 司机电话
  driverPhone?: string
}

/**
 * 打印标签组件
 * 渲染100x100mm的打印标签，包含二维码和条形码
 */
export const PrintLabel: React.FC<PrintLabelProps> = ({
  warehouse,
  isJIT,
  isUrgent,
  shopName,
  printTime,
  productName,
  skcId,
  sku,
  quantity,
  packageNo,
  packageIndex,
  totalPackages,
  deliveryMethod,
  driverName,
  driverPhone
}) => {
  // 调试：打印packageNo的值
  useEffect(() => {
    console.log('[PrintLabel] ========== 组件渲染调试 ==========')
    console.log('[PrintLabel] 组件已挂载')
    console.log('[PrintLabel] 📦 packageNo值:', packageNo)
    console.log('[PrintLabel] 📦 packageNo类型:', typeof packageNo)
    console.log('[PrintLabel] 📦 packageNo长度:', packageNo?.length)
    console.log('[PrintLabel] 📦 packageNo是否为空:', !packageNo)
    console.log('[PrintLabel] 📦 所有props:', {
      warehouse,
      packageNo,
      packageIndex,
      totalPackages
    })
    
    // 检查DOM中是否已经有SVG，并移除条形码中的文本元素
    setTimeout(() => {
      const qrCodeEl = document.getElementById('qrCode')
      const barcodeEl = document.getElementById('barcode')
      console.log('[PrintLabel] 📦 二维码容器:', qrCodeEl)
      console.log('[PrintLabel] 📦 二维码SVG:', qrCodeEl?.querySelector('svg'))
      console.log('[PrintLabel] 📦 条形码容器:', barcodeEl)
      console.log('[PrintLabel] 📦 条形码SVG:', barcodeEl?.querySelector('svg'))
      
      // 移除条形码SVG中的所有文本元素
      if (barcodeEl) {
        const barcodeSvg = barcodeEl.querySelector('svg')
        if (barcodeSvg) {
          // 查找并移除所有text元素
          const textElements = barcodeSvg.querySelectorAll('text')
          textElements.forEach((textEl) => {
            textEl.remove()
          })
          // 查找并移除所有带有文本的tspan元素
          const tspanElements = barcodeSvg.querySelectorAll('tspan')
          tspanElements.forEach((tspanEl) => {
            tspanEl.remove()
          })
          console.log('[PrintLabel] ✅ 已移除条形码中的文本元素，共移除', textElements.length + tspanElements.length, '个')
        }
      }
    }, 1000)
    console.log('[PrintLabel] =================================')
  }, [packageNo, warehouse, packageIndex, totalPackages])
  
  return (
    <div
      style={{
        width: '800px',
        height: '800px',
        background: 'white',
        padding: '24px 32px',
        border: '1px solid #000',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxSizing: 'border-box',
        fontFamily: 'Arial, "Microsoft YaHei", sans-serif'
      }}
    >
      {/* 头部区域：仓库名称、标签、二维码 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px'
        }}
      >
        <div style={{ flex: 1 }}>
          {/* 仓库名称 */}
          <div
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              marginBottom: '8px',
              lineHeight: 1.2
            }}
          >
            {warehouse}
          </div>
          {/* 标签：JIT和加急，黑底白字，中间有竖线分隔 */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginBottom: '16px',
              border: '1px solid #000'
            }}
          >
            {isJIT && (
              <span
                style={{
                  background: '#000',
                  color: '#fff',
                  padding: '6px 12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  display: 'inline-block'
                }}
              >
                JIT
              </span>
            )}
            {/* 竖线分隔符 */}
            {isJIT && isUrgent && (
              <div
                style={{
                  width: '1px',
                  height: '100%',
                  background: '#000',
                  display: 'inline-block'
                }}
              />
            )}
            {isUrgent && (
              <span
                style={{
                  background: '#000',
                  color: '#fff',
                  padding: '6px 12px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  display: 'inline-block'
                }}
              >
                加急
              </span>
            )}
          </div>
        </div>
        {/* 二维码容器 */}
        <div
          id="qrCode"
          style={{
            width: '144px',
            height: '144px',
            border: '1px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'white',
            padding: '8px',
            boxSizing: 'border-box'
          }}
        >
          {packageNo ? (
            <QRCode
              value={String(packageNo)}
              size={128}
              level="M"
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div style={{ fontSize: '12px', color: '#999' }}>无包裹号</div>
          )}
        </div>
      </div>

      {/* 店铺信息 */}
      <div
        style={{
          fontSize: '20px',
          fontWeight: 400,
          marginBottom: '8px'
        }}
      >
        {shopName}
      </div>

      {/* 打印时间 */}
      <div
        style={{
          fontSize: '18px',
          color: '#333',
          marginBottom: '12px'
        }}
      >
        {printTime}
      </div>

      {/* 产品信息 */}
      <div style={{ marginBottom: '16px' }}>
        {/* 产品名称 - 字体较大且粗 */}
        <div
          style={{
            fontSize: '22px',
            fontWeight: 'bold',
            lineHeight: 1.3,
            marginBottom: '16px',
            wordWrap: 'break-word'
          }}
        >
          {productName}
        </div>
        {/* SKU信息 - 左侧有小图标和编号，右侧显示数量 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}
          >
            {/* 小图标（带"小"字） */}
            <div
              style={{
                width: '24px',
                height: '24px',
                border: '1px solid #000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 'bold',
                flexShrink: 0,
                marginTop: '2px'
              }}
            >
              小
            </div>
            {/* 编号信息 */}
            <div
              style={{
                fontSize: '20px',
                fontWeight: 'bold',
                lineHeight: 1.4
              }}
            >
              <div style={{ marginBottom: '4px' }}>SKC{skcId}</div>
              <div>SKU货号{sku}</div>
            </div>
          </div>
          {/* 数量 - 右侧显示 */}
          <div
            style={{
              fontSize: '20px',
              fontWeight: 400,
              color: '#000',
              alignSelf: 'flex-end'
            }}
          >
            {quantity}件
          </div>
        </div>
      </div>

      {/* 包裹信息 - 包裹号和总数在同一行 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 400,
            color: '#333'
          }}
        >
          {packageNo}
        </div>
        <div
          style={{
            fontSize: '18px',
            color: '#333'
          }}
        >
          第{packageIndex}包 (共{totalPackages}包)
        </div>
      </div>

      {/* 条形码容器 - 不显示中间文字内容 */}
      <div
        id="barcode"
        style={{
          width: '100%',
          height: '64px',
          border: '1px solid #000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
          background: 'white',
          padding: '8px 0',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {packageNo ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}
          >
            <Barcode
              value={String(packageNo)}
              format="CODE128"
              width={1.5}
              height={50}
              displayValue={false}
              background="#FFFFFF"
              lineColor="#000000"
              margin={0}
              renderer="svg"
            />
            {/* 使用CSS隐藏条形码SVG中的任何文本元素 */}
            <style>
              {`
                #barcode svg text {
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                  font-size: 0 !important;
                }
                #barcode svg .barcode-text {
                  display: none !important;
                }
              `}
            </style>
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#999' }}>无包裹号</div>
        )}
      </div>

      {/* 配送信息 */}
      <div
        style={{
          fontSize: '18px',
          color: '#333',
          lineHeight: 1.4
        }}
      >
        {deliveryMethod}
        {driverName && ` · 司机${driverName}`}
        {driverPhone && ` · 手机号:${driverPhone}`}
      </div>
    </div>
  )
}
