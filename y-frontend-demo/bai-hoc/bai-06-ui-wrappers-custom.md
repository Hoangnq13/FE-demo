# Bài 6 — UI wrappers tự build

> **Thời lượng**: ~75 phút.
> **Mục tiêu**: Hiểu **vì sao** phải bọc wrapper quanh component MUI thay vì dùng trực tiếp; tự build 4 component dùng lại nhiều nhất trong app: `StatusChip`, `CustomTextField` (forwardRef bọc MUI TextField), `ConfirmDialog` (controlled dialog), và `Table<T>` (generic mini table có loading/empty state + onRowClick). Nắm 3 kỹ thuật React quan trọng: `forwardRef`, **generic component** `<T,>`, và **controlled component**.
> **Map QLVB**: `frontend/src/components/ui/CustomTextField.tsx`, `frontend/src/components/ui/Table.tsx`, `frontend/src/components/ui/ConfirmDialog.tsx`.

---

## 0. Tại sao phải tự bọc wrapper? (đọc kỹ — đây là tư duy cốt lõi)

MUI đã cho sẵn `<TextField>`, `<Chip>`, `<Dialog>`, `<Table>`. Vậy tại sao QLVB (và bài này) vẫn tạo thêm 1 lớp `components/ui/` bọc lại?

Vì **3 lý do** sau:

### 0.1. Đồng bộ style + default props ở **một chỗ**

Trong app QLVB, mọi ô input đều phải:

- `fullWidth` (chiếm hết chiều ngang form),
- `size="small"` (gọn, đúng mật độ enterprise),
- `variant="outlined"` (có viền).

Nếu dùng `<TextField>` trực tiếp, bạn phải gõ lại `fullWidth size="small" variant="outlined"` ở **mọi** chỗ — 50 form là 50 lần lặp. Quên 1 chỗ → ô input lệch kích thước so với các ô khác.

→ Bọc `<CustomTextField>` set sẵn default 1 lần. Mọi nơi chỉ cần `<CustomTextField label="..." />`.

### 0.2. Đổi 1 lần → áp toàn app

Giả sử 6 tháng sau sếp yêu cầu "đổi tất cả input sang `variant="filled"`". Nếu dùng `<TextField>` trực tiếp → sửa 50 file. Nếu dùng `<CustomTextField>` → sửa **1 dòng** trong wrapper, toàn app đổi theo.

Đây chính là lý do `theme` (bài 2) và `wrapper` (bài này) bổ trợ nhau: theme lo **style chung cho mọi component cùng loại**, wrapper lo **default props + logic riêng của app**.

### 0.3. Gắn thêm logic app-specific mà MUI không có

Ví dụ `<Table>` của MUI rất "thô" — không có loading spinner, không có empty state, không có `onRowClick`. Wrapper `Table<T>` của ta thêm sẵn 3 thứ đó → page nào dùng cũng có ngay.

> **Quy tắc QLVB**: component MUI nào dùng ở **≥3 chỗ** với cùng 1 bộ config → bọc wrapper trong `components/ui/`. Dùng 1 lần thì gọi MUI trực tiếp.

→ Bài 6 build 4 wrapper, dùng xuyên suốt từ bài 7 (list page) đến bài 9 (detail page).

---

## 1. `StatusChip` — wrapper đơn giản nhất (khởi động)

Đây là wrapper "dễ nhất" để làm quen tư duy: map 1 giá trị `status` → 1 `<Chip>` có label + màu đúng, **không** phải nhớ label/màu ở mỗi chỗ render.

Tạo `src/components/ui/StatusChip.tsx`:

```tsx
import Chip from '@mui/material/Chip'
import type { TaskStatus } from '@/types/entities/task'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@/constants/task'

interface Props {
  status: TaskStatus
}

export function StatusChip({ status }: Props) {
  return <Chip size="small" label={TASK_STATUS_LABELS[status]} color={TASK_STATUS_COLORS[status]} />
}
```

### Giải thích

- Component nhận **đúng 1 prop** `status: TaskStatus` (`'todo' | 'in_progress' | 'done'` — từ bài 3).
- `TASK_STATUS_LABELS[status]` → tra label tiếng Việt (`'Chưa làm'`, `'Đang làm'`, `'Hoàn thành'`) từ `constants/task.ts` (bài 3). Không hard-code chuỗi trong JSX.
- `TASK_STATUS_COLORS[status]` → tra màu Chip MUI (`'default' | 'warning' | 'success'`). Cũng từ constants.
- `size="small"` — đồng bộ với mật độ nhỏ của app.

→ **Giá trị**: ở list page và detail page, ta chỉ viết `<StatusChip status={task.status} />`. Logic "status nào ra label/màu gì" nằm gọn 1 chỗ. Đổi màu `done` từ `success` sang khác → chỉ sửa `TASK_STATUS_COLORS` trong constants.

> **Lưu ý type**: vì `TASK_STATUS_LABELS` và `TASK_STATUS_COLORS` đều khai kiểu `Record<TaskStatus, ...>` (bài 3), TypeScript đảm bảo bạn không quên status nào. Thêm status mới mà chưa khai màu → đỏ ngay tại constants.

---

## 2. `CustomTextField` — bọc MUI TextField bằng `forwardRef`

Đây là wrapper **quan trọng nhất** vì nó liên quan trực tiếp tới React Hook Form (RHF) ở bài 8.

Tạo `src/components/ui/CustomTextField.tsx`:

```tsx
import { forwardRef } from 'react'
import TextField from '@mui/material/TextField'
import type { TextFieldProps } from '@mui/material/TextField'

export type CustomTextFieldProps = TextFieldProps

export const CustomTextField = forwardRef<HTMLDivElement, CustomTextFieldProps>(
  function CustomTextField(props, ref) {
    return <TextField fullWidth size="small" variant="outlined" ref={ref} {...props} />
  },
)
```

### 2.1. Default props — `fullWidth size="small" variant="outlined"`

3 prop này được set **trước** `{...props}`:

```tsx
<TextField fullWidth size="small" variant="outlined" ref={ref} {...props} />
```

- Vì `{...props}` đặt **sau** nên người dùng vẫn **override được**: `<CustomTextField size="medium" />` → `size` cuối cùng là `medium`. Đây là mẹo "default có thể ghi đè": default đứng trước, spread props đứng sau.
- Nếu để `{...props}` trước rồi `fullWidth` sau → default sẽ **luôn thắng**, không override được. Thứ tự quan trọng.

### 2.2. `export type CustomTextFieldProps = TextFieldProps`

- Ta **kế thừa toàn bộ** prop của MUI TextField (`label`, `error`, `helperText`, `type`, `placeholder`, `onChange`, ...). Không phải khai lại từng cái.
- Nhờ vậy `<CustomTextField>` dùng y hệt `<TextField>` về API, chỉ khác là có sẵn 3 default + có thể gắn thêm logic sau này.

### 2.3. Tại sao cần `forwardRef`? (mấu chốt cho RHF)

React **không** truyền `ref` xuống component con tự động như prop thường. Nếu bạn viết:

```tsx
function CustomTextField(props) {
  return <TextField {...props} />
}
// rồi ai đó dùng: <CustomTextField ref={someRef} />
```

→ `ref` **bị nuốt mất**, không tới được `<TextField>` bên trong. React cảnh báo "Function components cannot be given refs".

`forwardRef` giải quyết đúng việc này: nó cho component nhận `ref` làm **đối số thứ 2** (`(props, ref)`) rồi ta tự chuyển tiếp xuống: `<TextField ref={ref} ... />`.

**Vì sao RHF cần ref?** Khi bài 8 dùng `register('title')`, RHF trả về một object có `ref` để:

- Lấy giá trị field khi submit,
- **Focus** vào ô input đầu tiên bị lỗi validate.

Nếu wrapper không `forwardRef`, RHF sẽ không nhận được DOM node → mất khả năng focus-on-error, và một số tính năng uncontrolled bị hỏng.

### 2.4. Vì sao generic type là `HTMLDivElement` mà không phải `HTMLInputElement`?

```tsx
forwardRef<HTMLDivElement, CustomTextFieldProps>(...)
```

- MUI `<TextField>` là component **phức hợp**: bên ngoài là một `<div>` (FormControl), bên trong mới có `<input>`. `ref` của TextField trỏ tới **div bao ngoài**, nên type là `HTMLDivElement`.
- Nếu muốn ref tới chính ô `<input>` thì phải dùng `inputRef` (prop riêng của MUI), không phải `ref`. RHF khi làm việc với MUI thường dùng pattern `Controller` (bài 8) nên chi tiết này không gây vướng — nhưng hiểu để không khai nhầm type.

### 2.5. Vì sao đặt tên hàm `function CustomTextField(props, ref)`?

```tsx
forwardRef<...>(
  function CustomTextField(props, ref) { ... }  // ← có tên, không phải arrow ẩn danh
)
```

- Đặt tên cho hàm bên trong `forwardRef` giúp **React DevTools** hiển thị đúng tên component thay vì `ForwardRef`. Debug dễ hơn nhiều.

---

## 3. `ConfirmDialog` — controlled dialog

Dùng cho hành động nguy hiểm (xóa task ở bài 9). Đây là ví dụ điển hình của **controlled component**.

Tạo `src/components/ui/ConfirmDialog.tsx`:

```tsx
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

interface Props {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmText = 'Xác nhận', cancelText = 'Hủy', loading = false, onConfirm, onCancel,
}: Props) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>{cancelText}</Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>{confirmText}</Button>
      </DialogActions>
    </Dialog>
  )
}
```

### 3.1. Controlled component là gì?

`ConfirmDialog` **không tự quản lý** trạng thái đóng/mở của chính nó. Nó nhận `open` từ ngoài và báo ngược ra qua `onConfirm` / `onCancel`. **Cha** mới là người giữ state.

```tsx
// Ở page cha:
const [confirmOpen, setConfirmOpen] = useState(false)

<Button color="error" onClick={() => setConfirmOpen(true)}>Xóa</Button>

<ConfirmDialog
  open={confirmOpen}
  title="Xóa task"
  message="Bạn chắc chắn muốn xóa task này? Hành động không thể hoàn tác."
  onCancel={() => setConfirmOpen(false)}
  onConfirm={async () => {
    await deleteTask(id)
    setConfirmOpen(false)
  }}
/>
```

→ Dialog chỉ là "tấm gương" phản chiếu state của cha. Cha bật `open=true` thì hiện, gọi `onCancel` thì cha set lại `false`.

### 3.2. Vì sao controlled tốt hơn để dialog tự quản state?

- Cha **chủ động** quyết định khi nào mở/đóng (vd: chỉ đóng sau khi xóa thành công).
- Logic nghiệp vụ (`deleteTask`, điều hướng) nằm ở cha — đúng chỗ. Dialog chỉ lo phần hiển thị, **dumb component**, dùng lại được cho mọi loại xác nhận.
- Dễ test: truyền `open={true}` là thấy ngay, không cần mô phỏng click.

### 3.3. Các prop đáng chú ý

| Prop | Vai trò |
|---|---|
| `open` | Boolean điều khiển hiện/ẩn — do cha giữ. |
| `onConfirm` / `onCancel` | Callback báo ngược ra cha. Bắt buộc. |
| `confirmText` / `cancelText` | Có default (`'Xác nhận'` / `'Hủy'`) — optional, override khi cần. |
| `loading` | Khi đang gọi API xóa → disable cả 2 nút, tránh double-click / đóng giữa chừng. |
| `onClose={onCancel}` của `<Dialog>` | Click ra ngoài hoặc nhấn Esc → coi như hủy. |

- `maxWidth="xs" fullWidth` — dialog nhỏ gọn, phù hợp hộp xác nhận (không cần to).
- Nút confirm để `color="error" variant="contained"` — màu đỏ cảnh báo vì hành động phá hủy.

> **Default param trong destructuring**: `confirmText = 'Xác nhận'` ngay trong destructure props là cách set default cho prop optional gọn nhất, không cần `defaultProps` (đã deprecated với function component).

---

## 4. `Table<T>` — generic mini table (phần khó & hay nhất)

Đây là wrapper "đắt giá" nhất: 1 component table dùng cho **mọi** loại dữ liệu (task, user, document...) nhờ **generic** `<T>`.

Tạo `src/components/ui/Table.tsx`:

```tsx
import type { ReactNode } from 'react'
import MuiTable from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  width?: number | string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  emptyText?: string
  onRowClick?: (row: T) => void
}

export function Table<T>({ columns, rows, rowKey, loading = false, emptyText = 'Không có dữ liệu', onRowClick }: Props<T>) {
  return (
    <TableContainer component={Paper}>
      <MuiTable size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key} sx={{ fontWeight: 600, width: c.width }}>{c.header}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Typography sx={{ textAlign: 'center', py: 3 }} color="text.secondary">{emptyText}</Typography>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={rowKey(row)}
                hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((c) => (
                  <TableCell key={c.key}>{c.render(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </MuiTable>
    </TableContainer>
  )
}
```

### 4.1. Generic component `<T>` — table dùng cho mọi entity

```tsx
export function Table<T>({ ... }: Props<T>) { ... }
```

- `<T>` là **type tham số**. Khi dùng với `Task[]` → `T = Task`; dùng với `User[]` → `T = User`. Một component, mọi loại dữ liệu.
- `rows: T[]` — mảng dữ liệu kiểu `T`.
- `rowKey: (row: T) => string` — hàm lấy key duy nhất cho mỗi dòng (vd `(t) => t.id`). React cần key ổn định để render list.
- `render: (row: T) => ReactNode` trong `Column<T>` — **đây là chìa khóa**: thay vì table tự đoán cách hiển thị, **cha** truyền hàm render cho từng cột. Cột muốn hiện gì thì render nấy.

### 4.2. Prop `render` — vì sao linh hoạt hơn `field: string`

Nhiều table đơn giản chỉ nhận `field: 'title'` rồi tự lấy `row.title`. Cách đó **không** render được:

- `<StatusChip>` cho cột status,
- `formatDate(row.due_date)` cho cột hạn,
- một `<Button>` "Sửa" trong cột thao tác.

Với `render: (row) => ReactNode`, **cha toàn quyền** trả về bất cứ JSX nào:

```tsx
const columns: Column<Task>[] = [
  { key: 'title', header: 'Tiêu đề', render: (t) => t.title },
  { key: 'status', header: 'Trạng thái', render: (t) => <StatusChip status={t.status} /> },
  { key: 'due', header: 'Hạn', render: (t) => formatDate(t.due_date) },
  { key: 'created', header: 'Ngày tạo', render: (t) => formatDateTime(t.created_at) },
]
```

→ Table chỉ lo **khung** (head/body/loading/empty), cha lo **nội dung từng ô**. Tách bạch trách nhiệm.

### 4.3. `colSpan` cho dòng loading / empty — chi tiết hay quên

```tsx
<TableCell colSpan={columns.length}>
```

- Khi loading hoặc rỗng, ta render **1 dòng duy nhất** chứa spinner / text "Không có dữ liệu".
- Nhưng table có nhiều cột → 1 cell phải **trải hết chiều ngang**. `colSpan={columns.length}` báo cell này chiếm đúng số cột hiện có.
- Quên `colSpan` → cell chỉ chiếm 1 cột, spinner lệch sang trái, layout vỡ. Đây là lỗi rất phổ biến.

### 4.4. Ba trạng thái render — thứ tự ưu tiên

Table render theo **đúng thứ tự** (toán tử 3 ngôi lồng nhau):

| Điều kiện | Hiển thị |
|---|---|
| `loading === true` | Spinner căn giữa (`CircularProgress`) — **ưu tiên cao nhất** |
| `rows.length === 0` | Text empty (`emptyText`, default `'Không có dữ liệu'`) |
| còn lại | Map `rows` ra các dòng thật |

- Loading **phải kiểm trước** empty: lúc đang tải, `rows` cũng đang rỗng → nếu kiểm empty trước sẽ chớp chữ "Không có dữ liệu" rồi mới ra data. Sai UX.

### 4.5. `onRowClick` — optional, đổi cả con trỏ chuột

```tsx
onClick={onRowClick ? () => onRowClick(row) : undefined}
sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
```

- Nếu cha truyền `onRowClick` → dòng click được + con trỏ thành bàn tay (`pointer`).
- Không truyền → `onClick` là `undefined` (không gắn handler thừa) + con trỏ thường (`default`).
- `hover` prop của `<TableRow>` cho hiệu ứng đổi nền khi rê chuột — gợi ý "click được".

→ Ở bài 7, list page truyền `onRowClick={(t) => navigate('/tasks/' + t.id)}` để click dòng vào trang chi tiết.

---

## 5. Render thử 4 component trong `App.tsx`

Trước khi build page thật (bài 7+), ta **render tạm** trong `App.tsx` để mắt thấy chúng hoạt động.

Tạm thay nội dung `App.tsx`:

```tsx
import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { StatusChip } from '@/components/ui/StatusChip'
import { CustomTextField } from '@/components/ui/CustomTextField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Table } from '@/components/ui/Table'
import type { Column } from '@/components/ui/Table'
import type { Task } from '@/types/entities/task'
import { formatDate } from '@/utils/date'

const demoRows: Task[] = [
  { id: '1', title: 'Đọc tài liệu React', description: '', status: 'todo', due_date: '2026-06-10', created_at: '', updated_at: '' },
  { id: '2', title: 'Setup MUI theme', description: '', status: 'in_progress', due_date: null, created_at: '', updated_at: '' },
  { id: '3', title: 'Viết bài học', description: '', status: 'done', due_date: '2026-06-01', created_at: '', updated_at: '' },
]

const columns: Column<Task>[] = [
  { key: 'title', header: 'Tiêu đề', render: (t) => t.title },
  { key: 'status', header: 'Trạng thái', render: (t) => <StatusChip status={t.status} /> },
  { key: 'due', header: 'Hạn', render: (t) => formatDate(t.due_date) },
]

function App() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <Box sx={{ p: 4 }}>
      <Stack spacing={3} sx={{ maxWidth: 720 }}>
        <Typography variant="h4">Demo UI wrappers (bài 6)</Typography>

        <Stack direction="row" spacing={1}>
          <StatusChip status="todo" />
          <StatusChip status="in_progress" />
          <StatusChip status="done" />
        </Stack>

        <CustomTextField label="Tiêu đề" placeholder="Nhập tiêu đề task..." />

        <Stack direction="row" spacing={1}>
          <Button variant="contained" color="error" onClick={() => setOpen(true)}>
            Mở ConfirmDialog
          </Button>
          <Button variant="outlined" onClick={() => setLoading((v) => !v)}>
            Toggle loading table
          </Button>
        </Stack>

        <Table columns={columns} rows={demoRows} rowKey={(t) => t.id} loading={loading} />

        <Table columns={columns} rows={[]} rowKey={(t) => t.id} emptyText="Chưa có task nào" />
      </Stack>

      <ConfirmDialog
        open={open}
        title="Xóa task"
        message="Bạn chắc chắn muốn xóa task này?"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </Box>
  )
}

export default App
```

Chạy:

```powershell
npm run dev
```

→ Bạn sẽ thấy:

- 3 chip màu: xám (todo), cam (in_progress), xanh (done).
- 1 ô input outlined, nhỏ gọn, chiếm full chiều ngang.
- Nút "Mở ConfirmDialog" → bật hộp xác nhận đỏ; nhấn Hủy/Xác nhận hoặc click ra ngoài đều đóng.
- Nút "Toggle loading table" → table đầu chuyển qua lại giữa spinner và 3 dòng dữ liệu.
- Table thứ 2 luôn hiện "Chưa có task nào" (empty state) trải hết bề ngang.

> **Quan trọng**: đây chỉ là code **tạm để xem**. Sau khi xác nhận 4 component chạy đúng, bạn có thể giữ hoặc dọn `App.tsx` — bài 7 sẽ thay bằng router + page thật. Đừng commit demo này như code chính thức.

---

## 6. Sai lầm thường gặp (đọc kỹ!)

### 6.1. Quên `forwardRef` → RHF mất ref

Viết `CustomTextField` như function thường rồi truyền `ref` vào:

```tsx
function CustomTextField(props) {           // ❌ không forwardRef
  return <TextField {...props} />
}
```

→ React cảnh báo `"Function components cannot be given refs"`, và ở bài 8 RHF không focus được ô lỗi, register có thể không lấy đúng value. **Luôn** dùng `forwardRef` cho wrapper input.

### 6.2. Cú pháp generic `<T>` bị hiểu nhầm là JSX trong file `.tsx`

Trong file `.tsx`, viết `<T>` ở **hàm** có thể bị TypeScript/JSX hiểu là một thẻ JSX `<T>` chưa đóng → lỗi parse. Spec dùng dạng `function Table<T>(...)` (khai sau tên hàm) nên an toàn. Nhưng nếu bạn viết arrow function generic, **phải** thêm dấu phẩy:

```tsx
const Table = <T,>(props: Props<T>) => { ... }   // ✅ <T,> có dấu phẩy
const Table = <T>(props: Props<T>) => { ... }    // ❌ .tsx hiểu <T> là JSX tag
```

→ Dấu phẩy `<T,>` báo cho compiler "đây là type param, không phải JSX". Đây là lỗi kinh điển khi viết generic component trong `.tsx`.

### 6.3. Quên `colSpan` ở dòng loading/empty

```tsx
<TableCell>...</TableCell>                      // ❌ chỉ chiếm 1 cột → lệch trái
<TableCell colSpan={columns.length}>...</TableCell>  // ✅ trải hết bảng
```

### 6.4. Spread props **trước** default → không override được

```tsx
<TextField {...props} fullWidth size="small" />  // ❌ default luôn thắng
<TextField fullWidth size="small" {...props} />  // ✅ user override được
```

→ Default đứng **trước**, `{...props}` đứng **sau**.

### 6.5. Kiểm `rows.length === 0` trước `loading`

```tsx
{rows.length === 0 ? <Empty/> : loading ? <Spinner/> : ...}  // ❌ chớp "rỗng" khi đang tải
{loading ? <Spinner/> : rows.length === 0 ? <Empty/> : ...}  // ✅ loading ưu tiên
```

### 6.6. Để Dialog tự giữ state `open`

Nếu cho `ConfirmDialog` tự `useState(open)` bên trong → cha không kiểm soát được lúc nào đóng (vd muốn chỉ đóng sau khi API xóa xong). Controlled (`open` từ cha) là đúng pattern.

### 6.7. Hard-code label/màu status trong JSX

```tsx
<Chip label={status === 'done' ? 'Hoàn thành' : '...'} />  // ❌ lặp logic khắp nơi
<StatusChip status={status} />                              // ✅ tra constants 1 chỗ
```

---

## 7. Checkpoint Bài 6

- [ ] Tạo `src/components/ui/StatusChip.tsx` — nhận `status`, tra label + màu từ constants
- [ ] Tạo `src/components/ui/CustomTextField.tsx` — dùng `forwardRef`, default `fullWidth size="small" variant="outlined"`
- [ ] `CustomTextField` đặt `{...props}` **sau** default để override được
- [ ] Tạo `src/components/ui/ConfirmDialog.tsx` — controlled (`open` + `onConfirm` + `onCancel`), nút confirm màu `error`
- [ ] Tạo `src/components/ui/Table.tsx` — generic `Table<T>`, có `Column<T>`, `render`, `rowKey`
- [ ] Table có cả **loading** (spinner) và **empty** (text) state, dùng `colSpan={columns.length}`
- [ ] Table `onRowClick` optional + đổi `cursor` theo có/không handler
- [ ] Render tạm 4 component trong `App.tsx`, `npm run dev` thấy chip màu / input / dialog / table chạy
- [ ] Toggle loading thấy spinner; table rỗng thấy empty text trải hết bề ngang
- [ ] Không còn warning ref ở console; generic viết đúng cú pháp `.tsx`

---

## 8. Câu hỏi tự kiểm tra

1. Nêu 3 lý do nên bọc wrapper `CustomTextField` thay vì dùng `<TextField>` MUI trực tiếp.
2. `forwardRef` giải quyết vấn đề gì? Nếu bỏ nó, RHF ở bài 8 sẽ mất tính năng nào?
3. Vì sao generic type của `CustomTextField` là `HTMLDivElement` chứ không phải `HTMLInputElement`?
4. Trong file `.tsx`, vì sao arrow function generic phải viết `<T,>` (có dấu phẩy) thay vì `<T>`?
5. `colSpan={columns.length}` ở dòng loading/empty để làm gì? Quên thì sao?
6. "Controlled component" trong `ConfirmDialog` nghĩa là gì? Ai giữ state `open`, và tại sao nên như vậy?

**Đáp án:**

1. (a) Đồng bộ default props (`fullWidth size="small" variant="outlined"`) ở 1 chỗ, không lặp ở mọi form. (b) Đổi 1 lần trong wrapper → áp toàn app (vd đổi `variant` cho mọi input chỉ sửa 1 dòng). (c) Gắn thêm logic/style app-specific mà MUI không có sẵn. Tóm lại: tránh lặp + dễ maintain + nhất quán.

2. React không tự truyền `ref` xuống function component như prop thường. `forwardRef` cho component nhận `ref` làm đối số thứ 2 rồi chuyển tiếp xuống `<TextField ref={ref}>`. Bỏ nó → RHF không lấy được DOM node → mất khả năng **focus vào ô input đầu tiên bị lỗi validate** (và pattern uncontrolled bị hỏng), kèm cảnh báo "Function components cannot be given refs".

3. Vì MUI `<TextField>` là component phức hợp: ngoài cùng là `<div>` (FormControl), `ref` trỏ tới div bao ngoài chứ không phải ô `<input>` bên trong. Muốn ref tới chính `<input>` phải dùng prop `inputRef`, không phải `ref`.

4. Trong `.tsx`, `<T>` đứng một mình bị JSX hiểu nhầm là một thẻ JSX chưa đóng → lỗi parse. Thêm dấu phẩy `<T,>` báo compiler đây là **type parameter**, không phải JSX tag. (Hàm khai kiểu `function Table<T>()` thì không gặp vấn đề này.)

5. Khi loading/empty ta render 1 dòng duy nhất chứa spinner/text; `colSpan={columns.length}` cho cell đó trải hết toàn bộ cột của bảng. Quên → cell chỉ chiếm 1 cột, nội dung lệch trái, layout bảng vỡ.

6. Controlled = component **không tự quản** state hiện/ẩn, mà nhận `open` từ ngoài và báo ngược qua `onConfirm`/`onCancel`. **Cha** giữ state `open` (qua `useState`). Tốt vì cha chủ động quyết định khi nào đóng (vd chỉ đóng sau khi xóa thành công), logic nghiệp vụ nằm ở cha, dialog thành dumb component dùng lại được cho mọi xác nhận, và dễ test.

---

## 9. So sánh với QLVB thật

Mở `frontend/src/components/ui/` của QLVB:

| Khía cạnh | QLVB | Bài 6 |
|---|---|---|
| Số wrapper | ~15-20 (CustomTextField, CustomSelect, CustomAutocomplete, Table, ConfirmDialog, StatusChip theo nhiều entity...) | 4 (StatusChip, CustomTextField, ConfirmDialog, Table) |
| `CustomTextField` | forwardRef + tích hợp sẵn `error`/`helperText` từ RHF, có cả masked input | forwardRef + default props (đủ ý chính) |
| Table | thường dùng MUI **DataGrid** (sort/filter/resize cột built-in) hoặc table generic phức tạp hơn | mini `Table<T>` tự build, đủ loading/empty/onRowClick |
| ConfirmDialog | thường qua **hook/context** `useConfirm()` gọi imperative (`await confirm(...)`) | controlled bằng prop `open` (dễ hiểu hơn cho người mới) |
| StatusChip | nhiều loại theo trạng thái văn bản (`draft`, `signed`, `archived`...) | 1 loại cho 3 status task |

→ Bài này là **subset** UI layer của QLVB — đúng pattern (wrapper + generic + controlled), nhỏ gọn đủ để nắm tư duy, không bị ngợp. Khi đọc code QLVB thật bạn sẽ nhận ra ngay 3 kỹ thuật học ở đây.

---

## 10. Khi nào sang bài 7?

Khi 10 checkbox phía trên đều tick — tức 4 component đã chạy đúng trong `App.tsx` demo. Bài 7 sẽ làm:

- Dựng **TaskListPage** thật: kết hợp `Table<Task>` + `<Tabs>` lọc theo status + `<CustomTextField>` search.
- Dùng `useDebounce` (bài tiện ích) để search không gọi API mỗi ký tự.
- `<TablePagination>` MUI nối với `pageSize` / `total` từ store (bài 5).
- `formatDate` / `formatDateTime` (date-fns) render cột Hạn / Ngày tạo — `npm i date-fns` ở bài này.
- `onRowClick` điều hướng sang trang chi tiết.

Báo tôi "xong bài 6" để tôi viết tiếp `bai-07-list-page-search-filter.md`.

---

**Bài 6 — phiên bản 2026-06-08.**
