# PDF Converter

一个纯本地、无需后端的 PDF 转换工具。支持 PDF 转图片、图片转 PDF，所有处理都在浏览器中完成，文件永远不会离开你的设备。

[English](./README.en.md)

## 特色

- 🔒 **纯本地处理** — 没有后端服务器，所有转换在浏览器中完成，文件不上传到任何地方
- 🛡️ **隐私优先** — 你的文件永远不会离开设备，适合处理敏感文档
- ⚡ **简单安全** — 无需注册、无需登录、无上传大小限制，打开即用
- 🎯 **零依赖部署** — 构建后只是一组静态文件，可托管在任意静态服务器或直接本地打开

## 功能介绍

### PDF 转图片

将 PDF 的每一页转换为图片，支持丰富的输出控制：

- **输出格式**：Auto（自动判断）、PNG、JPG
- **DPI 分辨率**：Original（原始）、72 / 150 / 300 / 600 DPI
- **质量控制**：JPG 模式下可选择“原始质量”或自定义压缩比例
- **逐页预览**：转换后生成缩略图预览
- **下载方式**：单页下载，或一键打包为 ZIP 下载全部
- **智能格式识别**：自动分析页面内容，判断适合的输出格式

### 图片转 PDF

将一张或多张图片转换为 PDF，支持排版与输出控制：

- **支持格式**：PNG、JPG、BMP、WebP、AVIF
- **页面尺寸**：A4、A3、Letter、Fit to Image（贴合图片）
- **页面方向**：Auto（自动）、Portrait、Landscape
- **页边距**：0–40 mm 可调
- **输出模式**：
  - 合并为单个 PDF（所有图片作为同一文件的页面）
  - 每张图片一个独立 PDF
- **排序**：拖拽调整图片顺序
- **预览**：转换前可预览每页排版效果
- **下载方式**：单个下载，或一键打包为 ZIP 下载全部
- **按需生成**：PDF 仅在下载时生成，节省资源

## 技术框架

| 类别 | 技术 |
| --- | --- |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| 样式 | Tailwind CSS |
| PDF 生成 | pdf-lib |
| PDF 渲染 | pdfjs-dist |
| 打包下载 | JSZip + file-saver |
| 图标 | lucide-react |
| 测试 | Vitest + Testing Library |

### 特点

- **纯前端架构**：无后端、无 API、无数据库，构建产物为静态资源
- **Web Worker 渲染**：PDF 解析在 Worker 中进行，不阻塞 UI
- **懒生成策略**：图片转 PDF 时仅生成预览，PDF 在用户点击下载时才真正生成，避免不必要的计算
- **资源管理**：使用 `URL.revokeObjectURL` 及时释放内存，支持一键清理
- **类型安全**：全量 TypeScript，配合 `tsc --noEmit` 类型检查

## 安装

### 环境要求

- Node.js 18+
- npm（或 pnpm / yarn）

### 步骤

```bash
# 1. 克隆仓库
git clone <repo-url>
cd vibe_pdf_tool

# 2. 安装依赖
npm install
```

## 使用

### 开发

```bash
# 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

### 构建与预览

```bash
# 构建生产版本到 dist/
npm run build

# 本地预览构建产物
npm run preview
```

### 静态部署

构建完成后，`dist/` 目录即为可部署的静态站点。可使用任意静态服务器托管，以下提供两种本地预览方案，按需选择：

#### 方案一：miniserve（默认，项目内置脚本）

[miniserve](https://github.com/svenstaro/miniserve) 是一个轻量、零配置的静态文件服务器。项目已内置对应脚本，但需先安装 miniserve 本体：

```bash
# 安装 miniserve（任选其一）
cargo install miniserve      # 通过 Rust 工具链
brew install miniserve       # macOS 通过 Homebrew

# 启动静态服务器（http://127.0.0.1:8081）
npm run static

# 停止静态服务器
npm run stop
```

#### 方案二：npx serve（无需预装）

[serve](https://github.com/vercel/serve) 通过 npx 直接运行，无需全局安装，适合快速预览：

```bash
# 临时启动静态服务器（默认 http://localhost:3000）
npx serve dist
```

#### 托管平台

也可部署到任意静态托管平台，例如：

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Nginx / Apache

> 由于是纯静态站点，无需配置后端或环境变量。

### 其他命令

```bash
# 代码检查
npm run lint

# 类型检查
npm run typecheck

# 运行测试
npm run test

# 测试监听模式
npm run test:watch
```

## 项目结构

```
vibe_pdf_tool/
├── src/
│   ├── components/
│   │   ├── Dropzone.tsx          # 文件拖拽上传组件
│   │   ├── PdfToImagePanel.tsx   # PDF 转图片面板
│   │   └── ImageToPdfPanel.tsx   # 图片转 PDF 面板
│   ├── lib/
│   │   ├── pdfToImage.ts         # PDF 转图片核心逻辑
│   │   ├── imageToPdf.ts         # 图片转 PDF 核心逻辑
│   │   └── zipUtils.ts           # ZIP 打包工具
│   ├── test/
│   │   └── setup.ts              # 测试环境配置
│   ├── App.tsx                   # 应用入口与布局
│   ├── main.tsx
│   └── index.css
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## 隐私说明

本工具**不存在后端服务器**。所有文件读取、PDF 解析、图片渲染、PDF 生成、打包下载等操作均在你本地的浏览器中完成。

- 文件不会上传到任何服务器
- 不收集任何用户数据
- 不使用 Cookie 或追踪脚本
- 断网状态下仍可正常使用（首次加载页面后）

## 许可证

MIT License

Copyright (c) 2026 Hubert Liu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
