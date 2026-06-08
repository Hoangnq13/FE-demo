# Bài 10 — React Router + Layout + 404

> **Thời lượng**: ~75 phút.
> **Mục tiêu**: Cài `react-router-dom`, hiểu 2 cách dựng router v6 (`createBrowserRouter` + `RouterProvider` vs `<BrowserRouter>` + `<Routes>`), tạo `MainLayout` (AppBar + Container) bọc mọi trang, dựng route param `:id`, redirect `/` → `/tasks`, catch-all `*` → trang 404, và nối toàn bộ luồng để `useNavigate` / `useParams` (đã viết ở bài 7-9) **chạy thật**.
> **Map QLVB**: `frontend/src/router/AuthRouter.tsx` (file cấu hình route), `frontend/src/layouts/` (layout wrapper bọc các trang sau khi đăng nhập).

---

## 0. Bài 10 hoàn thiện cái gì còn dở?

Từ bài 7 tới bài 9, ta đã viết 3 trang:

| Trang | Đã dùng hook | Ghi chú khi đó |
|---|---|---|
| `TaskListPage` | `useNavigate()` để đi `/tasks/new`, `/tasks/:id` | "navigate chưa chạy — **cần bài 10**" |
| `TaskCreatePage` | `useNavigate()` để quay về `/tasks` sau khi tạo | "cần router — **bài 10**" |
| `TaskDetailPage` | `useParams()` lấy `id`, `useNavigate()` để quay lại / sau khi xóa | "`id` đang undefined vì chưa có route param — **bài 10**" |

Lý do các hook đó chưa chạy: **chúng phải nằm bên trong một Router context**. Không có `<RouterProvider>` (hoặc `<BrowserRouter>`) bọc app thì:

- `useNavigate()` ném lỗi `useNavigate() may be used only in the context of a <Router> component`.
- `useParams()` luôn trả object rỗng `{}` → `id` là `undefined`.
- `<Link>` không biết điều hướng đi đâu.

→ **Bài 10 này là mảnh ghép cuối của phần "navigation"**. Sau bài này: bấm 1 task trong list → mở đúng trang chi tiết theo `id`; tạo xong → tự về list; gõ URL bậy → ra trang 404. Mọi `navigate`/`useParams` viết ở bài 7-9 **bắt đầu hoạt động đúng**.

---

## 1. Cài `react-router-dom`

Trong `task-app/`:

```powershell
npm install react-router-dom
```

### Giải thích

| Package | Vai trò |
|---|---|
| `react-router-dom` | Thư viện routing chuẩn cho React web. Cung cấp `createBrowserRouter`, `RouterProvider`, `BrowserRouter`, `Routes`, `Route`, `Link`, `Navigate`, `Outlet`, và các hook `useNavigate`, `useParams`, `useLocation`. |

> **Lưu ý version**: bài này dùng **React Router v6** (API hiện đại với `createBrowserRouter`). QLVB cũng đang ở v6. Nếu bạn lỡ cài v5 thì API khác hẳn (`Switch` thay `Routes`, `component=` thay `element=`) — gỡ ra cài lại đúng v6: `npm install react-router-dom@6`.

Cài xong (~10 giây), mở `package.json` confirm `"dependencies"` có `react-router-dom`.

---

## 2. Hai cách dựng router v6 — chọn cái nào?

React Router v6 cho **2 phong cách** khai báo route. Phải hiểu cả hai để đọc code người khác, nhưng trong app này ta chọn **một** và đi nhất quán.

### 2.1. Kiểu cũ hơn: `<BrowserRouter>` + `<Routes>` + `<Route>` (JSX-based)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

<BrowserRouter>
  <Routes>
    <Route path="/" element={<Navigate to="/tasks" replace />} />
    <Route path="/tasks" element={<TaskListPage />} />
    <Route path="/tasks/new" element={<TaskCreatePage />} />
    <Route path="/tasks/:id" element={<TaskDetailPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>
</BrowserRouter>
```

- Route khai báo **bằng JSX** ngay trong cây component.
- Đơn giản, dễ nhìn cho app nhỏ. Vẫn được support đầy đủ ở v6.

### 2.2. Kiểu hiện đại (khuyến nghị): `createBrowserRouter` + `RouterProvider` (object-based)

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/tasks" replace /> },
  { path: '/tasks', element: <TaskListPage /> },
  // ...
])

<RouterProvider router={router} />
```

- Route khai báo **bằng mảng object** (data structure), tách khỏi cây JSX.
- Mở khoá các data API mới của v6.4+: `loader` (load data trước khi render route), `action` (xử lý form submit), `errorElement` (error boundary theo route). App này chưa dùng `loader`/`action`, nhưng dựng theo kiểu này để **về sau scale lên không phải viết lại**.

### So sánh

| Tiêu chí | `<BrowserRouter>` + `<Routes>` | `createBrowserRouter` + `RouterProvider` |
|---|---|---|
| Khai báo | JSX trong cây component | Mảng object riêng |
| `loader` / `action` data API | ❌ Không hỗ trợ | ✅ Hỗ trợ |
| `errorElement` theo route | ❌ | ✅ |
| Tách config khỏi UI | Khó hơn | Dễ (config là 1 biến) |
| Khuyến nghị của React Router team (v6.4+) | Legacy-friendly | **Cách đi mới** |

→ **Quyết định của app này**: dùng **`createBrowserRouter` + `RouterProvider`**. Hiện đại, dễ mở rộng `loader` khi nối BE thật ở bài 11, và config route nằm gọn trong `router/AppRouter.tsx`.

---

## 3. Layout wrapper — `MainLayout` bọc mọi trang

Mọi trang đều cần khung chung: thanh AppBar trên cùng (có link "Task App" về `/tasks`) và một `Container` canh giữa nội dung. Thay vì lặp lại ở từng page, ta gói vào **một component layout**.

### 3.1. Tạo `src/components/layout/MainLayout.tsx`

```tsx
import type { ReactNode } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'
import { Link as RouterLink } from 'react-router-dom'

export function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/tasks"
            sx={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}
          >
            Task App
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: 3 }}>{children}</Container>
    </Box>
  )
}
```

### Giải thích từng phần

- **`children: ReactNode`** — layout nhận nội dung trang qua prop `children`. Đây là pattern "layout wrapper": layout vẽ khung, trang vẽ ruột.
- **`<Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>`** — nền xám nhạt phủ toàn màn hình (token `background.default` đã set ở bài 2).
- **`<AppBar position="static">`** — thanh trên cùng. `position="static"` = cuộn theo trang (không dính cứng). `color="primary"` = nền xanh primary. `elevation={0}` = phẳng, không đổ bóng (đồng bộ phong cách enterprise bài 2).
- **`<Toolbar>`** — container chuẩn bên trong AppBar, lo padding + chiều cao chuẩn Material.
- **`<Typography component={RouterLink} to="/tasks">`** — đây là điểm mấu chốt: render `Typography` **dưới dạng** `RouterLink` (prop `component`). Bấm vào → điều hướng SPA về `/tasks` **không reload trang**. `color: 'inherit'` + `textDecoration: 'none'` để chữ trắng, bỏ gạch chân mặc định của link.
  - **Tại sao import `Link as RouterLink`?** Vì MUI cũng có component tên `Link`. Đặt alias `RouterLink` cho khỏi nhầm và tránh đụng tên.
- **`<Container maxWidth="lg" sx={{ py: 3 }}>{children}</Container>`** — vùng nội dung canh giữa, max 1200px, padding dọc 24px. `{children}` là nơi từng page được "nhét" vào.

> **Vì sao layout nhận `children` thay vì dùng `<Outlet>`?** Xem mục 5 — đây là một lựa chọn kiến trúc có chủ đích.

---

## 4. Trang 404 — `NotFoundPage`

### 4.1. Tạo `src/pages/NotFoundPage.tsx`

```tsx
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { Link as RouterLink } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 8,
        textAlign: 'center',
      }}
    >
      <Typography variant="h3" sx={{ fontWeight: 700 }}>
        404
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Trang không tồn tại
      </Typography>
      <Button component={RouterLink} to="/tasks" variant="contained">
        Về danh sách
      </Button>
    </Box>
  )
}
```

### Giải thích

- Box flex dọc, căn giữa cả 2 trục, `gap: 2` (16px) giữa các phần tử.
- `Typography variant="h3"` hiển thị "404" to.
- `Button component={RouterLink} to="/tasks"` — nút "Về danh sách" cũng là một router link → bấm về `/tasks` không reload.
- Trang này được map vào route `*` (catch-all) ở bước 5 → mọi URL không khớp route nào sẽ rơi vào đây.

---

## 5. Router config — `router/AppRouter.tsx`

Đây là "bộ não" điều hướng. Ta khai báo toàn bộ route bằng `createBrowserRouter`, và **bọc mỗi trang trong `MainLayout`** để trang nào cũng có AppBar + Container.

### 5.1. Tạo `src/router/AppRouter.tsx`

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { TaskListPage } from '@/pages/tasks/TaskListPage'
import { TaskCreatePage } from '@/pages/tasks/TaskCreatePage'
import { TaskDetailPage } from '@/pages/tasks/TaskDetailPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/tasks" replace />,
  },
  {
    path: '/tasks',
    element: (
      <MainLayout>
        <TaskListPage />
      </MainLayout>
    ),
  },
  {
    path: '/tasks/new',
    element: (
      <MainLayout>
        <TaskCreatePage />
      </MainLayout>
    ),
  },
  {
    path: '/tasks/:id',
    element: (
      <MainLayout>
        <TaskDetailPage />
      </MainLayout>
    ),
  },
  {
    path: '*',
    element: (
      <MainLayout>
        <NotFoundPage />
      </MainLayout>
    ),
  },
])
```

### Giải thích từng route

| `path` | `element` | Ý nghĩa |
|---|---|---|
| `/` | `<Navigate to="/tasks" replace />` | Vào trang gốc → **redirect** ngay sang `/tasks`. |
| `/tasks` | `MainLayout` bọc `TaskListPage` | Danh sách task. |
| `/tasks/new` | `MainLayout` bọc `TaskCreatePage` | Form tạo task. |
| `/tasks/:id` | `MainLayout` bọc `TaskDetailPage` | Chi tiết 1 task. `:id` là **route param**. |
| `*` | `MainLayout` bọc `NotFoundPage` | Catch-all: mọi URL không khớp ở trên → 404. |

#### `<Navigate to="/tasks" replace />` — redirect bằng component

- `Navigate` là component, khi render sẽ **điều hướng ngay** sang `to`.
- **`replace`** rất quan trọng: thay thế entry hiện tại trong history thay vì push thêm. Nghĩa là người dùng vào `/` → bị đẩy sang `/tasks`, khi bấm **Back** trên trình duyệt sẽ KHÔNG quay lại `/` (rồi lại bị đẩy sang `/tasks` → kẹt vòng lặp). Có `replace` thì Back đi thẳng ra ngoài app.

#### `/tasks/:id` — route param

- Dấu `:` báo đây là **biến**. URL thực tế như `/tasks/abc123` sẽ khớp route này, và `abc123` được gán vào param tên `id`.
- Trong `TaskDetailPage` (bài 9), `const { id } = useParams()` sẽ lấy ra đúng `'abc123'`. **Đây chính là lý do bài 9 ghi chú "cần bài 10"** — giờ có route `:id` thì `useParams` mới có gì để trả.

#### Thứ tự route & catch-all `*`

- Trong `createBrowserRouter`, router **match theo độ cụ thể (specificity)**, không đơn thuần theo thứ tự khai báo như Express. `/tasks/new` cụ thể hơn `/tasks/:id` nên `/tasks/new` luôn thắng, không bị nuốt thành param `id = "new"`.
- `*` là **catch-all**, match mọi thứ còn lại. Nó luôn có specificity thấp nhất nên là "lưới hứng cuối cùng" → đúng vai trò trang 404.
- Dù router tự xử lý specificity, **thói quen tốt** vẫn là để `*` ở cuối mảng cho dễ đọc (và quan trọng hơn nếu mai này bạn chuyển sang kiểu `<Routes>` — ở đó thứ tự CÓ ảnh hưởng, xem mục Sai lầm).

#### Tại sao bọc `MainLayout` ở từng route (children pattern) thay vì `<Outlet>`?

React Router còn một kiểu nữa: **nested routes** với route cha render `MainLayout` chứa `<Outlet />`, các route con render bên trong `<Outlet>`:

```tsx
// Cách nested + Outlet (KHÔNG dùng trong app này)
{
  path: '/',
  element: <MainLayoutWithOutlet />,   // bên trong có <Outlet />
  children: [
    { index: true, element: <Navigate to="/tasks" replace /> },
    { path: 'tasks', element: <TaskListPage /> },
    { path: 'tasks/:id', element: <TaskDetailPage /> },
  ],
}
```

- `<Outlet />` là "lỗ" trong layout cha để React Router cắm route con đang khớp vào.
- **Ưu điểm Outlet**: layout chỉ mount **một lần**, đổi route con thì AppBar không re-render — mượt hơn khi có nhiều cấp layout.
- **Tại sao app này chọn children pattern (bọc tay)?** Vì app phẳng, chỉ 1 cấp layout, số route ít. Bọc `<MainLayout>{...}</MainLayout>` ở mỗi route **trực quan hơn cho người mới**: nhìn vào 1 route thấy ngay nó render gì, layout nào. Khi app lớn (nhiều layout lồng nhau, ví dụ QLVB có layout sau-đăng-nhập + layout con theo module), hãy chuyển sang `<Outlet>`. Mục "So sánh với QLVB thật" nói thêm.

> Tóm lại: **children pattern** = đơn giản, dễ dạy, đủ cho app nhỏ. **Outlet/nested** = chuẩn cho app nhiều cấp layout. Hiểu cả hai, chọn theo quy mô.

---

## 6. Nối router vào app — sửa `main.tsx`

Mở `src/main.tsx`. Ta thay `<App />` bằng `<RouterProvider>`, đặt **bên trong** `ThemeProvider` (để mọi trang vẫn có theme MUI).

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { RouterProvider } from 'react-router-dom'
import { theme } from './themes'
import { router } from '@/router/AppRouter'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
```

### Giải thích

- **`<RouterProvider router={router} />`** thay cho `<App />` cũ. Từ giờ cái quyết định "hiển thị trang nào" là URL + router config, không còn `App.tsx` render cứng.
- **Thứ tự bọc**: `ThemeProvider` → `CssBaseline` → `RouterProvider`. Theme phải ở **ngoài** router để mọi trang con đều đọc được theme token. (Cũng có thể đảo lại router ngoài / theme trong, nhưng đặt theme ngoài cùng là quy ước dễ nhớ: "theme phủ toàn bộ".)
- **`App.tsx` giờ dư thừa** — bạn có thể xóa import `App`, để lại file cũng không sao (không còn ai dùng). Router đã thay vai trò "root UI".

> Nếu bạn chọn kiểu `<BrowserRouter>` ở mục 2.1 thì `main.tsx` sẽ là `<ThemeProvider>...<BrowserRouter><AppRoutes /></BrowserRouter></ThemeProvider>`. App này dùng `RouterProvider` nên theo đoạn code trên.

---

## 7. `<Link>` / `useNavigate` — điều hướng đúng cách

Có 2 cách điều hướng, dùng cho 2 ngữ cảnh khác nhau:

### 7.1. `<Link>` (hoặc `component={RouterLink}`) — điều hướng do người dùng bấm

```tsx
import { Link as RouterLink } from 'react-router-dom'

<Button component={RouterLink} to="/tasks/new" variant="contained">
  Tạo task
</Button>
```

- Render ra thẻ `<a href>` thật nhưng **chặn full reload**, chỉ đổi nội dung SPA → nhanh, giữ nguyên state.
- Dùng khi điều hướng là **một liên kết người dùng nhìn thấy & bấm**.

### 7.2. `useNavigate()` — điều hướng bằng code (sau một hành động)

```tsx
import { useNavigate } from 'react-router-dom'

const navigate = useNavigate()

// sau khi tạo task thành công:
navigate('/tasks')

// xem chi tiết khi click 1 dòng bảng:
navigate('/tasks/' + row.id)

// nút Hủy → quay lại trang trước:
navigate(-1)
```

- `navigate('/path')` đi tới path. `navigate(-1)` = Back, `navigate(1)` = Forward.
- Dùng khi điều hướng xảy ra **sau một sự kiện logic** (submit form thành công, xóa xong, click row...) — chỗ không gắn được một thẻ link sẵn.
- **Đây chính là các lời gọi đã viết ở bài 7-9** mà khi đó chưa chạy. Giờ có `RouterProvider` bọc app → chúng hoạt động thật.

> Quy tắc: **người dùng bấm thấy → `<Link>`**; **code tự đi sau hành động → `useNavigate`**.

---

## 8. Test toàn luồng

```powershell
npm run dev
```

Mở browser và đi theo kịch bản end-to-end:

1. **Redirect gốc**: mở `http://localhost:5173/` → URL tự nhảy sang `/tasks`. Bấm **Back** → ra ngoài app (không kẹt lại `/`). ✅ `Navigate replace` đúng.
2. **List**: thấy AppBar "Task App" + bảng 3 task seed. ✅ `MainLayout` + `TaskListPage`.
3. **Tạo**: bấm "Tạo task" → URL `/tasks/new`, hiện form. Nhập tiêu đề, **Lưu** → tự về `/tasks`, task mới nằm đầu bảng. ✅ `useNavigate('/tasks')` chạy.
4. **Xem chi tiết**: bấm vào 1 dòng → URL `/tasks/<id>`, hiện đúng task đó. ✅ route `:id` + `useParams` chạy. Thử **copy URL `/tasks/<id>` mở tab mới** → vẫn load đúng task (vì param đọc từ URL, không phụ thuộc state trước đó).
5. **Xóa**: ở trang chi tiết bấm "Xóa" → xác nhận → tự về `/tasks`, task biến mất. ✅
6. **404**: gõ URL bậy như `/khong-co-trang-nay` → hiện trang "404 / Trang không tồn tại" + nút "Về danh sách". Bấm nút → về `/tasks`. ✅ catch-all `*`.
7. **AppBar link**: ở bất kỳ trang nào, bấm chữ "Task App" trên AppBar → về `/tasks`, **không thấy trang trắng / reload** (network tab không có request tải lại HTML). ✅ `<Link>` SPA.

Nếu cả 7 bước đúng → router hoàn chỉnh.

---

## 9. Sai lầm thường gặp (đọc kỹ!)

### 9.1. Quên `<RouterProvider>` / `<BrowserRouter>` → `useNavigate` ném lỗi

Triệu chứng: app crash với lỗi `useNavigate() may be used only in the context of a <Router> component`, hoặc `useParams` trả `{}` (`id` undefined).
→ Nguyên nhân: các hook router phải nằm **trong** cây của `RouterProvider`/`BrowserRouter`. Kiểm tra `main.tsx` đã render `<RouterProvider router={router} />` chưa, và các page nằm dưới nó qua route config.

### 9.2. Thứ tự / specificity route — `*` hoặc `:id` nuốt mất route khác

- Với `createBrowserRouter`, router match theo specificity nên `/tasks/new` không bị nuốt thành `:id`. Nhưng **nếu bạn chuyển sang kiểu `<Routes>`** thì **thứ tự khai báo CÓ ảnh hưởng** ở các bản v6 cũ — phải để `/tasks/new` **trước** `/tasks/:id`, và để `*` **cuối cùng**. Đặt `*` lên đầu → mọi URL rơi vào 404, app chết.
→ Quy tắc an toàn cho cả hai kiểu: **cụ thể trước, `:param` sau, `*` cuối cùng.**

### 9.3. Dùng `<a href>` thay `<Link>` → full reload, mất state

```tsx
<a href="/tasks/new">Tạo task</a>        // ❌ Reload cả trang, mất state, chậm
<Button component={RouterLink} to="/tasks/new">Tạo task</Button>  // ✅ SPA
```

`<a href>` bảo trình duyệt **tải lại toàn bộ HTML** từ server → mất hết React state, nhấp nháy trang trắng, chậm. Trong SPA luôn dùng `<Link>` / `component={RouterLink}` / `useNavigate`.

### 9.4. Quên `replace` ở route redirect `/`

`<Navigate to="/tasks" />` (thiếu `replace`) → vào `/` push thêm history entry, bấm Back quay lại `/` → lại bị đẩy sang `/tasks` → **kẹt không thoát được app bằng Back**. Luôn thêm `replace` cho redirect.

### 9.5. Quên bọc `MainLayout` ở một route nào đó

Triệu chứng: một trang (ví dụ 404) hiện ra **không có AppBar**, layout lạc lõng. → Kiểm tra route đó đã bọc `<MainLayout>...</MainLayout>` chưa. (Đây cũng là động lực chuyển sang `<Outlet>` khi app lớn — layout khai 1 lần, không sót route nào.)

### 9.6. Đặt `RouterProvider` ngoài `ThemeProvider` rồi quên — mất theme

Nếu router ở ngoài và theme ở trong nhưng theme không bọc hết, vài trang sẽ render theme default. App này đặt `ThemeProvider` **ngoài cùng** bọc cả `RouterProvider` → mọi trang chắc chắn có theme.

---

## 10. Checkpoint Bài 10

- [ ] `npm install react-router-dom` chạy không lỗi, `package.json` có `react-router-dom` (v6)
- [ ] Có `src/components/layout/MainLayout.tsx` (AppBar + Container, link "Task App" → `/tasks`)
- [ ] Có `src/pages/NotFoundPage.tsx` (404 + nút "Về danh sách")
- [ ] Có `src/router/AppRouter.tsx` export `router` với đủ 5 route: `/` redirect, `/tasks`, `/tasks/new`, `/tasks/:id`, `*`
- [ ] Mọi route đều bọc trong `<MainLayout>`
- [ ] `main.tsx` render `<RouterProvider router={router} />` **bên trong** `<ThemeProvider>` + `<CssBaseline />`
- [ ] Mở `/` → tự redirect sang `/tasks` (Back không kẹt)
- [ ] Bấm "Tạo task" → `/tasks/new`; Lưu xong → tự về `/tasks` (navigate chạy thật)
- [ ] Bấm 1 dòng → `/tasks/:id` đúng task; copy URL mở tab mới vẫn load đúng (useParams chạy thật)
- [ ] Xóa task ở trang chi tiết → tự về `/tasks`
- [ ] Gõ URL bậy → ra trang 404, nút "Về danh sách" hoạt động
- [ ] Bấm "Task App" trên AppBar → về `/tasks` không reload (network không tải lại HTML)

---

## 11. Câu hỏi tự kiểm tra

1. Tại sao `useNavigate()` và `useParams()` ở bài 7-9 chưa chạy được, và bài 10 đã sửa bằng cách nào?
2. Khác biệt giữa `createBrowserRouter` + `RouterProvider` và `<BrowserRouter>` + `<Routes>`? App này chọn cái nào và vì sao?
3. `<Navigate to="/tasks" replace />` — bỏ `replace` đi thì hành vi sai chỗ nào?
4. Trong route `/tasks/:id`, dấu `:` nghĩa là gì, và component lấy giá trị `id` ra bằng hook nào?
5. Vì sao route `*` phải đặt cuối (đặc biệt khi dùng kiểu `<Routes>`)? Đặt nó đầu thì sao?
6. Khi nào dùng `<Link>` còn khi nào dùng `useNavigate()`? Vì sao tránh `<a href>` trong SPA?

**Đáp án:**

1. Vì các hook router chỉ chạy **bên trong context của một Router** (`RouterProvider`/`BrowserRouter`). Bài 7-9 chưa bọc app trong router nên `useNavigate` ném lỗi và `useParams` trả `{}` (id undefined). Bài 10 tạo `createBrowserRouter` với đủ route (gồm `/tasks/:id`) và render `<RouterProvider>` ở `main.tsx` → từ đó mọi hook router hoạt động: `navigate` điều hướng thật, `useParams` đọc được `id` từ URL.

2. `createBrowserRouter` + `RouterProvider` khai báo route bằng **mảng object**, hỗ trợ data API mới (`loader`, `action`, `errorElement`), tách config khỏi UI. `<BrowserRouter>` + `<Routes>` khai báo route bằng **JSX** trong cây component, đơn giản nhưng không có data API. App này chọn **`createBrowserRouter` + `RouterProvider`** vì hiện đại, dễ mở rộng (ví dụ thêm `loader` khi nối BE thật ở bài 11), và gom config vào `router/AppRouter.tsx`.

3. Thiếu `replace`, vào `/` sẽ **push** thêm một entry history rồi mới redirect sang `/tasks`. Người dùng bấm **Back** sẽ quay lại `/` → bị redirect tiếp sang `/tasks` → kẹt vòng lặp, không thoát được app bằng Back. `replace` **thay thế** entry hiện tại nên Back đi thẳng ra ngoài.

4. `:` báo đó là **route param** (biến trong URL). `/tasks/abc123` khớp `/tasks/:id` và gán `id = 'abc123'`. Component lấy ra bằng `const { id } = useParams()`.

5. `*` là catch-all match mọi URL còn lại — nó là "lưới hứng cuối". `createBrowserRouter` match theo specificity nên `*` luôn thua các route cụ thể, nhưng với kiểu `<Routes>` **thứ tự khai báo có ảnh hưởng**: đặt `*` đầu thì mọi URL khớp `*` trước → tất cả ra 404, các route thật không bao giờ chạy. Quy tắc an toàn: cụ thể trước, `:param` sau, `*` cuối.

6. **`<Link>`** (hoặc `component={RouterLink}`) dùng cho điều hướng người dùng **nhìn thấy và bấm** (link, nút điều hướng). **`useNavigate()`** dùng cho điều hướng **bằng code sau một hành động logic** (submit thành công, xóa xong, click row). Tránh `<a href>` vì nó bắt trình duyệt **tải lại toàn bộ trang**, mất hết React state và chậm; `<Link>` chỉ đổi nội dung SPA, giữ state.

---

## 12. So sánh với QLVB thật

Mở `frontend/src/router/AuthRouter.tsx` và `frontend/src/layouts/` của QLVB:

| Khía cạnh | QLVB | Bài 10 |
|---|---|---|
| File router | `AuthRouter.tsx` (+ thường có `PublicRouter` / `index` gộp) | 1 file `AppRouter.tsx` |
| Kiểu dựng | `createBrowserRouter` + `RouterProvider` | Giống — `createBrowserRouter` |
| Layout | Nhiều layout trong `layouts/` (auth layout, main layout sau đăng nhập), dùng **`<Outlet>` + nested routes** | 1 `MainLayout`, dùng **children pattern** (bọc tay) |
| Bảo vệ route | `AuthRouter` chặn route nếu chưa đăng nhập (đọc `authStore` token), redirect `/login` | Không có auth — app demo |
| Số route | Hàng chục (theo module: văn bản đến, văn bản đi, danh mục...) | 5 route |
| Lazy load | `React.lazy` + `Suspense` chia code theo route | Không (app nhỏ, không cần) |

→ Bài này là **subset** của router QLVB: cùng dùng `createBrowserRouter`, nhưng đơn giản hoá — 1 layout (children thay vì Outlet), không auth guard, không lazy load. Khi app lớn dần, hướng nâng cấp rõ ràng: chuyển `MainLayout` sang nested route + `<Outlet>`, thêm route bảo vệ đọc auth state, và `React.lazy` từng page.

---

## 13. Khi nào sang bài 11?

Khi mọi checkbox ở mục 10 đều tick và bạn chạy trọn 7 bước test ở mục 8 không lỗi. Lúc này task-app đã là **một SPA hoàn chỉnh chạy trên mock service** (localStorage): list, tạo, xem, sửa trạng thái, xóa, điều hướng, 404 — tất cả hoạt động.

Bài 11 (optional) sẽ làm:

- Tạo `.env` với `VITE_API_BASE_URL=http://localhost:8080/api/v1`.
- Viết `services/api/http.ts` (axios instance) và `taskApiHttp.ts` **cùng interface** với `taskApi` mock, rồi swap import trong store → app chạy với **BE Go thật** mà không sửa UI.
- Hiểu CORS, proxy Vite (`server.proxy`), và khác biệt mock vs real (lỗi mạng, status code, async thật).

Báo tôi "xong bài 10" để tôi viết tiếp `bai-11-noi-task-svc-go.md` (optional).

---

**Bài 10 — phiên bản 2026-06-08.**
