# Bài 1 — Setup Vite + React 19 + TypeScript

> **Thời lượng**: 30-45 phút.
> **Mục tiêu**: Tạo project Vite với template react-ts, chạy được dev server, hiểu cấu trúc file mặc định + tự nhận dạng pattern QLVB sẽ áp dụng ở bài sau.
> **Map QLVB**: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`.

---

## 0. Bạn cần có trước

### Node.js 18+ (khuyến nghị 20+)

Verify trong PowerShell:

```powershell
node --version    # phải >= 18.0.0, lý tưởng 20.x trở lên
npm --version     # >= 9.0.0
```

Nếu chưa có Node: tải từ https://nodejs.org/ → bản LTS (20.x), MSI installer cho Windows.

### VS Code extensions khuyến nghị

- **ES7+ React/Redux/React-Native snippets** (`dsznajder.es7-react-js-snippets`) — snippet `rfc` tạo functional component
- **Prettier - Code formatter** (`esbenp.prettier-vscode`)
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Auto Rename Tag** (`formulahendry.auto-rename-tag`)

---

## 1. Tạo project Vite

Trong PowerShell, vào folder `y-frontend-demo/`:

```powershell
cd y-frontend-demo
npm create vite@latest task-app -- --template react-ts
```

### Giải thích lệnh

| Phần | Ý nghĩa |
|---|---|
| `npm create vite@latest` | Chạy package CLI `create-vite` mới nhất. `create-*` là convention npm: `npm create X` ≡ `npm exec create-X`. |
| `task-app` | Tên folder project sẽ tạo |
| `--` | Ngăn cách argument của `npm create` và argument của CLI bên trong |
| `--template react-ts` | Template "React + TypeScript". Có sẵn các template khác: `react`, `react-swc-ts`, `vue-ts`, `svelte`, v.v. |

→ Sau khi chạy, folder `y-frontend-demo/task-app/` xuất hiện với cấu trúc:

```
task-app/
├── public/
│   └── vite.svg
├── src/
│   ├── assets/
│   │   └── react.svg
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## 2. Cài dependencies

```powershell
cd task-app
npm install
```

→ Tải `node_modules/` (~200MB). Lần đầu hơi lâu, ~30-60 giây.

### Kiểm tra `package.json`

Mở `package.json`, sẽ thấy:

```json
{
  "name": "task-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.x.x",
    "react-dom": "^19.x.x"
  },
  "devDependencies": {
    "@types/react": "^19.x.x",
    "@types/react-dom": "^19.x.x",
    "@vitejs/plugin-react": "^4.x.x",
    "eslint": "^9.x.x",
    "typescript": "~5.x.x",
    "vite": "^5.x.x"
    // ... vài cái khác
  }
}
```

### Giải thích từng field quan trọng

| Field | Ý nghĩa |
|---|---|
| `"private": true` | Không cho `npm publish` accident |
| `"type": "module"` | File `.js` mặc định là ES module (`import` thay vì `require`). Tương đương `"esnext"` setting cũ. |
| `"scripts.dev"` | `npm run dev` → chạy Vite dev server (HMR, port 5173) |
| `"scripts.build"` | `tsc -b` (type-check) → `vite build` (bundle production) |
| `"scripts.lint"` | `eslint .` chạy lint toàn project |
| `dependencies` | Package cần ở **runtime** (React) |
| `devDependencies` | Package chỉ cần khi **build/dev** (TypeScript, Vite, ESLint) |

---

## 3. Chạy thử dev server

```powershell
npm run dev
```

### Output kỳ vọng

```
  VITE v5.x.x  ready in 350 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Mở browser `http://localhost:5173/` → thấy trang Vite + React mặc định với logo Vite, React, counter button.

### Test Hot Module Reload (HMR)

Giữ browser mở, mở `src/App.tsx`, sửa text `count is {count}` thành `count is {count} 🎉`, **save** (Ctrl+S).

→ Browser tự refresh trong < 100ms, giữ nguyên `count` state. Đây là **HMR** — sửa code không mất state, khác hẳn full reload.

Dừng dev server: Ctrl+C trong terminal.

---

## 4. Đọc hiểu code mặc định

### 4.1. `index.html` — entrypoint

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Điểm cần nhớ:**

- Vite KHÔNG cần `webpack.config.js`. `index.html` là entry — Vite scan `<script type="module" src="...">` và bundle từ đó.
- `<div id="root">` là chỗ React mount app. Mọi UI đều render vào đây.
- Path `/src/main.tsx` bắt đầu bằng `/` — đường dẫn từ root project, không phải tương đối.

### 4.2. `src/main.tsx` — React entry

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

**Giải thích từng dòng:**

```tsx
import { StrictMode } from 'react'
```
- `StrictMode` là component đặc biệt của React. Trong dev mode, nó render component 2 lần để phát hiện side effect không pure, deprecated API. Production thì chỉ render 1 lần.

```tsx
import { createRoot } from 'react-dom/client'
```
- React 18+ dùng `createRoot` (Concurrent Mode). React 17 cũ dùng `ReactDOM.render` — đã deprecated.

```tsx
import './index.css'
```
- Import CSS file — Vite sẽ tự inject CSS vào `<head>`. Khác với JS-only bundler cũ phải dùng plugin.

```tsx
import App from './App.tsx'
```
- Import default export. File extension `.tsx` thường KHÔNG cần ghi (Vite auto-resolve), nhưng template default ghi rõ. **TS strict** muốn ghi rõ extension cho ESM compliance.

```tsx
createRoot(document.getElementById('root')!).render(
```
- `document.getElementById('root')` trả `HTMLElement | null` — vì element có thể không tồn tại.
- Dấu `!` cuối = **non-null assertion** của TS: "tao chắc chắn cái này không null, đừng cảnh báo". Dùng khi developer chắc chắn (như case này — vì có `<div id="root">` trong HTML).
- `createRoot(...).render(<JSX>)` — gắn root vào DOM, render component.

```tsx
<StrictMode>
  <App />
</StrictMode>
```
- JSX — syntax sugar cho `React.createElement(StrictMode, null, React.createElement(App))`.
- `<App />` self-closing vì không có children.

### 4.3. `src/App.tsx` — component đầu tiên

```tsx
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
```

**Điểm cần hiểu:**

- `function App()` — functional component, return JSX. Tương đương `class App extends React.Component` (style cũ, không dùng nữa).
- `useState(0)` — React hook quản lý state. Trả về `[currentValue, setterFunction]`.
- `<>...</>` — **Fragment**, gom nhiều element mà không tạo extra DOM node. Tương đương `<React.Fragment>...</React.Fragment>`.
- `onClick={() => setCount(...)}` — gán handler. JSX dùng `{}` để nhúng JS expression.
- `setCount((count) => count + 1)` — **functional updater**: nhận state hiện tại, return state mới. An toàn hơn `setCount(count + 1)` khi có nhiều update liên tiếp (closure trap).
- `export default App` — default export. Bài sau ta sẽ ưa dùng **named export** vì refactor dễ hơn.

---

## 5. Thay App.tsx thành "Hello task-app"

Để bắt đầu sạch, xóa nội dung mặc định, viết lại App.tsx tối giản:

### 5.1. Xóa file không cần

```powershell
Remove-Item src/App.css
Remove-Item src/assets/react.svg
```

(Giữ `src/index.css` — bài 2 sẽ dùng.)

### 5.2. Viết lại `src/App.tsx`

```tsx
function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Task App</h1>
      <p>Mini app học pattern QLVB. Bài 1 — Setup xong.</p>
    </div>
  )
}

export default App
```

### Giải thích

- Bỏ `useState`, `import logo` — chưa cần.
- `style={{ padding: 24, fontFamily: '...' }}` — **inline style** JSX. Khác HTML thuần:
  - JSX: object JS, key camelCase (`fontFamily`), value số → đơn vị `px` mặc định
  - HTML: chuỗi `style="padding: 24px; font-family: ..."`
- `padding: 24` = `padding: '24px'`. Một số property không có đơn vị mặc định (`zIndex`, `opacity`...).

### 5.3. Cập nhật `src/index.css`

Mở `src/index.css`, **xóa toàn bộ** content mặc định (có sẵn dark theme, CSS custom properties phức tạp), thay bằng:

```css
:root {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  color-scheme: light dark;
}

body {
  margin: 0;
  min-height: 100vh;
}

a {
  color: #1976d2;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
```

**Lý do**: bài 2 sẽ dùng MUI ThemeProvider, không cần CSS custom properties phức tạp.

### 5.4. Chạy lại

```powershell
npm run dev
```

→ Browser refresh, thấy:

```
Task App

Mini app học pattern QLVB. Bài 1 — Setup xong.
```

---

## 6. Tìm hiểu thêm các file config

### 6.1. `tsconfig.json` — TypeScript

Vite generate sẵn 3 tsconfig:
- `tsconfig.json` — root, refer 2 file dưới
- `tsconfig.app.json` — config cho code trong `src/`
- `tsconfig.node.json` — config cho `vite.config.ts`, `eslint.config.js` (chạy bằng Node, không phải browser)

Mở `tsconfig.app.json` xem các option quan trọng:

```json
{
  "compilerOptions": {
    "target": "ES2022",          // Compile xuống ES2022 syntax
    "module": "ESNext",           // Output ES modules
    "moduleResolution": "bundler",// Vite/bundler-style resolution
    "strict": true,               // Bật full strict mode (no implicit any, strictNullChecks, ...)
    "noUnusedLocals": true,       // Báo error nếu khai biến không dùng
    "noUnusedParameters": true,   // Báo error nếu function param không dùng
    "jsx": "react-jsx"            // JSX transform mới (React 17+), không cần `import React`
  }
}
```

QLVB cũng tương tự nhưng có thêm `"baseUrl": "."` + `"paths": { "@/*": ["src/*"] }` để dùng alias `@/components/ui`. Bài 2 ta sẽ thêm.

### 6.2. `vite.config.ts` — Vite

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

Đơn giản. Bài 2 sẽ thêm path alias `@`.

### 6.3. `eslint.config.js`

ESLint v9 dùng **flat config** (file `eslint.config.js`) thay cho `.eslintrc.json` cũ. Có sẵn rule cho React + TS, không cần đụng tới bây giờ.

---

## 7. Checkpoint Bài 1

- [ ] `node --version` ≥ 18, `npm --version` ≥ 9
- [ ] Folder `y-frontend-demo/task-app/` tồn tại với `src/`, `package.json`, `vite.config.ts`
- [ ] `npm install` chạy không lỗi, có `node_modules/`
- [ ] `npm run dev` start được, browser mở `http://localhost:5173/` thấy "Task App"
- [ ] Sửa text trong `App.tsx`, Ctrl+S → browser auto-refresh (HMR work)
- [ ] Mở `App.tsx` trong VS Code, KHÔNG có gạch đỏ TypeScript

---

## 8. Câu hỏi tự kiểm tra

1. Tại sao Vite không cần `webpack.config.js` mà chỉ cần `index.html`?
2. `dependencies` vs `devDependencies` khác nhau chỗ nào? React thuộc nhóm nào, tại sao?
3. Dấu `!` trong `document.getElementById('root')!` có ý nghĩa gì? Bỏ đi thì lỗi gì?
4. `<StrictMode>` làm gì trong dev mode mà không làm trong production?
5. `setCount((count) => count + 1)` khác `setCount(count + 1)` ở đâu? Khi nào nên dùng functional updater?

**Đáp án:**

1. Vite dùng **ESM native** trong dev — browser tự import từng file `.js`/`.ts` qua `<script type="module">`. Không cần bundle. Production thì bundle bằng Rollup. `index.html` là entry vì Vite scan `<script src="...">` để biết phải transform file nào.
2. `dependencies` cần ở **runtime** (khi user chạy app). `devDependencies` chỉ cần khi **build/dev**. React là `dependencies` vì bundle vào output cuối. TypeScript là `devDependencies` vì sau khi compile thành JS rồi không cần nữa.
3. `!` = **non-null assertion** của TS — bảo TS "tin tao, không null". Bỏ đi → TS báo `Object is possibly null` vì `getElementById` có thể trả null. Có thể fix sạch hơn bằng cách check: `const el = document.getElementById('root'); if (el) createRoot(el).render(...)`. Nhưng case này biết chắc chắn có `<div id="root">` nên dùng `!` cho ngắn.
4. `<StrictMode>` trong dev mode: render component 2 lần để detect impure render (vd dùng `Math.random()` trong render → output khác nhau 2 lần). Cảnh báo deprecated lifecycle. Production tự động skip → không có overhead.
5. `setCount(count + 1)` đọc giá trị `count` từ **closure** lúc render. Nếu gọi 3 lần liên tiếp `setCount(count+1); setCount(count+1); setCount(count+1);` → cả 3 đều đọc `count` cũ → kết quả chỉ tăng 1.
`setCount((c) => c + 1)` nhận **giá trị mới nhất** từ React → gọi 3 lần → tăng 3.
Khi nào dùng: khi state mới phụ thuộc state cũ + có khả năng nhiều update liên tiếp (event handler async, animation).

---

## 9. So sánh với Go demo Bài 1

| Khía cạnh | Go (`y-golang-demo` Bài 1) | FE (Bài này) |
|---|---|---|
| Lệnh init | `go mod init task-svc` | `npm create vite@latest task-app -- --template react-ts` |
| File khai báo project | `go.mod` | `package.json` |
| Lockfile | `go.sum` | `package-lock.json` |
| Dependency cache | `~/go/pkg/mod/` (global) | `node_modules/` (per-project) |
| Lệnh chạy dev | `go run ./cmd/server` | `npm run dev` |
| Entry point | `func main()` trong `package main` | `<script src="/src/main.tsx">` trong `index.html` |
| Hot reload | KHÔNG (phải restart) | CÓ (HMR — sửa code, browser tự update) |

→ FE có HMR là lợi thế lớn khi develop UI. Đổi 1 chữ → 100ms thấy ngay.

---

## 10. Khi nào sang bài 2?

Khi 6 checkbox phía trên đều tick. Bài 2 sẽ làm:

- Cài MUI 7 (`@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`)
- Setup ThemeProvider với theme tokens (color palette, typography, spacing)
- Thay layout dùng `<Box>`, `<Container>`, `<Typography>` của MUI
- Hiểu prop `sx` — cách viết style của MUI 7 (khác `className`, khác inline `style`)
- Thêm path alias `@/...` trong `vite.config.ts` + `tsconfig.app.json`

Báo tôi "xong bài 1" để tôi viết tiếp `bai-02-mui-theme-va-layout.md`.

---

**Bài 1 — phiên bản 2026-05-19.**
