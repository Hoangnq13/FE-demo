# Bài 9 — TaskDetailPage: chi tiết, mark done, delete

> **Thời lượng**: ~75 phút.
> **Mục tiêu**: Viết trang xem chi tiết 1 task theo `id` trên URL. Học `useParams` để đọc route param, fetch dữ liệu theo `id` trong `useEffect` với dependency `[id]`, dựng pattern **loading / error / empty** chuẩn, tái sử dụng `<ConfirmDialog>` (bài 6) cho hành động xóa, và xử lý đúng chuyện **setState sau khi component unmount** bằng cờ `ignore`.
> **Map QLVB**: `frontend/src/pages/documents/incoming/IncomingDocumentDetailPage.tsx` — trang chi tiết văn bản đến (xem nội dung, đổi trạng thái, xóa).

---

## 0. Bối cảnh — vì sao cần trang chi tiết riêng?

Ở bài 7 ta đã có `TaskListPage` (bảng danh sách). Một dòng trong bảng chỉ hiện vài cột tóm tắt: tiêu đề, trạng thái, hạn, ngày tạo. Nhưng người dùng cần **xem đầy đủ** một task (mô tả dài, thời gian cập nhật) và **thao tác** trên nó (đánh dấu hoàn thành, xóa).

QLVB cũng vậy: danh sách văn bản đến là một `DataGrid`, click một dòng → mở `IncomingDocumentDetailPage` hiển thị toàn bộ metadata + nội dung + các nút hành động (chuyển xử lý, thu hồi, xóa...). Bài này dựng **bản rút gọn** của pattern đó.

Trang chi tiết khác trang danh sách ở 3 điểm cốt lõi:

1. Nó nhận **một tham số động** từ URL (`/tasks/:id`) — đây là chỗ `useParams` xuất hiện.
2. Nó fetch **một bản ghi theo id**, không phải danh sách → dùng `taskApi.getById(id)`.
3. Nó có nhiều **trạng thái UI** phải xử lý tử tế: đang tải, lỗi (không tìm thấy task), tải xong.

> **Lưu ý quan trọng về thứ tự bài**: `useParams` và `navigate` đến từ thư viện `react-router-dom`, mà ta **chưa cài và chưa cấu hình router** (việc đó nằm ở **bài 10**). Trong bài này ta **giả định** router đã có route `/tasks/:id` trỏ tới `TaskDetailPage`. Code dưới đây import từ `react-router-dom` như thể đã sẵn sàng; nếu bạn chạy ngay bây giờ TypeScript sẽ báo thiếu module — đó là **bình thường**, sẽ hết sau bài 10. Mục tiêu bài 9 là viết đúng *logic trang chi tiết*, không phải dựng router.

---

## 1. `useParams` — đọc tham số động trên URL

React Router cho phép khai báo route có **đoạn động** bằng dấu hai chấm: `/tasks/:id`. Khi người dùng vào `/tasks/abc123`, router khớp route đó và đặt `id = 'abc123'`.

Trong component, ta lấy giá trị này bằng hook `useParams`:

```tsx
import { useParams } from 'react-router-dom'

const { id } = useParams<{ id: string }>()
```

### Giải thích

- `useParams()` trả về một object chứa **tất cả** param động của route hiện tại. Với route `/tasks/:id` thì object là `{ id: '...' }`. Tên key (`id`) phải **trùng** với tên đặt sau dấu `:` lúc khai báo route ở bài 10.
- Generic `<{ id: string }>` chỉ để TypeScript biết shape — nhưng **lưu ý**: React Router luôn coi param là `string | undefined`, vì về lý thuyết route có thể không có param đó. Do đó `id` ta nhận về có kiểu `string | undefined`. Ta phải **kiểm tra** `id` trước khi gọi API.

| Khía cạnh | Giá trị |
|---|---|
| Nguồn dữ liệu | Đoạn `:id` trên URL |
| Kiểu trả về | `string \| undefined` |
| Khi nào undefined | URL không khớp param (hiếm, nhưng TS bắt ta xử lý) |
| Tên key | Phải trùng tên khai báo route (`:id`) |

> So với việc nhận `id` qua **prop**: trang chi tiết không có component cha truyền `id` xuống — nó được router render trực tiếp khi URL khớp. Nguồn dữ liệu duy nhất là URL, nên `useParams` là cách đúng.

---

## 2. State cục bộ: `task` / `loading` / `error`

Trang chi tiết chỉ cần dữ liệu của **một** task, dùng **một lần** trên trang này. Không cần đẩy vào store Zustand (store là cache cho *danh sách*). Vì vậy ta dùng `useState` cục bộ — đơn giản, sống và chết cùng component.

```tsx
const [task, setTask] = useState<Task | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
```

### Vì sao 3 state này?

- `task: Task | null` — dữ liệu chính. `null` nghĩa là "chưa có" (đang tải hoặc lỗi).
- `loading: boolean` — khởi tạo `true` vì ngay khi vào trang ta đã bắt đầu fetch. Dùng để hiện spinner.
- `error: string | null` — `null` = không lỗi; chuỗi = thông điệp lỗi để hiển thị.

Ba state này tạo thành bộ "ba trạng thái kinh điển" của mọi màn hình fetch dữ liệu. Bài 7 (danh sách) đã dùng bộ tương tự nhưng qua store; ở đây ta làm thủ công để bạn thấy rõ cơ chế.

> **Vì sao không qua store?** Spec ghi rõ: detail **không bắt buộc** qua store. Lý do: dữ liệu chi tiết chỉ phục vụ riêng trang này, không cần chia sẻ giữa nhiều component. Đẩy mọi thứ vào store làm store phình to và thêm dependency không cần thiết. Quy tắc: **state cục bộ trừ khi cần chia sẻ**.

---

## 3. Fetch theo `id` trong `useEffect` (dependency `[id]`)

Đây là trái tim của bài. Ta muốn: mỗi khi vào trang (hoặc `id` đổi) → gọi `taskApi.getById(id)` → cập nhật state.

```tsx
useEffect(() => {
  if (!id) {
    setError('Thiếu id task')
    setLoading(false)
    return
  }

  let ignore = false

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await taskApi.getById(id!)
      if (!ignore) {
        setTask(res.data)
      }
    } catch (e) {
      if (!ignore) {
        setError(e instanceof Error ? e.message : 'Lỗi tải chi tiết task')
      }
    } finally {
      if (!ignore) {
        setLoading(false)
      }
    }
  }

  load()

  return () => {
    ignore = true
  }
}, [id])
```

### 3.1. Vì sao dependency là `[id]`?

`useEffect` chạy lại mỗi khi **giá trị trong mảng dependency đổi**. Ta để `[id]` nghĩa là: "fetch lại mỗi khi `id` đổi".

- Lần đầu mount: effect chạy → fetch task theo `id` hiện tại.
- Người dùng điều hướng từ `/tasks/A` sang `/tasks/B` mà **không unmount** component (React Router tái dùng cùng component, chỉ đổi param): `id` đổi từ `A` → `B`, effect chạy lại, fetch task B. **Nếu quên `id` trong dependency**, trang vẫn hiện task A cũ — một bug rất hay gặp.

> Nếu để `[]` (mảng rỗng), effect chỉ chạy **một lần** lúc mount, không bao giờ refetch khi `id` đổi → màn hình "đơ" dữ liệu cũ. Nếu **không truyền** mảng, effect chạy **mỗi render** → vòng lặp fetch vô tận. → Luôn liệt kê đúng dependency.

### 3.2. Kiểm tra `id` trước

`id` có kiểu `string | undefined`. Ta chặn sớm: nếu không có `id` thì set lỗi và dừng, không gọi API với `undefined`. Sau bước check này, trong `load()` ta dùng `id!` (non-null assertion) vì đã chắc chắn có giá trị.

### 3.3. Hàm `load()` bên trong effect

Ta định nghĩa `async function load()` **bên trong** effect rồi gọi ngay. Lý do: callback của `useEffect` **không được là async** (nó phải trả về hàm cleanup hoặc `undefined`, không phải Promise). Nên ta bọc phần async vào một hàm con.

- `setLoading(true)` + `setError(null)` ở đầu: reset trạng thái trước mỗi lần fetch (quan trọng khi `id` đổi — phải xóa lỗi cũ).
- `try / catch / finally`: bắt lỗi từ `getById` (nhớ ở spec, `getById` **throw** `Error('Không tìm thấy task')` nếu id sai). `finally` luôn tắt `loading` dù thành công hay lỗi.

### 3.4. Cờ `ignore` — chống setState sau unmount

Đây là điểm tinh tế nhất bài. Tình huống: người dùng vào trang chi tiết → API mất ~300ms (mock delay) → **trong lúc chờ**, người dùng bấm "Quay lại" → component **unmount**. Khi Promise resolve sau đó, code gọi `setTask(...)` trên một component **đã chết**.

React sẽ cảnh báo (ở các phiên bản cũ) hoặc đơn giản là phí công + có thể gây bug logic. Cách xử lý chuẩn:

1. Khai một biến `let ignore = false` trong phạm vi effect.
2. Hàm cleanup (`return () => { ignore = true }`) chạy khi component unmount **hoặc** trước khi effect chạy lại (khi `id` đổi).
3. Trước mỗi `setState` trong nhánh async, kiểm tra `if (!ignore)`. Nếu effect đã bị "vô hiệu hóa" thì bỏ qua.

```tsx
return () => {
  ignore = true   // đánh dấu: kết quả fetch này không còn quan trọng
}
```

> **Cơ chế đóng gói (closure)**: mỗi lần effect chạy, nó tạo một biến `ignore` mới. Hàm cleanup "nhớ" đúng biến `ignore` của lần chạy đó. Khi `id` đổi từ A→B: cleanup của lần A đặt `ignoreA = true` (nên kết quả fetch A bị bỏ), rồi effect chạy lại với `ignoreB = false` cho fetch B. Nhờ vậy ta tránh được cả **setState sau unmount** lẫn **race condition** (fetch A về sau fetch B mà ghi đè dữ liệu B).

| Tình huống | Không có `ignore` | Có `ignore` |
|---|---|---|
| Unmount giữa lúc fetch | setState trên component chết | bỏ qua, an toàn |
| `id` đổi nhanh A→B, A về sau | dữ liệu A ghi đè B (sai) | A bị `ignoreA=true` chặn |

---

## 4. Pattern render: loading → error → empty → data

Sau khi có 3 state, phần render đi theo **thứ tự ưu tiên** rõ ràng. Không trộn lẫn.

```tsx
if (loading) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress />
    </Box>
  )
}

if (error) {
  return (
    <Box sx={{ py: 4 }}>
      <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      <Button variant="outlined" onClick={() => navigate('/tasks')}>
        Quay lại danh sách
      </Button>
    </Box>
  )
}

if (!task) {
  return (
    <Box sx={{ py: 4 }}>
      <Typography color="text.secondary">Không có dữ liệu task.</Typography>
    </Box>
  )
}
```

### Giải thích thứ tự

1. **`loading`**: đang tải → spinner, không quan tâm gì khác.
2. **`error`**: lỗi → báo lỗi + lối thoát (nút quay lại). Đây cũng là trường hợp "id không tồn tại" vì `getById` throw.
3. **`!task`** (empty): hiếm khi rơi vào đây (loading xong, không lỗi, mà vẫn `null`) — nhưng để TypeScript yên tâm và phòng hờ, ta xử lý. Sau khối này, TS **thu hẹp kiểu** (`narrowing`): từ điểm này trở xuống `task` chắc chắn là `Task`, không còn `null`.

> Đây là pattern **early return** (return sớm): mỗi trạng thái xử lý xong thì return luôn, phần code chính không phải lồng vào `if` nhiều tầng. Dễ đọc hơn nhiều so với một `return` khổng lồ chứa ternary chồng chéo.

---

## 5. Render nội dung chi tiết

Khi đã chắc chắn có `task`, render đầy đủ thông tin. Dùng `formatDate` cho `due_date` và `formatDateTime` cho `created_at` / `updated_at` (từ `@/utils/date` — bài 7).

```tsx
const isDone = task.status === 'done'

return (
  <Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
      <Typography variant="h4" sx={{ flex: 1 }}>{task.title}</Typography>
      <StatusChip status={task.status} />
    </Box>

    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Mô tả
      </Typography>
      <Typography variant="body1" sx={{ mb: 3, whiteSpace: 'pre-wrap' }}>
        {task.description || '— Không có mô tả —'}
      </Typography>

      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Field label="Hạn hoàn thành" value={formatDate(task.due_date)} />
        <Field label="Ngày tạo" value={formatDateTime(task.created_at)} />
        <Field label="Cập nhật lần cuối" value={formatDateTime(task.updated_at)} />
      </Box>
    </Paper>

    {/* các nút hành động — mục 6 */}
  </Box>
)
```

Trong đó `Field` là một helper nhỏ hiển thị cặp nhãn–giá trị (định nghĩa cuối file, mục 9):

```tsx
function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  )
}
```

### Giải thích vài điểm

- `<StatusChip status={task.status} />` — tái dùng component đã viết ở bài về UI components. Nó tự tra nhãn + màu từ `TASK_STATUS_LABELS` / `TASK_STATUS_COLORS`.
- `task.description || '— Không có mô tả —'` — mô tả có thể là chuỗi rỗng (`''`), khi đó hiện placeholder.
- `whiteSpace: 'pre-wrap'` — giữ xuống dòng người dùng đã gõ trong mô tả.
- `formatDate(task.due_date)` tự trả `'—'` nếu `due_date` là `null` (xem `utils/date.ts`), nên không cần check thủ công.

---

## 6. Nút hành động: hoàn thành / xóa / quay lại

```tsx
<Box sx={{ display: 'flex', gap: 1 }}>
  {!isDone && (
    <Button
      variant="contained"
      color="success"
      onClick={handleMarkDone}
      disabled={actionLoading}
    >
      Đánh dấu hoàn thành
    </Button>
  )}
  <Button
    variant="outlined"
    color="error"
    onClick={() => setConfirmOpen(true)}
    disabled={actionLoading}
  >
    Xóa
  </Button>
  <Button variant="text" onClick={() => navigate('/tasks')}>
    Quay lại
  </Button>
</Box>
```

State phụ cho hành động:

```tsx
const [actionLoading, setActionLoading] = useState(false)
const [confirmOpen, setConfirmOpen] = useState(false)
```

### 6.1. "Đánh dấu hoàn thành" — ẩn nếu đã done

Nút này chỉ render khi `!isDone` (`task.status !== 'done'`). Đã hoàn thành rồi thì không có gì để đánh dấu.

```tsx
async function handleMarkDone() {
  if (!id) return
  setActionLoading(true)
  try {
    await markDone(id)
    await reload()           // refetch để lấy trạng thái + updated_at mới
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Không đánh dấu được')
  } finally {
    setActionLoading(false)
  }
}
```

- `markDone(id)` có thể gọi **qua store** (`useTaskStore().markDone`) **hoặc** thẳng `taskApi.markDone(id)` — spec cho phép cả hai. Ở đây ta dùng store cho nhất quán (store đã có action `markDone`), nhưng dùng `taskApi.markDone(id)` cũng đúng.
- Sau khi đổi trạng thái, ta **refetch** (`reload()`) thay vì tự sửa state cục bộ. Xem mục 7 về optimistic vs refetch.

### 6.2. "Xóa" — mở `ConfirmDialog`

**Không bao giờ** xóa ngay khi bấm. Bấm "Xóa" chỉ **mở dialog xác nhận** (`setConfirmOpen(true)`). Việc xóa thật nằm trong `onConfirm` của dialog.

```tsx
<ConfirmDialog
  open={confirmOpen}
  title="Xóa task"
  message={`Bạn chắc chắn muốn xóa "${task.title}"? Hành động này không thể hoàn tác.`}
  confirmText="Xóa"
  loading={actionLoading}
  onConfirm={handleDelete}
  onCancel={() => setConfirmOpen(false)}
/>
```

```tsx
async function handleDelete() {
  if (!id) return
  setActionLoading(true)
  try {
    await deleteTask(id)
    navigate('/tasks')       // xóa xong → rời trang chi tiết
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Không xóa được')
    setActionLoading(false)  // chỉ tắt loading khi LỖI (thành công thì đã điều hướng)
  }
}
```

- `<ConfirmDialog>` chính là component tái sử dụng từ **bài 6**. Ta không viết lại dialog mỗi nơi cần xác nhận — đó là cả mục đích của nó. Props khớp đúng interface trong spec: `open`, `title`, `message`, `confirmText`, `loading`, `onConfirm`, `onCancel`.
- `loading={actionLoading}` làm hai nút trong dialog bị disable khi đang xóa → tránh double-click gọi xóa 2 lần.
- Sau khi xóa thành công, ta `navigate('/tasks')`. **Không** cần `setActionLoading(false)` ở nhánh thành công vì component sắp unmount; chỉ cần tắt loading ở nhánh lỗi (vì lúc đó vẫn ở lại trang).

### 6.3. "Quay lại"

`onClick={() => navigate('/tasks')}` — quay về danh sách. (Spec yêu cầu về `/tasks`, không dùng `navigate(-1)` ở trang này để hành vi đoán trước được.)

---

## 7. Optimistic update vs refetch

Sau khi `markDone`, có 2 cách cập nhật giao diện:

| Cách | Mô tả | Ưu | Nhược |
|---|---|---|---|
| **Optimistic** | Sửa luôn state cục bộ (`setTask({ ...task, status: 'done' })`) trước/không cần đợi server | Phản hồi tức thì | Phải tự đoán dữ liệu (vd `updated_at` mới sai); nếu server lỗi phải rollback |
| **Refetch** | Gọi lại `getById(id)` lấy dữ liệu thật từ server | Luôn đúng 100%, đơn giản | Có thêm một vòng request (~300ms) |

Ở bài này ta chọn **refetch** vì đơn giản và luôn chính xác — đặc biệt `updated_at` do server (mock) tự sinh, ta không đoán được. Ta tách logic fetch ra một hàm `reload()` dùng chung:

```tsx
async function reload() {
  if (!id) return
  const res = await taskApi.getById(id)
  setTask(res.data)
}
```

> Optimistic update hợp với app cần cảm giác "snappy" (mạng chậm, thao tác nhiều). Với một internal tool như QLVB/task-app, refetch rõ ràng và ít bug hơn — ưu tiên đúng trước, nhanh sau.

---

## 8. Ghép toàn bộ — `pages/tasks/TaskDetailPage.tsx`

Đây là file hoàn chỉnh. Mọi import dùng alias `@/`.

```tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

import type { Task } from '@/types/entities/task'
import { taskApi } from '@/services/api/taskApi'
import { useTaskStore } from '@/store/taskStore'
import { StatusChip } from '@/components/ui/StatusChip'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatDate, formatDateTime } from '@/utils/date'

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // actions lấy từ store (markDone/deleteTask đã có sẵn ở bài 5)
  const markDone = useTaskStore((s) => s.markDone)
  const deleteTask = useTaskStore((s) => s.deleteTask)

  // state cục bộ cho chi tiết
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // state cho hành động
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // ---- Fetch theo id ----
  useEffect(() => {
    if (!id) {
      setError('Thiếu id task')
      setLoading(false)
      return
    }

    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await taskApi.getById(id!)
        if (!ignore) setTask(res.data)
      } catch (e) {
        if (!ignore) {
          setError(e instanceof Error ? e.message : 'Lỗi tải chi tiết task')
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [id])

  // refetch dùng lại sau khi mark done
  async function reload() {
    if (!id) return
    const res = await taskApi.getById(id)
    setTask(res.data)
  }

  async function handleMarkDone() {
    if (!id) return
    setActionLoading(true)
    try {
      await markDone(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đánh dấu được')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setActionLoading(true)
    try {
      await deleteTask(id)
      navigate('/tasks')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xóa được')
      setActionLoading(false)
    }
  }

  // ---- Render: loading / error / empty / data ----
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="outlined" onClick={() => navigate('/tasks')}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  if (!task) {
    return (
      <Box sx={{ py: 4 }}>
        <Typography color="text.secondary">Không có dữ liệu task.</Typography>
      </Box>
    )
  }

  const isDone = task.status === 'done'

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h4" sx={{ flex: 1 }}>{task.title}</Typography>
        <StatusChip status={task.status} />
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          Mô tả
        </Typography>
        <Typography variant="body1" sx={{ mb: 3, whiteSpace: 'pre-wrap' }}>
          {task.description || '— Không có mô tả —'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Field label="Hạn hoàn thành" value={formatDate(task.due_date)} />
          <Field label="Ngày tạo" value={formatDateTime(task.created_at)} />
          <Field label="Cập nhật lần cuối" value={formatDateTime(task.updated_at)} />
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1 }}>
        {!isDone && (
          <Button
            variant="contained"
            color="success"
            onClick={handleMarkDone}
            disabled={actionLoading}
          >
            Đánh dấu hoàn thành
          </Button>
        )}
        <Button
          variant="outlined"
          color="error"
          onClick={() => setConfirmOpen(true)}
          disabled={actionLoading}
        >
          Xóa
        </Button>
        <Button variant="text" onClick={() => navigate('/tasks')}>
          Quay lại
        </Button>
      </Box>

      <ConfirmDialog
        open={confirmOpen}
        title="Xóa task"
        message={`Bạn chắc chắn muốn xóa "${task.title}"? Hành động này không thể hoàn tác.`}
        confirmText="Xóa"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  )
}
```

---

## 9. Đọc lại các quyết định trong file

- **`useTaskStore((s) => s.markDone)`** — chọn lọc đúng action cần (selector), không lấy cả store. Tránh component re-render khi state khác trong store đổi.
- **Helper `Field`** đặt cuối file, ngoài component chính. Component nhỏ chỉ dùng nội bộ thì không cần file riêng.
- **`taskApi.getById` được import trực tiếp** cho việc fetch detail (không qua store), còn `markDone`/`deleteTask` qua store. Đây là sự pha trộn có chủ đích theo spec: detail cục bộ, mutation dùng action sẵn có.
- **Mọi `setState` async đều nằm sau check `ignore` hoặc dẫn tới điều hướng** — không có chỗ nào setState "mù" sau await.

---

## 10. Sai lầm thường gặp (đọc kỹ!)

### 10.1. setState sau khi component unmount

Triệu chứng: bấm vào task rồi quay lại thật nhanh, console cảnh báo hoặc dữ liệu nhảy lung tung khi `id` đổi nhanh.
→ Nguyên nhân: Promise của `getById` resolve sau khi component đã unmount, code vẫn gọi `setTask`. Giải pháp: cờ `ignore` + cleanup (`return () => { ignore = true }`) như mục 3.4. **Mọi** `setState` trong nhánh async phải bọc `if (!ignore)`.

### 10.2. Quên `id` trong dependency `[id]`

```tsx
useEffect(() => { load() }, [])      // ❌ chỉ fetch 1 lần, id đổi không refetch
useEffect(() => { load() }, [id])    // ✅ refetch khi id đổi
```

Triệu chứng: đi từ `/tasks/A` sang `/tasks/B` (qua link nội bộ) nhưng màn hình vẫn hiện task A. Vì React Router tái dùng cùng component, chỉ `id` đổi, mà effect không chạy lại.

### 10.3. Xóa ngay không xác nhận

```tsx
<Button onClick={() => deleteTask(id)}>Xóa</Button>   // ❌ lỡ tay là mất task
```

→ Luôn mở `<ConfirmDialog>` trước. Xóa là hành động **không hoàn tác**. Bấm "Xóa" chỉ `setConfirmOpen(true)`; xóa thật ở `onConfirm`.

### 10.4. `async` trực tiếp trong `useEffect`

```tsx
useEffect(async () => { ... }, [id])   // ❌ effect không được trả Promise
```

→ Bọc trong hàm con `async function load() {...}` rồi gọi `load()`. Callback của effect chỉ được trả về hàm cleanup hoặc `undefined`.

### 10.5. Không reset `error`/`loading` khi `id` đổi

Nếu task A lỗi rồi chuyển sang B, mà không `setError(null)` + `setLoading(true)` ở đầu `load()`, màn hình B sẽ "kẹt" thông báo lỗi của A. → Luôn reset trạng thái ở đầu mỗi lần fetch.

### 10.6. Tự đoán `updated_at` thay vì refetch

```tsx
setTask({ ...task, status: 'done', updated_at: new Date().toISOString() })  // ⚠️ lệch giờ server
```

→ `updated_at` do server (mock) sinh. Optimistic kiểu này dễ lệch. Bài này dùng `reload()` cho chắc.

---

## 11. Checkpoint Bài 9

- [ ] `TaskDetailPage` đọc `id` bằng `useParams<{ id: string }>()` và check `id` trước khi fetch
- [ ] `useEffect` gọi `taskApi.getById(id)` với dependency `[id]`
- [ ] Có cờ `ignore` + cleanup `return () => { ignore = true }`, mọi `setState` async bọc `if (!ignore)`
- [ ] Hàm fetch là `async function load()` *bên trong* effect (không `async` trực tiếp ở callback effect)
- [ ] Render đúng thứ tự: `loading` (CircularProgress) → `error` (Alert + nút quay lại) → `!task` (empty) → data
- [ ] Hiển thị `title`, `<StatusChip>`, `description`, `formatDate(due_date)`, `formatDateTime(created_at)`, `formatDateTime(updated_at)`
- [ ] Nút "Đánh dấu hoàn thành" **ẩn** khi `status === 'done'`; bấm → `markDone(id)` → `reload()`
- [ ] Nút "Xóa" mở `<ConfirmDialog>`; xác nhận → `deleteTask(id)` → `navigate('/tasks')`
- [ ] `<ConfirmDialog>` nhận `loading={actionLoading}` để disable nút khi đang xóa
- [ ] Nút "Quay lại" → `navigate('/tasks')`
- [ ] Mọi import dùng alias `@/`

---

## 12. Câu hỏi tự kiểm tra

1. `useParams` trả về kiểu gì cho `id`, và vì sao phải check `id` trước khi gọi API?
2. Vì sao callback của `useEffect` không được khai báo `async`? Ta xử lý thế nào?
3. Cờ `ignore` giải quyết những vấn đề gì? (kể 2 vấn đề)
4. Nếu để dependency của `useEffect` là `[]` thay vì `[id]`, bug gì xảy ra khi điều hướng `/tasks/A` → `/tasks/B`?
5. Vì sao bài này chọn **refetch** sau `markDone` thay vì optimistic update?
6. Sau khi `deleteTask` thành công, vì sao **không** cần `setActionLoading(false)`, nhưng ở nhánh lỗi thì cần?

**Đáp án:**

1. `useParams` trả `id` kiểu `string | undefined` (router không đảm bảo param luôn tồn tại về mặt kiểu). Phải check vì gọi `getById(undefined)` là sai logic; sau khi check, dùng `id!` an toàn trong nhánh đã chắc có giá trị.

2. Vì `useEffect` chỉ chấp nhận giá trị trả về là **hàm cleanup** hoặc `undefined`. Hàm `async` luôn trả về một `Promise`, React sẽ hiểu nhầm Promise đó là cleanup → lỗi. Cách xử lý: định nghĩa `async function load()` bên trong effect rồi gọi `load()`, và trả về cleanup riêng (`return () => { ignore = true }`).

3. (a) **setState sau unmount**: nếu component đã rời đi mà Promise mới resolve, `if (!ignore)` chặn không setState trên component chết. (b) **Race condition khi `id` đổi nhanh**: cleanup của fetch cũ đặt `ignore = true`, nên kết quả fetch cũ về muộn không ghi đè dữ liệu của fetch mới.

4. Effect chỉ chạy một lần lúc mount, không chạy lại khi `id` đổi từ A→B (React Router tái dùng cùng component instance, chỉ đổi param). Kết quả: màn hình vẫn hiển thị dữ liệu task A dù URL đã là `/tasks/B`.

5. Vì `updated_at` (và trạng thái cuối) do server/mock sinh ra; optimistic phải tự đoán giá trị này → dễ lệch giờ và sai dữ liệu. Refetch lấy đúng dữ liệu thật, code đơn giản, không cần rollback khi lỗi. Đánh đổi là thêm ~300ms một request — chấp nhận được với internal tool.

6. Khi xóa thành công ta `navigate('/tasks')` → component sắp unmount, gọi `setActionLoading(false)` lúc đó là vô nghĩa (và có thể là setState sau unmount). Ở nhánh **lỗi** thì component vẫn ở lại trang chi tiết, nên phải tắt `actionLoading` để mở khóa lại các nút.

---

## 13. So sánh với QLVB thật

Mở `frontend/src/pages/documents/incoming/IncomingDocumentDetailPage.tsx`:

| Khía cạnh | QLVB | Bài 9 |
|---|---|---|
| Đọc param | `useParams` (`:documentId`) | `useParams` (`:id`) |
| Fetch detail | React Query (`useQuery(['doc', id])`) tự cache + chống race | `useEffect` + cờ `ignore` thủ công |
| Loading/error | `isLoading`, `isError` do React Query cấp | `loading`, `error` state tự quản |
| Trạng thái nghiệp vụ | nhiều: chuyển xử lý, thu hồi, ký số... | một: mark done |
| Xác nhận xóa | `ConfirmDialog` dùng chung toàn app | `ConfirmDialog` (bài 6) |
| Sau khi xóa | `navigate` về danh sách + invalidate query | `navigate('/tasks')` |

→ Điểm khác lớn nhất: QLVB dùng **React Query** lo hộ caching, refetch, race condition, loading/error. Bài này làm **thủ công** để bạn hiểu *bản chất* những gì React Query tự động hóa. Khi đã nắm cờ `ignore` + bộ ba `loading/error/data`, bạn sẽ hiểu ngay React Query đang giải bài toán nào và vì sao nó tồn tại.

---

## 14. Khi nào sang bài 10?

Khi toàn bộ checkbox ở mục 11 đã tick. Lưu ý `TaskDetailPage` hiện **chưa chạy được** vì thiếu router — đó là lý do bài tiếp theo tồn tại. Bài 10 sẽ làm:

- `npm i react-router-dom` và hiểu vì sao SPA cần client-side routing.
- Dựng `router/AppRouter.tsx`: route `/` → redirect `/tasks`; `/tasks` → `TaskListPage`; `/tasks/new` → `TaskCreatePage`; `/tasks/:id` → `TaskDetailPage`; `*` → `NotFoundPage`.
- Bọc tất cả trong `<MainLayout>` và wrap router trong `main.tsx` (bên trong `ThemeProvider`).
- Lúc đó `useParams`, `useNavigate`, `<RouterLink>` mới thực sự hoạt động → bài 9 chạy được trọn vẹn.

Báo tôi "xong bài 9" để tôi viết tiếp `bai-10-router-layout.md`.

---

**Bài 9 — phiên bản 2026-06-08.**
