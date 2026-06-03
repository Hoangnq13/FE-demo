# Bài 2 — MUI 7 + ThemeProvider + Layout với `sx`

> **Thời lượng**: 60-90 phút.
> **Mục tiêu**: Cài MUI 7, hiểu `ThemeProvider` + design token, dùng `<Box>` / `<Container>` / `<Typography>` thay HTML thuần, thành thạo prop `sx`, và thêm path alias `@/...`.
> **Map QLVB**: `frontend/src/themes/`, `frontend/src/main.tsx` (chỗ wrap `ThemeProvider`), `frontend/vite.config.ts` (alias).

---

## 0. Tại sao là MUI 7?

Có vài lựa chọn UI library cho React: **MUI**, **Ant Design**, **Chakra UI**, **shadcn/ui**, **Mantine**.

QLVB dùng **MUI 7** vì:

- Component **đầy đủ** nhất (DataGrid, DatePicker, Autocomplete...) — không phải tự build.
- **Theming system** mạnh: 1 file `theme.ts` áp dụng toàn app (palette, typography, spacing, breakpoints, component override).
- **`sx` prop** — viết style ngay tại chỗ nhưng vẫn dùng được theme token (`p: 2` = `padding: theme.spacing(2)`).
- **TypeScript first class** — autocomplete được mọi prop, theme token.
- Doc tốt, community lớn.

Nhược điểm: bundle khá nặng (~300KB gzip cả app). Vì là internal tool QLVB nên chấp nhận được.

→ **Mục tiêu bài 2**: setup MUI giống QLVB, để bài sau code component nào cũng có sẵn theme & sx.

---

## 1. Cài MUI 7

Trong `task-app/`:

```powershell
npm install @mui/material @emotion/react @emotion/styled @mui/icons-material
```

### Giải thích từng package

| Package | Vai trò |
|---|---|
| `@mui/material` | Bộ component chính: `Button`, `Box`, `TextField`, `Table`, ... |
| `@emotion/react` | **CSS-in-JS engine** MUI dùng để render style. Bắt buộc peer dep. |
| `@emotion/styled` | API `styled(...)` để tạo styled component khi cần. Bắt buộc peer dep. |
| `@mui/icons-material` | ~2000 Material icon dạng React component: `<DeleteIcon />`, `<EditIcon />`, ... |

> **Lưu ý**: MUI 7 vẫn dùng `@emotion` mặc định. Có option khác (styled-components) nhưng QLVB dùng default — ta theo cùng.

Đợi cài xong (~20-30 giây). Mở `package.json` confirm `"dependencies"` có 4 package mới.

---

## 2. Trước khi setup theme — hiểu 3 layer style của MUI

Đây là chỗ nhiều người mới bị rối. MUI cho **3 cách viết style**, mỗi cách phục vụ case khác nhau:

### 2.1. Prop `sx` — chính (dùng 90% thời gian)

```tsx
<Box sx={{ p: 2, bgcolor: 'primary.main', borderRadius: 1 }}>
  Hello
</Box>
```

- Object style **inline ngay tại component**.
- Key dùng **theme token shorthand**: `p` = padding, `m` = margin, `bgcolor` = backgroundColor, ...
- Value **số = bội số của theme.spacing** (`p: 2` → `padding: 16px` nếu spacing = 8).
- Value **chuỗi `'primary.main'`** → MUI auto resolve thành `theme.palette.primary.main`.
- Hỗ trợ **responsive**: `p: { xs: 1, md: 3 }` — mobile 1, desktop 3.

### 2.2. `styled(...)` — khi cần component tái sử dụng nhiều chỗ

```tsx
import { styled } from '@mui/material/styles'

const StyledCard = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
}))
```

- Sinh ra **CSS class thật**, tốt cho component dùng nhiều lần (perf hơn `sx`).
- Nhưng verbose hơn → QLVB chỉ dùng cho ~5 component, còn lại `sx`.

### 2.3. `className` + CSS file — không khuyến khích

```tsx
<div className="my-card">...</div>
```

- Mất theme integration, dễ orphan style.
- Chỉ dùng cho **global reset** (như `index.css` bài 1) hoặc trường hợp đặc biệt.

→ **Quy tắc QLVB**: ưu tiên `sx` → cần tái sử dụng nhiều thì `styled` → tuyệt đối tránh CSS file riêng.

---

## 3. Tạo `themes/` folder

Mirror QLVB:

```
src/
├── themes/
│   ├── index.ts       # export theme
│   ├── palette.ts     # color tokens
│   └── typography.ts  # font tokens
```

### 3.1. Tạo `src/themes/palette.ts`

```ts
import type { PaletteOptions } from '@mui/material/styles'

export const palette: PaletteOptions = {
  mode: 'light',
  primary: {
    main: '#1976d2',
    light: '#42a5f5',
    dark: '#1565c0',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#9c27b0',
    light: '#ba68c8',
    dark: '#7b1fa2',
    contrastText: '#ffffff',
  },
  success: {
    main: '#2e7d32',
    light: '#4caf50',
    dark: '#1b5e20',
    contrastText: '#ffffff',
  },
  warning: {
    main: '#ed6c02',
    light: '#ff9800',
    dark: '#e65100',
    contrastText: '#ffffff',
  },
  error: {
    main: '#d32f2f',
    light: '#ef5350',
    dark: '#c62828',
    contrastText: '#ffffff',
  },
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
  },
  text: {
    primary: '#212121',
    secondary: '#616161',
  },
}
```

**Giải thích:**

- `PaletteOptions` — type của MUI cho palette config. Import bằng `import type` vì chỉ dùng type, không runtime.
- Mỗi color có 4 variant: `main` (mặc định), `light` (hover state), `dark` (active), `contrastText` (text trên nền màu đó).
- `mode: 'light'` — light theme. QLVB chỉ có light, không support dark (đỡ phức tạp).
- Color `#1976d2` (primary blue) chính là MUI default — ta dùng để giống Material guidelines.
- `background.default` (xám nhạt) — nền body. `background.paper` (trắng) — nền card/dialog.

→ Khi viết `<Box sx={{ color: 'primary.main' }}>`, MUI sẽ tra `theme.palette.primary.main` → `#1976d2`.

### 3.2. Tạo `src/themes/typography.ts`

```ts
import type { TypographyVariantsOptions } from '@mui/material/styles'

export const typography: TypographyVariantsOptions = {
  fontFamily: [
    '"Inter"',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
  ].join(','),
  h1: { fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2 },
  h2: { fontSize: '2rem', fontWeight: 700, lineHeight: 1.3 },
  h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },
  h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
  h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.5 },
  h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
  body1: { fontSize: '0.875rem', lineHeight: 1.5 },
  body2: { fontSize: '0.8125rem', lineHeight: 1.5 },
  button: { textTransform: 'none', fontWeight: 500 },
}
```

**Giải thích:**

- `fontFamily` — fallback chain. `"Inter"` ưu tiên đầu (nếu có), không có thì rơi xuống system font.
- `h1` → `h6`, `body1`, `body2`, `button` — các **variant** mà `<Typography variant="h1">` sẽ tra ra.
- `textTransform: 'none'` cho `button` — **quan trọng**. MUI mặc định viết hoa text button (`UPPERCASE`). QLVB ghét cái này → set `none`. Bạn cũng nên giữ.
- `lineHeight` — số (không có `px`/`em`) = bội số của font-size. `1.5` × `14px` = `21px`.
- `rem` thay `px` — scale theo root font-size, accessibility tốt hơn (user zoom được).

### 3.3. Tạo `src/themes/index.ts`

```ts
import { createTheme } from '@mui/material/styles'
import { palette } from './palette'
import { typography } from './typography'

export const theme = createTheme({
  palette,
  typography,
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          border: '1px solid #e0e0e0',
        },
      },
    },
  },
})
```

**Giải thích từng option:**

| Option | Ý nghĩa |
|---|---|
| `palette` | Color tokens (đã viết trên). |
| `typography` | Font tokens. |
| `shape.borderRadius: 8` | Mọi component MUI dùng `theme.shape.borderRadius` → 8px (bo góc đồng đều). |
| `spacing: 8` | Đơn vị spacing cơ bản. `sx={{ p: 2 }}` → `padding: 16px` (2 × 8). |
| `components.MuiButton.defaultProps` | **Mặc định** mọi `<Button>` có `disableElevation` (bỏ shadow). Không cần viết lại từng nơi. |
| `components.MuiButton.styleOverrides.root` | Override CSS của `Button.root` — bo góc 8px. |
| `components.MuiPaper.defaultProps.elevation: 0` | Paper mặc định **không có shadow**, dùng border thay. Flat look kiểu enterprise. |

→ Đây là sức mạnh của theme: 1 lần config, **toàn app** áp dụng. Không phải viết `borderRadius: 8` ở 50 chỗ.

---

## 4. Wrap app bằng `ThemeProvider`

Mở `src/main.tsx`, sửa thành:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from './themes'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

### Giải thích 2 thành phần mới

#### `<ThemeProvider theme={theme}>`

- Inject theme object vào **React Context**, mọi component MUI ở dưới đọc được.
- Phải wrap **toàn app**, không thì component MUI sẽ dùng theme default → màu lệch.

#### `<CssBaseline />`

- Component "vô hình" — chỉ inject CSS reset toàn cục:
  - Bỏ `margin` mặc định của `<body>`.
  - `box-sizing: border-box` cho mọi element (padding + border tính vào width, dễ tính layout hơn).
  - Set font family, color từ theme.
- Tương đương `normalize.css` nhưng MUI-aware.
- Đặt **NGAY SAU** `ThemeProvider`, **TRƯỚC** `<App />`.

---

## 5. Refactor `App.tsx` — dùng component MUI

```tsx
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import AddIcon from '@mui/icons-material/Add'

function App() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h3" sx={{ mb: 0.5 }}>
            Task App
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Mini app học pattern QLVB. Bài 2 — MUI + Theme.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}>
          Tạo task
        </Button>
      </Box>

      <Box
        sx={{
          p: 3,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        <Typography variant="h5" sx={{ mb: 1 }}>
          Chưa có task nào
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Nhấn "Tạo task" để bắt đầu. Danh sách task sẽ hiển thị ở bài 7.
        </Typography>
      </Box>
    </Container>
  )
}

export default App
```

### Giải thích từng phần

#### `<Container maxWidth="lg" sx={{ py: 4 }}>`

- **`Container`** — wrapper chuẩn của MUI, có max-width responsive + margin auto (canh giữa).
- `maxWidth="lg"` — `lg` = 1200px (theme breakpoint).
- `sx={{ py: 4 }}` — `py` shorthand cho `paddingY` (= `paddingTop` + `paddingBottom`). `4` × `8px` spacing = `32px`.

#### `<Box>` — generic `<div>` có superpower `sx`

- `Box` ≈ `<div>` nhưng nhận prop `sx`. Là "Lego brick" của MUI.
- Dùng để **layout** (flex, grid, spacing) thay vì viết CSS riêng.

#### Object `sx` của outer Box

```tsx
sx={{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  mb: 3,
}}
```

- `display: 'flex'` — bật flexbox.
- `justifyContent: 'space-between'` — title bên trái, button bên phải, đẩy nhau ra.
- `alignItems: 'center'` — canh giữa theo trục dọc.
- `mb: 3` — `marginBottom: 24px`.

#### `<Typography variant="h3">`

- Render `<h3>` HTML + apply style từ `theme.typography.h3` (đã config ở bước 3.2).
- Có thể đổi tag bằng prop `component`: `<Typography variant="h3" component="h1">` → style như h3 nhưng tag h1 (SEO).
- `color="text.secondary"` — shorthand cho `theme.palette.text.secondary`.

#### `<Button variant="contained" startIcon={<AddIcon />}>`

- `variant`: `contained` (nền màu), `outlined` (chỉ viền), `text` (chỉ chữ).
- `startIcon` — icon bên trái text. Có `endIcon` tương tự.
- `<AddIcon />` — icon Material "add" (dấu +).

#### Border dùng theme token

```tsx
border: '1px solid',
borderColor: 'divider',
```

- Mẹo MUI: viết `border: '1px solid'` (KHÔNG có color), rồi `borderColor` riêng để dùng token. Sạch hơn `border: '1px solid #e0e0e0'`.
- `'divider'` = `theme.palette.divider` — màu border chuẩn MUI.

---

## 6. Test layout

```powershell
npm run dev
```

→ Browser thấy:

- Header với title "Task App" + button "+ Tạo task" bên phải.
- Card trắng có border xám, chứa "Chưa có task nào".
- Nền xám nhạt (`background.default`).
- Font Inter / system font.

Thử tương tác button — chưa làm gì, nhưng có **ripple effect** (hiệu ứng sóng khi click). MUI built-in.

---

## 7. Thêm path alias `@/...`

QLVB dùng alias để import gọn: `import { Task } from '@/types/entities/task'` thay vì `'../../../types/entities/task'`.

Cần config 2 chỗ:

### 7.1. `vite.config.ts` — bảo Vite resolve `@`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Giải thích:**

- `path.resolve(__dirname, './src')` — absolute path tới folder `src/`.
- `'@': ...` — alias key. Vite gặp `import x from '@/foo'` → đổi thành `import x from '<absolute>/src/foo'`.
- `import path from 'node:path'` — prefix `node:` là convention ES module để báo đây là Node builtin (vs npm package cùng tên).

> **Có thể bị TS warning** ở `__dirname` vì là Node API. Nếu vậy đảm bảo `@types/node` có trong `devDependencies` (đã có sẵn ở project — kiểm tra `package.json`).

### 7.2. `tsconfig.app.json` — bảo TS hiểu alias

Mở file, thêm 2 dòng `baseUrl` + `paths` trong `compilerOptions`:

```jsonc
{
  "compilerOptions": {
    // ... các option cũ giữ nguyên
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

**Giải thích:**

- `baseUrl: "."` — gốc resolve, là folder chứa `tsconfig.app.json` (`task-app/`).
- `"paths": { "@/*": ["src/*"] }` — TS thấy import `@/foo/bar` → tra `src/foo/bar`. Phải match với Vite alias.
- ⚠️ **Hai chỗ phải đồng bộ**: Vite chỉ giúp khi **build/run**, TS chỉ giúp khi **type-check**. Khai cả 2 thì IDE autocomplete + runtime đều work.

### 7.3. Test alias

Sửa import trong `App.tsx`:

```tsx
import Box from '@mui/material/Box'   // ← package, vẫn dùng tên gốc
// ...
```

(Chưa có file `src/` nào để import, nhưng từ bài 3 trở đi sẽ dùng alias liên tục.)

Để confirm setup đúng, ta tạo 1 file test:

```powershell
New-Item -ItemType Directory -Path src/utils -Force
```

Tạo `src/utils/greeting.ts`:

```ts
export function greeting(name: string) {
  return `Xin chào, ${name}!`
}
```

Sửa `App.tsx` thêm import:

```tsx
import { greeting } from '@/utils/greeting'

// ... trong JSX, đâu đó:
<Typography variant="body2">{greeting('task-app')}</Typography>
```

→ Nếu hiển thị "Xin chào, task-app!" → alias work, cả VS Code không gạch đỏ → TS hiểu alias. Sau khi xong, bạn có thể xóa file `greeting.ts` và import test này — chỉ để verify.

---

## 8. Hiểu thêm về `sx` — bảng cheatsheet

Đây là bảng shorthand MUI quan trọng nhất, **gắn lên màn hình**:

### Spacing

| Shorthand | CSS đầy đủ |
|---|---|
| `m` | margin |
| `mt`, `mr`, `mb`, `ml` | margin-top/right/bottom/left |
| `mx` | margin-left + margin-right |
| `my` | margin-top + margin-bottom |
| `p`, `pt`, `pr`, `pb`, `pl`, `px`, `py` | tương tự cho padding |

Value: số → bội số `theme.spacing` (mặc định 8px). `m: 2` = `margin: 16px`.

### Color

| Shorthand | CSS |
|---|---|
| `color` | color |
| `bgcolor` | background-color |
| `borderColor` | border-color |

Value: string token (`'primary.main'`, `'text.secondary'`, `'divider'`) hoặc literal (`'#fff'`).

### Layout / Flex

| Prop | Ghi chú |
|---|---|
| `display` | `'flex'`, `'grid'`, `'block'`, ... |
| `flexDirection` | `'row'`, `'column'` |
| `justifyContent` | `'flex-start'`, `'center'`, `'space-between'`, ... |
| `alignItems` | tương tự |
| `gap` | spacing (bội số 8) |
| `flex` | `1`, `'1 1 auto'`, ... |

### Border / Shape

| Prop | Ghi chú |
|---|---|
| `border` | `'1px solid'` |
| `borderRadius` | bội số `theme.shape.borderRadius` (mặc định 8). `borderRadius: 1` = `8px`. |
| `boxShadow` | số `1`–`24` (theme.shadows[n]) hoặc string CSS. |

### Responsive

```tsx
sx={{
  p: { xs: 1, sm: 2, md: 3, lg: 4 },
  flexDirection: { xs: 'column', md: 'row' },
}}
```

Breakpoints: `xs` (0+), `sm` (600+), `md` (900+), `lg` (1200+), `xl` (1536+).

---

## 9. Sai lầm thường gặp (đọc kỹ!)

### 9.1. Quên `<ThemeProvider>` → component MUI render với theme default

Triệu chứng: primary color không phải xanh của mình, mà xanh MUI default. Hoặc font sai.
→ Verify `main.tsx` có wrap `ThemeProvider`.

### 9.2. Viết `sx={{ padding: 2 }}` thay vì `sx={{ p: 2 }}`

Cả 2 đều work nhưng:
- `padding: 2` — TS hiểu là CSS property → cần đơn vị (`'16px'`) → **không** tự multiply spacing.
- `p: 2` — MUI shorthand → multiply `theme.spacing` → `16px`.

→ Luôn dùng shorthand `p`/`m` khi muốn theme spacing.

### 9.3. Viết color literal thay token

```tsx
sx={{ color: '#1976d2' }}     // ❌ Hard-code, đổi theme là sai
sx={{ color: 'primary.main' }} // ✅ Auto theo theme
```

### 9.4. Import sai từ `@mui/material`

```tsx
import { Box, Container, Typography } from '@mui/material'  // ⚠️ Slow build
import Box from '@mui/material/Box'                          // ✅ Tree-shake tốt
```

MUI 7 đã cải thiện nhiều, nhưng QLVB và bài này đều dùng **direct import** từng file để build nhanh + bundle nhỏ hơn.

### 9.5. Mix CSS file + sx

Đừng viết `style.css` rồi `<Box className="my-card">`. Lý do:
- Mất theme integration (CSS file không biết `theme.palette`).
- Hai chỗ chỉnh style → khó maintain.

→ **Mọi style nội bộ component → `sx` hoặc `styled`**.

---

## 10. Checkpoint Bài 2

- [ ] `npm install @mui/material @emotion/react @emotion/styled @mui/icons-material` chạy không lỗi
- [ ] Folder `src/themes/` có 3 file: `index.ts`, `palette.ts`, `typography.ts`
- [ ] `main.tsx` wrap `<ThemeProvider theme={theme}>` + `<CssBaseline />`
- [ ] `App.tsx` dùng `<Container>`, `<Box>`, `<Typography>`, `<Button>` — KHÔNG còn `<div>`, `<h1>`, `<p>`, `style={{ ... }}`
- [ ] Nút "Tạo task" hiện ripple effect + có icon `+` bên trái
- [ ] Nền body xám nhạt, card trắng có border
- [ ] `vite.config.ts` có `resolve.alias`
- [ ] `tsconfig.app.json` có `baseUrl` + `paths`
- [ ] Tạo file test `@/utils/greeting.ts`, import work cả runtime (browser hiển thị) + IDE (no red squiggle)

---

## 11. Câu hỏi tự kiểm tra

1. Khác biệt giữa `<ThemeProvider>` và `<CssBaseline />`? Nếu bỏ một trong hai thì app sai cái gì?
2. `sx={{ p: 2 }}` cho ra padding bao nhiêu px? Lý do?
3. Tại sao MUI mặc định **viết hoa** text button, và ta đã override ở đâu để tắt?
4. Khi nào nên dùng `sx` vs `styled(...)` vs CSS file riêng?
5. Tại sao phải config alias `@` ở CẢ `vite.config.ts` VÀ `tsconfig.app.json`? Chỉ config 1 chỗ thì sao?
6. `<Button variant="contained">` vs `variant="outlined"` vs `variant="text"` — khác nhau visually thế nào?

**Đáp án:**

1. `ThemeProvider` inject **theme object** vào React Context để mọi component MUI con đọc được token (color, spacing, ...). `CssBaseline` chỉ inject **CSS reset toàn cục** (bỏ margin body, set box-sizing). Bỏ `ThemeProvider` → component MUI vẫn render nhưng dùng theme default → màu sai, spacing sai. Bỏ `CssBaseline` → body có margin mặc định của browser (~8px), font dùng Times New Roman.

2. `16px`. Vì `p: 2` = `padding: theme.spacing(2)` = `2 × 8` = `16` (đơn vị px được MUI thêm vào).

3. MUI mặc định set `textTransform: 'uppercase'` cho variant `button` của typography. Ta override trong `themes/typography.ts`: `button: { textTransform: 'none', fontWeight: 500 }`.

4. **`sx`**: style nội bộ component, dùng 1 lần, cần theme token — 90% case. **`styled`**: component tái sử dụng ≥3 nơi, cần performance (vì sx parse mỗi render, styled tạo class 1 lần). **CSS file**: global reset, override 3rd-party lib không có `sx`. Trong app ta sẽ KHÔNG dùng cái thứ 3.

5. Vite alias chỉ giúp **runtime** (Vite resolve import khi serve/build). TS alias chỉ giúp **type-check** (TS resolve để check kiểu). Bỏ Vite alias → `npm run dev` báo `Failed to resolve import "@/foo"`. Bỏ TS alias → app chạy được nhưng VS Code gạch đỏ + `npm run build` fail ở bước `tsc`. Phải khai cả 2.

6. `contained`: nền màu primary, chữ trắng — call-to-action chính (Save, Tạo). `outlined`: viền + chữ màu primary, nền trong suốt — action phụ (Cancel, Reset). `text`: chỉ chữ màu primary, không viền nền — action lightweight (link-like, "Xem thêm").

---

## 12. So sánh với QLVB thật

Mở `frontend/src/themes/` của QLVB:

| Khía cạnh | QLVB | Bài 2 |
|---|---|---|
| File chia | `palette.ts`, `typography.ts`, `components.ts`, `index.ts` | 3 file (gộp `components` vào `index.ts`) |
| Palette | có ~10 color custom (status doc: `draft`, `signed`, `archived`...) | 5 color chuẩn MUI |
| Typography | có thêm `subtitle1`, `subtitle2`, `caption`, `overline` | gộp đủ dùng |
| Component override | ~20 component (TextField, Table, Chip, ...) | 2 (Button, Paper) |
| Dark mode | KHÔNG (chỉ light) | KHÔNG |

→ Bài này là **subset 30%** QLVB theme — đủ cho task-app, không bị overwhelm.

---

## 13. Khi nào sang bài 3?

Khi 9 checkbox phía trên đều tick. Bài 3 sẽ làm:

- Định nghĩa **Task entity** trong `types/entities/task.ts` (id, title, description, status, due_date, ...)
- Tách type theo **5 tầng** kiểu QLVB: `entities/`, `api/`, `pages/`, `features/`, `store/`
- Hiểu **tại sao** phải tách (entity ổn định, request shape thay đổi theo BE, form data có field optional, ...)
- Định nghĩa `TaskStatus` enum + `ApiResponse<T>` generic

Báo tôi "xong bài 2" để tôi viết tiếp `bai-03-types-phan-tang.md`.

---

**Bài 2 — phiên bản 2026-05-28.**
