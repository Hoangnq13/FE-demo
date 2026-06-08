# Bài 7 — TaskListPage: search, filter, pagination

> **Thời lượng**: ~90 phút.
> **Mục tiêu**: Dựng trang danh sách task hoàn chỉnh: `<Table>` + `<Tabs>` filter theo status + ô search có **debounce** + `<TablePagination>`. Hiểu cách nối `useTaskStore` với UI, mapping `page` 0-based của MUI ↔ 1-based của API, reset page khi đổi tab/search, và xử lý `loading` state.
> **Map QLVB**: `frontend/src/pages/documents/incoming/IncomingDocumentListPage.tsx` — trang danh sách văn bản đến (table + tab trạng thái + tìm kiếm + phân trang). TaskListPage là bản rút gọn của chính nó.

---

## 0. Bức tranh tổng thể — trang list "thật" gồm những gì?

Một trang danh sách trong app nghiệp vụ (QLVB, CRM, admin...) hầu như luôn có 5 mảnh ghép:

1. **Thanh filter** — tab theo trạng thái (All / Chưa làm / Đang làm / Hoàn thành).
2. **Ô tìm kiếm** — gõ là lọc, nhưng **không gọi API mỗi ký tự** (debounce).
3. **Nút tạo mới** — điều hướng sang trang form.
4. **Bảng dữ liệu** — render rows, có loading skeleton, có empty state, click row → xem chi tiết.
5. **Phân trang** — đổi trang, đổi số dòng/trang.

Ở các bài trước ta đã có sẵn "vật liệu":

- Bài 4: `taskApi.list(params)` — mock backend trả `Paginated<Task>`.
- Bài 5: `useTaskStore` — cache `tasks/total/loading` + UI prefs `statusTab/pageSize` (persist).
- Bài 6: các UI component dùng lại — `<Table>`, `<StatusChip>`, `<CustomTextField>`.

Bài 7 là bài **ráp** chúng lại thành 1 trang chạy được. Đây là bài "đời thường" nhất — đúng những gì bạn làm hằng ngày trong QLVB.

> **Giả định về router**: nút "Tạo task" và click row cần điều hướng (`navigate`). React Router được cài và cấu hình đầy đủ ở **bài 10**. Trong bài 7 ta vẫn `import { useNavigate } from 'react-router-dom'` và viết code điều hướng cho đúng dạng cuối, **nhưng** nếu bạn chạy thử ngay bây giờ mà chưa bọc `<BrowserRouter>`/`RouterProvider`, `useNavigate` sẽ ném lỗi. Có 2 cách (mục 8 nói rõ): (a) tạm thay bằng handler `console.log` placeholder rồi đổi lại ở bài 10, hoặc (b) giữ `useNavigate` và **tạm bọc** một `<BrowserRouter>` tối thiểu để test. Bài này dùng cách (a) làm mặc định trong code, có chú thích chỗ đổi.

---

## 1. Cài `date-fns`

Bảng cột có 2 cột ngày (Hạn, Ngày tạo). `Task.due_date` lưu dạng `'yyyy-MM-dd'` hoặc `null`, `created_at` là ISO datetime. Cần format ra `dd/MM/yyyy` cho người Việt đọc. Ta dùng `date-fns`.

Trong `task-app/`:

```powershell
npm install date-fns
```

### Vì sao `date-fns` mà không phải `dayjs` / `moment` / `Date` thuần?

| Lựa chọn | Đánh giá |
|---|---|
| `Date` thuần + `toLocaleDateString` | Được nhưng format khó kiểm soát, phụ thuộc locale máy, parse `'yyyy-MM-dd'` dễ lệch timezone. |
| `moment` | Nặng (~70KB), đã ngừng phát triển (legacy). Không khuyến khích dự án mới. |
| `dayjs` | Nhẹ, API giống moment. QLVB cũng dùng được. |
| **`date-fns`** | Tree-shakeable (chỉ bundle hàm bạn import), API hàm thuần, immutable. QLVB dùng cái này → ta theo. |

> **Lưu ý timezone**: `parseISO('2026-06-08')` trả về `Date` ở **local time** lúc 00:00. Vì ta chỉ format ra `dd/MM/yyyy` (không quan tâm giờ) nên an toàn. Với `created_at` ISO đầy đủ (`...T03:21:00.000Z`), `parseISO` hiểu đúng UTC rồi `format` hiển thị theo giờ máy — chấp nhận được cho app nội bộ.

---

## 2. Tạo `utils/date.ts`

Mirror spec — 3 helper dùng xuyên suốt các bài còn lại (list, detail, form):

Tạo `src/utils/date.ts`:

```ts
import { format, parseISO, isValid } from 'date-fns'

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = parseISO(value)
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '—'
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = parseISO(value)
  return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm') : '—'
}

export function todayISODate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}
```

### Giải thích từng hàm

- **`formatDate`** — dùng cho `due_date`. Nếu `null`/`undefined`/`''` → trả dấu gạch `'—'` (không hiển thị "Invalid Date"). `parseISO` đổi chuỗi ISO/`yyyy-MM-dd` thành `Date`; `isValid` chặn chuỗi rác → cũng trả `'—'`. Format kết quả `08/06/2026`.
- **`formatDateTime`** — dùng cho `created_at`/`updated_at`. Thêm `HH:mm` → `08/06/2026 10:30`.
- **`todayISODate`** — trả ngày hôm nay dạng `'yyyy-MM-dd'`. Bài 7 chưa dùng, nhưng bài 8 (form tạo task) cần để set `due_date` mặc định/min. Đặt sẵn ở đây cho gọn.

**Vì sao luôn check `if (!value)` và `isValid`?**
Dữ liệu ngày là nguồn lỗi UI kinh điển: `null`, chuỗi rỗng, hoặc format sai từ BE đều khiến `format()` ném lỗi hoặc in `Invalid Date`. Bọc guard 1 lần ở util → mọi nơi gọi đều an toàn, không phải nhớ check lại.

---

## 3. Tạo `hooks/useDebounce.ts`

Đây là "trái tim" của ô search. Mục tiêu: người dùng gõ liên tục → ta **chỉ** lấy giá trị cuối cùng sau khi họ ngừng gõ một khoảng (400ms), thay vì phản ứng mỗi ký tự.

Tạo `src/hooks/useDebounce.ts`:

```ts
import { useEffect, useState } from 'react'

export function useDebounce<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
```

### Cơ chế hoạt động (đọc kỹ — đây là điểm thi)

1. Hook nhận `value` (giá trị ô input hiện tại) và trả về `debounced` (giá trị "trễ").
2. Mỗi lần `value` đổi (gõ 1 ký tự), `useEffect` chạy: đặt một `setTimeout` 400ms để cập nhật `debounced`.
3. **Cleanup function `clearTimeout(id)`** chạy *trước* lần effect tiếp theo. Nghĩa là: gõ ký tự thứ 2 trong vòng 400ms → timer cũ bị huỷ, đặt timer mới.
4. Chỉ khi người dùng **ngừng gõ 400ms** thì timer mới sống sót đến lúc chạy → `debounced` được cập nhật → component re-render với giá trị mới.

```
Gõ:    "v"   "vi"   "vie"   "viet"        (ngừng 400ms)
Timer: huỷ   huỷ    huỷ     ──────────────► set "viet"
```

- Generic `<T>` → dùng được cho mọi kiểu (string search, object filter...).
- `delayMs = 400` mặc định — đủ tự nhiên: không quá nhanh (vẫn spam API), không quá chậm (user thấy lag).

> **Vì sao không debounce ngay trong handler `onChange`?** Tách thành hook giúp: (1) tái sử dụng (filter giá, autocomplete...), (2) input vẫn **controlled** mượt (state `search` cập nhật tức thì → ô gõ không giật), chỉ giá trị *dùng để gọi API* mới bị trễ.

---

## 4. Khung `TaskListPage` — phác state trước khi code

Trước khi đổ code, hình dung 3 loại state của trang:

| Loại | Nguồn | Biến |
|---|---|---|
| **Data** (server cache) | `useTaskStore` | `tasks`, `total`, `loading` |
| **UI pref** (persist) | `useTaskStore` | `statusTab`, `pageSize` |
| **Local UI** (chỉ trang này) | `useState` | `search` (raw input), `page` (0-based MUI) |

`debouncedSearch` = `useDebounce(search)` — phái sinh, không phải state riêng.

**Tại sao `page` để ở local state mà không bỏ vào store?**
`page` là trạng thái phù du của riêng lần xem này — rời trang rồi quay lại nên về trang 1. `statusTab`/`pageSize` thì người dùng muốn **nhớ** (đã chọn "Đang làm", 20 dòng/trang) → persist trong store. Phân biệt cái nào "đáng nhớ" là quyết định thiết kế quan trọng.

**Mapping page quan trọng nhất bài này:**

- MUI `<TablePagination>` dùng `page` **0-based**: trang đầu = `0`.
- API `taskApi.list` dùng `page` **1-based**: trang đầu = `1`.
- → Khi gọi API: `page: page + 1`. Khi nhận `onPageChange(_, newPage)`: lưu thẳng `newPage` (đã 0-based).

Nhớ sai chỗ này = bug off-by-one kinh điển (trang 1 hiện data trang 2, hoặc trang cuối trống).

---

## 5. Code đầy đủ `pages/tasks/TaskListPage.tsx`

Tạo `src/pages/tasks/TaskListPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import TablePagination from '@mui/material/TablePagination'
import AddIcon from '@mui/icons-material/Add'

import { useTaskStore } from '@/store/taskStore'
import { useDebounce } from '@/hooks/useDebounce'
import { CustomTextField } from '@/components/ui/CustomTextField'
import { StatusChip } from '@/components/ui/StatusChip'
import { Table } from '@/components/ui/Table'
import type { Column } from '@/components/ui/Table'
import { formatDate, formatDateTime } from '@/utils/date'
import { TASK_STATUS_OPTIONS, PAGE_SIZE_OPTIONS } from '@/constants/task'
import type { Task } from '@/types/entities/task'

export function TaskListPage() {
  const navigate = useNavigate()

  // --- store: data cache + UI prefs ---
  const tasks = useTaskStore((s) => s.tasks)
  const total = useTaskStore((s) => s.total)
  const loading = useTaskStore((s) => s.loading)
  const statusTab = useTaskStore((s) => s.statusTab)
  const pageSize = useTaskStore((s) => s.pageSize)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const setStatusTab = useTaskStore((s) => s.setStatusTab)
  const setPageSize = useTaskStore((s) => s.setPageSize)

  // --- local UI state ---
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0) // 0-based theo MUI
  const debouncedSearch = useDebounce(search, 400)

  // --- gọi API khi bất kỳ điều kiện lọc/phân trang đổi ---
  useEffect(() => {
    fetchTasks({
      search: debouncedSearch,
      status: statusTab,
      page: page + 1, // MUI 0-based -> API 1-based
      page_size: pageSize,
    })
  }, [debouncedSearch, statusTab, page, pageSize, fetchTasks])

  // --- handlers ---
  const handleTabChange = (_e: React.SyntheticEvent, value: Task['status'] | 'all') => {
    setStatusTab(value)
    setPage(0) // đổi tab -> luôn về trang đầu
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0) // đổi từ khoá -> về trang đầu
  }

  const handlePageChange = (_e: unknown, newPage: number) => {
    setPage(newPage) // newPage đã là 0-based
  }

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageSize(Number(e.target.value))
    setPage(0) // đổi số dòng/trang -> về trang đầu
  }

  const handleCreate = () => {
    navigate('/tasks/new')
  }

  const handleRowClick = (row: Task) => {
    navigate('/tasks/' + row.id)
  }

  // --- định nghĩa cột bảng ---
  const columns: Column<Task>[] = [
    {
      key: 'title',
      header: 'Tiêu đề',
      render: (row) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {row.title}
        </Typography>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: 140,
      render: (row) => <StatusChip status={row.status} />,
    },
    {
      key: 'due_date',
      header: 'Hạn',
      width: 120,
      render: (row) => formatDate(row.due_date),
    },
    {
      key: 'created_at',
      header: 'Ngày tạo',
      width: 160,
      render: (row) => formatDateTime(row.created_at),
    },
  ]

  return (
    <Box>
      {/* Header: tiêu đề + nút tạo */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h3">Danh sách task</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
          Tạo task
        </Button>
      </Box>

      {/* Tabs filter theo status (controlled) */}
      <Tabs
        value={statusTab}
        onChange={handleTabChange}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Tất cả" value="all" />
        {TASK_STATUS_OPTIONS.map((opt) => (
          <Tab key={opt.value} label={opt.label} value={opt.value} />
        ))}
      </Tabs>

      {/* Ô search */}
      <Stack direction="row" sx={{ mb: 2 }}>
        <Box sx={{ maxWidth: 360, width: '100%' }}>
          <CustomTextField
            placeholder="Tìm theo tiêu đề..."
            value={search}
            onChange={handleSearchChange}
          />
        </Box>
      </Stack>

      {/* Bảng dữ liệu */}
      <Table
        columns={columns}
        rows={tasks}
        rowKey={(row) => row.id}
        loading={loading}
        emptyText="Không có task nào khớp điều kiện"
        onRowClick={handleRowClick}
      />

      {/* Phân trang */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={handlePageChange}
        rowsPerPage={pageSize}
        onRowsPerPageChange={handleRowsPerPageChange}
        rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        labelRowsPerPage="Số dòng/trang"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} trên ${count}`}
      />
    </Box>
  )
}
```

> **Lưu ý import store theo selector**: ta gọi `useTaskStore((s) => s.tasks)` từng field thay vì lấy cả object. Đây là pattern Zustand đã học ở bài 5 — chỉ re-render khi đúng field đó đổi, tránh re-render thừa. Nếu lấy `const { tasks, total } = useTaskStore()` thì mọi thay đổi store đều re-render trang.

---

## 6. Giải thích chi tiết các phần

### 6.1. `useEffect` — bộ đồng bộ "filter → API"

```tsx
useEffect(() => {
  fetchTasks({ search: debouncedSearch, status: statusTab, page: page + 1, page_size: pageSize })
}, [debouncedSearch, statusTab, page, pageSize, fetchTasks])
```

- **Dependency array** liệt kê **mọi thứ ảnh hưởng kết quả list**: từ khoá (đã debounce), tab status, trang, số dòng/trang. Bất kỳ cái nào đổi → effect chạy lại → gọi API mới.
- Dùng `debouncedSearch` (KHÔNG phải `search`) trong dep → effect chỉ chạy khi giá trị debounce đổi, tức là khi user ngừng gõ. Đây chính là chỗ debounce "ăn khớp" với việc gọi API.
- `fetchTasks` nằm trong dep vì là function từ store. Zustand giữ reference ổn định nên nó không gây loop — nhưng để trong dep cho đúng quy tắc `exhaustive-deps` của ESLint.
- `page + 1`: mapping 0-based → 1-based ngay tại điểm gọi API. Đây là **chỗ duy nhất** làm chuyển đổi → dễ kiểm soát.

### 6.2. Tabs controlled — vì sao `value={statusTab}`?

```tsx
<Tabs value={statusTab} onChange={handleTabChange}>
  <Tab label="Tất cả" value="all" />
  {TASK_STATUS_OPTIONS.map((opt) => <Tab key={opt.value} label={opt.label} value={opt.value} />)}
</Tabs>
```

- **Controlled component**: tab đang chọn được quyết định bởi `value={statusTab}` (state trong store), không phải bởi MUI tự giữ. Ưu điểm: trạng thái tab persist (rời trang quay lại vẫn đúng tab), và ta có thể chủ động set tab từ chỗ khác nếu cần.
- `onChange={handleTabChange}` nhận `(event, value)` — `value` chính là prop `value` của `<Tab>` được chọn (`'all'` | `'todo'` | `'in_progress'` | `'done'`).
- Tab đầu hard-code `value="all"`; 3 tab còn lại sinh từ `TASK_STATUS_OPTIONS` (single source of truth từ `constants/task.ts`). Thêm status mới chỉ cần sửa constant → tab tự xuất hiện.
- Trong handler: `setStatusTab(value)` **và** `setPage(0)`. Đổi filter mà giữ nguyên trang cũ → có thể đang ở trang 3 của "Tất cả" rồi chuyển sang "Hoàn thành" chỉ có 1 trang → trang 3 trống. **Luôn reset page khi đổi filter.**

### 6.3. Search controlled + debounce

```tsx
const [search, setSearch] = useState('')
const debouncedSearch = useDebounce(search, 400)
```

- Ô input **controlled** bởi `search` → gõ là cập nhật tức thì, không giật.
- `debouncedSearch` là bản trễ, chỉ nó mới vào dep của `useEffect` → API chỉ gọi sau khi ngừng gõ 400ms.
- `handleSearchChange` cũng `setPage(0)` — đổi từ khoá thì kết quả khác hẳn, phải về trang đầu.

### 6.4. `<Table>` — loading & empty đã lo sẵn

Component `<Table>` (bài 6) tự xử lý:
- `loading={true}` → hiện `<CircularProgress>` giữa bảng.
- `rows.length === 0` (khi không loading) → hiện `emptyText`.
- `onRowClick` → row có `cursor: pointer` + hover, click gọi `handleRowClick(row)`.

Ta chỉ cần đổ `columns`, `rows={tasks}`, `loading={loading}`. Không phải tự viết lại spinner/empty mỗi trang — đó là lợi ích của component tái sử dụng.

### 6.5. `<TablePagination>` — bảng đối chiếu prop

```tsx
<TablePagination
  component="div"
  count={total}
  page={page}
  onPageChange={handlePageChange}
  rowsPerPage={pageSize}
  onRowsPerPageChange={handleRowsPerPageChange}
  rowsPerPageOptions={PAGE_SIZE_OPTIONS}
/>
```

| Prop | Giá trị | Ghi chú |
|---|---|---|
| `component="div"` | — | Mặc định `TablePagination` render `<td>`, phải đặt trong `<table>`. Đặt `div` để dùng độc lập ngoài bảng. |
| `count` | `total` | **Tổng số bản ghi** sau filter (từ API), KHÔNG phải số dòng đang hiện. MUI tự tính số trang = `ceil(count / rowsPerPage)`. |
| `page` | `page` (0-based) | Trang hiện tại. MUI là 0-based — đưa thẳng state local. |
| `onPageChange` | `(e, newPage) => setPage(newPage)` | `newPage` đã 0-based, lưu thẳng. |
| `rowsPerPage` | `pageSize` | Số dòng/trang. |
| `onRowsPerPageChange` | đổi `pageSize` + `setPage(0)` | Đổi số dòng/trang phải reset page (số trang đổi). |
| `rowsPerPageOptions` | `PAGE_SIZE_OPTIONS` (`[5,10,20]`) | Options trong dropdown. |

**`count` = `total`, không phải `tasks.length`!**
`tasks` chỉ là dữ liệu của **trang hiện tại** (tối đa `pageSize` dòng). Nếu đưa `count={tasks.length}` thì MUI tưởng chỉ có 5 bản ghi → không bao giờ hiện nút sang trang 2. Phải đưa `total` (tổng sau filter từ server).

### 6.6. Loading state

`loading` lấy từ store, được set `true` khi `fetchTasks` bắt đầu, `false` khi xong (bài 5). Ta truyền vào `<Table loading={loading}>` → khi đang gọi API (kể cả lần đầu vào trang, hoặc lúc đổi tab/search/page) bảng hiện spinner thay vì nhấp nháy data cũ → cảm giác mượt, người dùng biết hệ thống đang xử lý.

---

## 7. Chạy thử

Vì điều hướng phụ thuộc router (bài 10), xem mục 8 để chọn cách test. Cách nhanh nhất bây giờ: tạm render trực tiếp `<TaskListPage>` trong `App.tsx` và thay 2 handler navigate bằng `console.log` (mục 8a). Sau đó:

```powershell
npm run dev
```

Kỳ vọng:
- Bảng hiện 3 task seed (bài 4), cột Hạn/Ngày tạo format `dd/MM/yyyy`.
- Gõ vào ô search → bảng **không** chớp ngay; ngừng ~0.4s mới lọc.
- Bấm tab "Hoàn thành" → chỉ còn task `done`, nhảy về trang 1.
- Đổi "Số dòng/trang" sang 5 và tạo thêm task (bài 8) để thấy phân trang hiện nút sang trang.
- Mở DevTools → Network/console: mỗi lần gõ liên tục chỉ thấy **1** lần gọi list sau khi ngừng, không phải mỗi ký tự.

---

## 8. Xử lý router (chưa có ở bài này)

`useNavigate` chỉ hoạt động bên trong cây có `<BrowserRouter>` hoặc `RouterProvider`. Bài 7 chưa dựng router → chọn **một** trong hai cách:

### 8a. Cách mặc định — placeholder, hoàn thiện ở bài 10

Tạm thời **không** import `useNavigate`, thay bằng handler log để test UI trước:

```tsx
// TODO(bài 10): thay bằng useNavigate khi đã dựng router
const navigate = (path: string) => {
  console.log('[navigate placeholder]', path)
}
```

Toàn bộ `navigate('/tasks/new')`, `navigate('/tasks/' + row.id)` vẫn viết y nguyên dạng cuối → tới **bài 10** chỉ cần xoá hàm placeholder và bỏ comment dòng `import { useNavigate } from 'react-router-dom'` + `const navigate = useNavigate()`. Không phải sửa logic.

### 8b. Cách thay thế — tạm bọc `<BrowserRouter>` để test thật

Nếu muốn test điều hướng thật ngay, cài sớm và bọc tạm trong `main.tsx`:

```powershell
npm install react-router-dom
```

```tsx
// main.tsx — tạm, sẽ thay bằng AppRouter ở bài 10
import { BrowserRouter } from 'react-router-dom'
// ...
<ThemeProvider theme={theme}>
  <CssBaseline />
  <BrowserRouter>
    <App />
  </BrowserRouter>
</ThemeProvider>
```

Khi đó giữ nguyên `import { useNavigate } from 'react-router-dom'` trong code mục 5. Bấm nút sẽ đổi URL nhưng chưa có route đích (chưa khai ở bài 10) → trang trắng, đó là bình thường.

> **Khuyến nghị**: dùng 8a cho gọn — bài 7 tập trung vào list/filter/pagination, để chuyện routing trọn vẹn cho bài 10. Code trong mục 5 viết theo dạng cuối (có `useNavigate`); nếu chạy ngay thì áp dụng 8a.

---

## 9. Sai lầm thường gặp (đọc kỹ!)

### 9.1. Off-by-one phân trang (0-based vs 1-based)

Triệu chứng: trang 1 hiện đúng, nhưng sang trang 2 lại thấy data trang 3; hoặc trang đầu bị trống.
→ Nguyên nhân: quên `+1`/`-1` khi mapping. **Quy tắc cố định**: API là 1-based, MUI là 0-based. Gọi API dùng `page + 1`; nhận từ MUI lưu thẳng `newPage`. Chỉ chuyển đổi tại **một** điểm (lúc gọi API).

### 9.2. Gọi API mỗi keystroke (quên debounce)

Triệu chứng: gõ "văn bản" → Network bắn ~7 request, kết quả nhấp nháy, có thể race condition (response cũ về sau ghi đè response mới).
→ Phải đưa `debouncedSearch` vào `useEffect` dep, KHÔNG đưa `search`. State `search` chỉ để input controlled.

### 9.3. Quên reset page khi đổi tab/search

Triệu chứng: đang trang 3, đổi tab "Hoàn thành" (chỉ 1 trang) → bảng trống vì `page=2` (0-based) vượt số trang.
→ Mọi handler đổi điều kiện lọc (`handleTabChange`, `handleSearchChange`, `handleRowsPerPageChange`) đều phải `setPage(0)`.

### 9.4. Đưa `count={tasks.length}` thay vì `count={total}`

Triệu chứng: dù có 50 task, phân trang luôn báo "1–5 trên 5", không sang trang được.
→ `tasks` là 1 trang; `total` là tổng sau filter. `count` PHẢI là `total`.

### 9.5. Lấy cả object store thay vì selector

```tsx
const { tasks, total, loading } = useTaskStore()  // ⚠️ re-render mỗi khi BẤT KỲ field store đổi
const tasks = useTaskStore((s) => s.tasks)         // ✅ chỉ re-render khi tasks đổi
```

→ Dùng selector từng field như mục 5. (Bài 5 đã giải thích kỹ.)

### 9.6. Hard-code danh sách tab

Đừng viết 3 `<Tab>` tay với label gõ cứng. Dùng `TASK_STATUS_OPTIONS` để label/value đồng bộ với chip, filter, form — sửa 1 chỗ áp dụng mọi nơi.

---

## 10. Checkpoint Bài 7

- [ ] `npm install date-fns` chạy không lỗi, `package.json` có `date-fns`
- [ ] `src/utils/date.ts` có `formatDate`, `formatDateTime`, `todayISODate` (đúng signature spec)
- [ ] `src/hooks/useDebounce.ts` đúng spec (generic, cleanup `clearTimeout`)
- [ ] `src/pages/tasks/TaskListPage.tsx` dùng `useTaskStore` selector cho `tasks/total/loading/statusTab/pageSize/fetchTasks/setStatusTab/setPageSize`
- [ ] Local state `search` + `useDebounce(search)` + `page` (0-based)
- [ ] `useEffect` gọi `fetchTasks` với `page: page + 1` và dep gồm `debouncedSearch, statusTab, page, pageSize`
- [ ] `<Tabs>` controlled (`value={statusTab}`), tab "Tất cả" + 3 tab từ `TASK_STATUS_OPTIONS`
- [ ] Đổi tab/search/pageSize đều `setPage(0)`
- [ ] `<Table>` 4 cột: Tiêu đề / Trạng thái (`<StatusChip>`) / Hạn (`formatDate`) / Ngày tạo (`formatDateTime`), `onRowClick` điều hướng detail
- [ ] `<TablePagination>` dùng `count={total}`, `page` 0-based, `rowsPerPageOptions={PAGE_SIZE_OPTIONS}`
- [ ] Điều hướng: dùng placeholder (8a) hoặc tạm `<BrowserRouter>` (8b), có ghi chú "router hoàn thiện ở bài 10"
- [ ] Test: gõ search liên tục chỉ gọi list 1 lần sau khi ngừng

---

## 11. Câu hỏi tự kiểm tra

1. Vì sao đưa `debouncedSearch` (không phải `search`) vào dependency của `useEffect`? Nếu đưa `search` thì điều gì xảy ra?
2. MUI `<TablePagination>` dùng page 0-based hay 1-based? API `taskApi.list` dùng cái nào? Mapping ở đâu trong code?
3. Tại sao prop `count` của `<TablePagination>` phải là `total` chứ không phải `tasks.length`?
4. Liệt kê 3 handler buộc phải gọi `setPage(0)` và giải thích vì sao.
5. `useDebounce` huỷ timer cũ bằng cách nào? Vì sao cleanup function lại đảm bảo "chỉ lấy ký tự cuối"?
6. Vì sao `statusTab`/`pageSize` để trong store (persist) còn `page` để ở local `useState`?

**Đáp án:**

1. `debouncedSearch` chỉ đổi sau khi user ngừng gõ 400ms, nên `useEffect` (gọi API) chỉ chạy 1 lần cho cả chuỗi gõ. Nếu đưa `search` vào dep → effect chạy mỗi ký tự → API bị spam, kết quả nhấp nháy, có thể race condition (response cũ ghi đè mới).

2. MUI là **0-based** (trang đầu = 0), API là **1-based** (trang đầu = 1). Mapping tại điểm gọi API trong `useEffect`: `page: page + 1`. Chiều ngược lại (`onPageChange`) MUI trả `newPage` đã 0-based nên lưu thẳng `setPage(newPage)`.

3. `tasks` chỉ chứa dữ liệu của trang hiện tại (tối đa `pageSize` dòng). `total` là tổng số bản ghi sau filter do server trả. MUI tính số trang = `ceil(count / rowsPerPage)`; nếu `count = tasks.length` (vd 5) thì MUI tưởng chỉ có 1 trang → không bao giờ sang trang 2.

4. `handleTabChange` (đổi filter status), `handleSearchChange` (đổi từ khoá), `handleRowsPerPageChange` (đổi số dòng/trang). Cả ba làm tập kết quả/số trang thay đổi; nếu giữ `page` cũ, có thể `page` vượt số trang mới → bảng trống (off-by-page).

5. Mỗi lần `value` đổi, `useEffect` đặt một `setTimeout`. Cleanup function `clearTimeout(id)` chạy **trước** lần effect kế tiếp, huỷ timer của ký tự trước. Vì người dùng gõ ký tự mới trong < 400ms nên timer cũ luôn bị huỷ; chỉ timer của lần gõ cuối (sau đó ngừng ≥ 400ms) sống đủ lâu để chạy → `debounced` = giá trị cuối.

6. `statusTab`/`pageSize` là tuỳ chọn người dùng muốn **nhớ** giữa các lần vào trang (đã chọn "Đang làm", 20 dòng/trang) → persist trong store (key `task-app:ui`). `page` là trạng thái phù du của riêng lần xem hiện tại; rời trang quay lại nên về trang 1 → để local `useState`, không persist.

---

## 12. So sánh với QLVB thật

Mở `frontend/src/pages/documents/incoming/IncomingDocumentListPage.tsx` của QLVB:

| Khía cạnh | QLVB (IncomingDocumentListPage) | Bài 7 (TaskListPage) |
|---|---|---|
| Bảng | `@mui/x-data-grid` (DataGrid pro: sort, resize, server-side) | `<Table>` tự viết (bài 6) — đủ dùng, nhẹ |
| Filter | nhiều: status tab + loại VB + ngày + cơ quan + search | 1 tab status + 1 search |
| Search | debounce + đôi khi nút "Tìm" | debounce thuần |
| Phân trang | server-side, page 0/1-based tuỳ component | server-side (mock), mapping 0↔1 thủ công |
| Data fetching | React Query (`useQuery`, cache key theo params) hoặc store | Zustand store + `useEffect` |
| State filter | thường gom trong 1 object `filterState` (giống `types/features/task.ts`) | tách `search/statusTab/page/pageSize` |

→ Bài 7 là **subset ~25%** của list page thật trong QLVB: bỏ DataGrid, bỏ React Query, gộp filter. Nhưng **3 vấn đề cốt lõi giống hệt**: debounce search, reset page khi đổi filter, và mapping page 0↔1-based. Nắm chắc 3 thứ này là làm được list page bất kỳ.

---

## 13. Khi nào sang bài 8?

Khi mọi checkbox mục 10 đã tick, và bạn:

- Hiểu vì sao debounce dùng `debouncedSearch` trong dep, không phải `search`.
- Giải thích được mapping page 0-based ↔ 1-based và chỉ ra chỗ `+1` trong code.
- Biết 3 handler nào phải `setPage(0)` và tại sao.

Bài 8 sẽ làm **trang tạo task** với form thật:

- `pages/tasks/TaskCreatePage.tsx` dùng **React Hook Form + Zod** (`npm i react-hook-form zod @hookform/resolvers`).
- Zod schema validate `title` (bắt buộc), `description`, `due_date`.
- `register` field, hiển thị `errors.title?.message`, nút Lưu `disabled` khi `isSubmitting`.
- onSubmit gọi `useTaskStore().createTask(...)` rồi điều hướng về list.
- Dùng `todayISODate()` (đã tạo ở bài 7) cho input `type="date"`.

Báo tôi "xong bài 7" để tôi viết tiếp `bai-08-form-rhf-zod.md`.

---

**Bài 7 — phiên bản 2026-06-08.**
