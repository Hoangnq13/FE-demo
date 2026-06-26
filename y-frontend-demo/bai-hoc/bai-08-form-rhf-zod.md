# Bài 8 — TaskCreatePage: RHF + Zod

> **Thời lượng**: ~90 phút.
> **Mục tiêu**: Hiểu vì sao dùng **React Hook Form (RHF)** thay vì controlled state thủ công, dùng **Zod** để khai báo validation schema, nối hai cái lại bằng `zodResolver`, và viết hoàn chỉnh `pages/tasks/TaskCreatePage.tsx` — form tạo task có validate, hiển thị lỗi, submit gọi store rồi điều hướng.
> **Map QLVB**: `frontend/src/pages/documents/incoming/IncomingDocumentCreatePage.tsx` (form tạo văn bản đến — cũng dùng RHF + Zod resolver y hệt pattern này).

---

## 0. Bối cảnh — form là chỗ "bẩn" nhất của FE

Form nghe đơn giản nhưng là nơi sinh ra nhiều bug nhất:

- State của từng input (value thay đổi liên tục khi gõ).
- Validate: bắt buộc, độ dài, định dạng, cross-field.
- Hiển thị lỗi đúng field, đúng lúc (khi blur? khi submit? khi gõ?).
- Trạng thái submit: đang gửi → disable nút, chống double-submit.
- Reset, default values, dirty checking.

Nếu tự quản bằng `useState` cho từng field, code phình rất nhanh và dễ sai. QLVB (và bài này) dùng cặp đôi chuẩn của hệ sinh thái React:

| Lib | Vai trò |
|---|---|
| **react-hook-form** | Quản lý state form + lifecycle (register input, submit, errors, isSubmitting). Tối ưu re-render. |
| **zod** | Khai báo **schema** validation kiểu TypeScript-first. 1 chỗ định nghĩa rule + type. |
| **@hookform/resolvers** | Cầu nối: biến Zod schema thành "resolver" mà RHF hiểu để validate. |

→ Đây là combo phổ biến nhất 2024-2026 cho form React, và đúng là combo QLVB đang dùng.

> **Lưu ý về `navigate`**: Bài này dùng `useNavigate()` của react-router (`navigate('/tasks')`, `navigate(-1)`). React Router được setup đầy đủ ở **bài 10**. Giống bài 7, ta **giả định** react-router đã có và import `useNavigate` bình thường — khi chưa setup router thì import sẽ đỏ, đó là chuyện bình thường, bài 10 sẽ xử lý. Có thể tạm thay bằng `console.log` nếu muốn chạy thử ngay.

---

## 1. Cài package

Trong `task-app/`:

```powershell
npm install react-hook-form zod @hookform/resolvers
```

### Giải thích từng package

| Package | Vai trò |
|---|---|
| `react-hook-form` | Core form library. Export `useForm`, `Controller`, types `SubmitHandler`, ... |
| `zod` | Schema validation. Export `z` (namespace để build schema: `z.object`, `z.string`, ...). |
| `@hookform/resolvers` | Adapter package. Ta dùng `@hookform/resolvers/zod` → hàm `zodResolver`. |

> **Lưu ý phiên bản**: `@hookform/resolvers` v3 đi với `react-hook-form` v7 và `zod` v3 — đây là combo ổn định nhất. Nếu npm kéo về `zod` v4 thì API cơ bản (`z.object`, `z.string().min`) vẫn giống, không ảnh hưởng bài này.

Cài xong, mở `package.json` xác nhận `"dependencies"` có 3 package mới.

---

## 2. Trước khi code — vì sao RHF thay vì controlled thủ công?

Đây là kiến thức cốt lõi của bài. Hiểu rồi thì code mới có nghĩa.

### 2.1. Cách "thủ công" (controlled) — và vấn đề của nó

Nếu không dùng RHF, ta sẽ viết:

```tsx
const [title, setTitle] = useState('')
const [description, setDescription] = useState('')
const [errors, setErrors] = useState<{ title?: string }>({})

<TextField value={title} onChange={(e) => setTitle(e.target.value)} />
```

Vấn đề:

- **Mỗi ký tự gõ vào → `setTitle` → component cha re-render**. Form 10 field thì gõ 1 field cũng render lại cả 10. Form lớn bắt đầu lag.
- Validate phải tự viết tay, tự set `errors`, tự clear khi gõ lại.
- `defaultValues`, reset, dirty, isSubmitting... tự lo hết.

→ Đây gọi là **controlled component**: React state là "nguồn sự thật", value của input luôn = state.

### 2.2. Cách RHF (uncontrolled, dựa trên `ref`)

RHF mặc định dùng input ở chế độ **uncontrolled**: nó gắn một `ref` vào input và **đọc value trực tiếp từ DOM** khi cần (lúc submit, lúc validate). React **không** giữ value trong state, nên gõ phím **không** trigger re-render component.

```tsx
const { register } = useForm()
<TextField {...register('title')} />
```

`register('title')` trả về một object `{ name, onChange, onBlur, ref }` mà ta spread vào input. RHF tự quản phần còn lại.

### 2.3. Bảng so sánh

| Tiêu chí | Controlled (`useState`) | RHF (uncontrolled) |
|---|---|---|
| Nguồn value | React state | DOM (qua `ref`) |
| Re-render khi gõ | Có (mỗi ký tự) | **Không** (mặc định) |
| Code lượng | Nhiều (mỗi field 1 state) | Ít (`register` 1 dòng) |
| Validate | Tự viết tay | Khai báo qua resolver/Zod |
| isSubmitting / errors | Tự quản | Có sẵn trong `formState` |
| Performance form lớn | Kém | Tốt |

→ **Quy tắc QLVB**: form luôn dùng RHF. Không tự `useState` cho từng input.

> Lưu ý: RHF vẫn cho phép dùng controlled khi cần (qua `Controller`) — xem mục 4. Nhưng text input thuần thì để uncontrolled (`register`) là tối ưu.

---

## 3. Viết Zod schema

Tạo file `pages/tasks/TaskCreatePage.tsx`. Trước hết là phần schema (đặt ngoài component, vì nó tĩnh, không cần tạo lại mỗi render):

```ts
import { z } from 'zod'

const taskSchema = z.object({
  title: z
    .string()
    .min(1, 'Bắt buộc nhập tiêu đề')
    .max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().max(1000, 'Mô tả tối đa 1000 ký tự').default(''),
  due_date: z.string().default(''),
})
```

### Giải thích từng dòng

| Đoạn | Ý nghĩa |
|---|---|
| `z.object({ ... })` | Khai báo schema cho 1 object (các field của form). |
| `z.string()` | Field này phải là chuỗi. |
| `.min(1, 'Bắt buộc nhập tiêu đề')` | Độ dài tối thiểu 1 → chuỗi rỗng `''` sẽ fail với message này. Đây là cách làm "required" cho string. |
| `.max(200, '...')` | Tối đa 200 ký tự. Message kèm theo hiển thị khi vượt. |
| `description ... .default('')` | Mô tả không bắt buộc; nếu thiếu giá trị, mặc định là `''`. Vẫn giới hạn `max(1000)`. |
| `due_date: z.string().default('')` | Hạn lưu dạng **chuỗi** (vì `<input type="date">` trả chuỗi `'yyyy-MM-dd'`). `''` = không có hạn. |

**Vì sao message tiếng Việt nằm ngay trong schema?** Vì Zod là **single source of truth** cho cả rule lẫn thông báo lỗi. RHF sẽ lấy đúng message này để hiển thị — không phải viết message ở chỗ khác.

### 3.1. `z.infer` — type tự suy ra từ schema

Zod cho phép suy ra TypeScript type từ schema:

```ts
type TaskFormValuesInferred = z.infer<typeof taskSchema>
// => { title: string; description: string; due_date: string }
```

Tiện ở chỗ: **schema và type luôn đồng bộ**, sửa schema thì type tự đổi.

**Nhưng** spec dự án đã định nghĩa sẵn type `TaskFormValues` ở `types/pages/task.ts`:

```ts
export interface TaskFormValues {
  title: string
  description: string
  due_date: string   // '' = không có hạn
}
```

→ **Quy ước bài này**: dùng `TaskFormValues` từ spec (cho nhất quán với các bài khác), KHÔNG dùng `z.infer`. Bạn có thể tự đối chiếu `z.infer<typeof taskSchema>` xem nó ra đúng `TaskFormValues` không (đúng là khớp) — đó là một cách kiểm tra schema viết chuẩn.

---

## 4. `register` vs `Controller` — khi nào dùng cái nào?

Trước khi viết component, cần nắm điểm này vì nó hay gây bug (xem mục Sai lầm).

### 4.1. `register` — cho input HTML "thật" (uncontrolled)

```tsx
<TextField {...register('title')} />
```

`register` hoạt động bằng cách gắn `ref` + `onChange`/`onBlur` vào một phần tử DOM **thật** (`<input>`, `<textarea>`, `<select>`). MUI `TextField` thực chất render ra `<input>` bên trong và forward các prop này xuống → `register` dùng được trực tiếp.

→ Dùng `register` cho: text input, textarea, native input (kể cả `type="date"`).

### 4.2. `Controller` — cho component "controlled-only"

Một số component KHÔNG expose `ref` tới DOM input, hoặc value/onChange của chúng không theo chuẩn DOM event. Ví dụ:

- **MUI `Select`** (value là prop, onChange trả event nhưng cấu trúc khác).
- **MUI `DatePicker`** (`@mui/x-date-pickers` — value là object `Date`, không phải string DOM).
- **MUI `Autocomplete`**, slider, switch tùy biến, các 3rd-party input.

Với chúng, ta bọc bằng `Controller`:

```tsx
<Controller
  name="status"
  control={control}
  render={({ field }) => (
    <Select {...field}>
      {/* options */}
    </Select>
  )}
/>
```

`Controller` biến field đó thành **controlled** và tự cấp `value` + `onChange` đúng kiểu component yêu cầu.

### 4.3. Bảng quyết định

| Component | Dùng gì | Lý do |
|---|---|---|
| `<TextField>` (text/textarea/date/number) | `register` | Render `<input>` thật, forward ref/onChange chuẩn DOM |
| MUI `<Select>` | `Controller` | value/onChange không theo chuẩn DOM input |
| MUI `<DatePicker>` | `Controller` | value là `Date` object, không phải string DOM |
| `<Autocomplete>`, `<Switch>` tùy biến | `Controller` | controlled-only |

→ **Bài này** chỉ có 3 text field (title, description, due_date dạng `type="date"`) nên **dùng `register` cho cả 3** — không cần `Controller`. Ta nhắc `Controller` để bạn biết khi nào cần (vd bài sau thêm trường status bằng `Select` thì phải dùng).

---

## 5. `useForm` + `zodResolver`

```ts
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TaskFormValues } from '@/types/pages/task'

const {
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
} = useForm<TaskFormValues>({
  resolver: zodResolver(taskSchema),
  defaultValues: { title: '', description: '', due_date: '' },
})
```

### Giải thích

- **`useForm<TaskFormValues>(...)`** — khởi tạo form, generic là kiểu dữ liệu form. Trả về một bộ "công cụ".
- **`resolver: zodResolver(taskSchema)`** — đây là cầu nối Zod ↔ RHF. Mỗi lần RHF cần validate, nó gọi resolver → resolver chạy `taskSchema.safeParse(values)` → trả về `{ values, errors }` theo format RHF hiểu. **Quên dòng này = form không validate gì cả** (lỗi rất hay gặp).
- **`defaultValues`** — giá trị khởi tạo. Quan trọng với uncontrolled form: RHF cần biết giá trị ban đầu để reset/so sánh dirty. Để `''` cho cả 3 (form rỗng).
- **`register`** — hàm để gắn input (mục 4).
- **`handleSubmit`** — wrapper: nó **validate trước**, chỉ gọi callback của ta nếu hợp lệ; nếu lỗi thì điền `errors` và không gọi callback.
- **`formState.errors`** — object lỗi theo field: `errors.title?.message` là message Zod đã khai báo.
- **`formState.isSubmitting`** — `true` trong lúc callback submit (async) đang chạy. Dùng để disable nút Lưu, chống double-submit.

### 5.1. `register` cho TextField type="date"

`due_date` là `<input type="date">`:

```tsx
<TextField
  type="date"
  label="Hạn hoàn thành"
  InputLabelProps={{ shrink: true }}
  {...register('due_date')}
/>
```

- `type="date"` → trình duyệt hiện date picker native, value trả về là chuỗi `'yyyy-MM-dd'` — **đúng định dạng** mà spec yêu cầu lưu, nên không cần convert format.
- `InputLabelProps={{ shrink: true }}` — với input date, label phải luôn "thu nhỏ" lên trên, nếu không nó đè lên placeholder ngày. Đây là tiểu tiết MUI cần nhớ với date/time input.

---

## 6. `onSubmit` — convert `''` → `null` rồi gọi store

```ts
import { useTaskStore } from '@/store/taskStore'
import { useNavigate } from 'react-router-dom'
import type { SubmitHandler } from 'react-hook-form'

const navigate = useNavigate()
const createTask = useTaskStore((s) => s.createTask)

const onSubmit: SubmitHandler<TaskFormValues> = async ({ title, description, due_date }) => {
  await createTask({
    title,
    description,
    due_date: due_date || null,
  })
  navigate('/tasks')
}
```

### Vì sao `TaskFormValues` toàn `string`, rồi convert `due_date '' → null` lúc submit?

Đây là điểm thiết kế quan trọng — đọc kỹ:

1. **HTML input chỉ làm việc với chuỗi.** `<input type="date">` không có khái niệm `null`; khi trống nó trả `''`. Nếu type form khai `due_date: string | null` thì RHF/HTML vẫn nhận `''`, sinh lệch type. → Form layer để **toàn string** cho khớp DOM.

2. **Nhưng entity `Task` (và API) cần `due_date: string | null`** — `null` nghĩa là "không có hạn". `''` không phải một ngày hợp lệ để lưu.

3. → Ta tách 2 tầng:
   - **Form values** (`TaskFormValues`): `due_date: string`, `''` = không có hạn.
   - **API payload** (`CreateTaskPayload`): `due_date?: string | null`.
   - **Chỗ chuyển đổi nằm ở `onSubmit`**: `due_date: due_date || null`. Nếu chuỗi rỗng (`''` là falsy) → `null`; nếu có ngày → giữ nguyên chuỗi `'yyyy-MM-dd'`.

→ Đây là pattern chung: **form dùng kiểu thân thiện với input (string), convert sang kiểu nghiệp vụ tại ranh giới submit.** Đừng để `null`/`Date`/`number` lọt vào form state.

> `createTask` trả về `Promise<Task>` (theo spec store). Vì `onSubmit` là `async` và ta `await`, `isSubmitting` sẽ tự `true` trong suốt thời gian chờ (~300ms mock delay) rồi về `false`. Không cần tự quản loading.

---

## 7. Ráp toàn bộ `pages/tasks/TaskCreatePage.tsx`

Code đầy đủ — gõ lại hoặc copy, rồi đọc giải thích bên dưới:

```tsx
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import type { SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'

import type { TaskFormValues } from '@/types/pages/task'
import { useTaskStore } from '@/store/taskStore'

// Schema validate — đặt ngoài component (tĩnh, không tạo lại mỗi render)
const taskSchema = z.object({
  title: z
    .string()
    .min(1, 'Bắt buộc nhập tiêu đề')
    .max(200, 'Tiêu đề tối đa 200 ký tự'),
  description: z.string().max(1000, 'Mô tả tối đa 1000 ký tự').default(''),
  due_date: z.string().default(''),
})

export function TaskCreatePage() {
  const navigate = useNavigate()
  const createTask = useTaskStore((s) => s.createTask)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: '', description: '', due_date: '' },
  })

  const onSubmit: SubmitHandler<TaskFormValues> = async ({ title, description, due_date }) => {
    await createTask({
      title,
      description,
      due_date: due_date || null,
    })
    navigate('/tasks')
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Tạo task mới
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 600 }}>
        {/* handleSubmit validate trước, chỉ gọi onSubmit nếu hợp lệ */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={2}>
            <TextField
              label="Tiêu đề"
              required
              error={!!errors.title}
              helperText={errors.title?.message}
              {...register('title')}
            />

            <TextField
              label="Mô tả"
              multiline
              minRows={3}
              error={!!errors.description}
              helperText={errors.description?.message}
              {...register('description')}
            />

            <TextField
              type="date"
              label="Hạn hoàn thành"
              InputLabelProps={{ shrink: true }}
              error={!!errors.due_date}
              helperText={errors.due_date?.message}
              {...register('due_date')}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
              <Button
                type="button"
                variant="outlined"
                onClick={() => navigate(-1)}
                disabled={isSubmitting}
              >
                Hủy
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : 'Lưu'}
              </Button>
            </Box>
          </Stack>
        </form>
      </Paper>
    </Box>
  )
}
```

### Giải thích các điểm quan trọng

#### `<form onSubmit={handleSubmit(onSubmit)} noValidate>`

- `handleSubmit(onSubmit)` — RHF bọc `onSubmit`: chạy validate (qua resolver) → nếu OK gọi `onSubmit(values)`, nếu lỗi thì điền `errors` và **không** gọi `onSubmit`.
- `noValidate` — tắt validate mặc định của trình duyệt (vì ta đã validate bằng Zod). Tránh trình duyệt hiện bong bóng lỗi tiếng Anh riêng.

#### Hiển thị lỗi: `error` + `helperText`

```tsx
error={!!errors.title}
helperText={errors.title?.message}
```

- `error={!!errors.title}` — `!!` ép sang boolean: có lỗi → `true` → TextField viền đỏ.
- `helperText={errors.title?.message}` — hiện đúng message Zod đã khai (`'Bắt buộc nhập tiêu đề'`). `?.` để khi không lỗi thì `undefined` (không hiện gì).

> Đây là cách RHF + MUI bắt tay: `formState.errors` (RHF) → `error`/`helperText` (MUI). Mỗi field một cặp.

#### Thứ tự spread `{...register('title')}` ở CUỐI

`{...register('title')}` đặt **sau** các prop khác. Vì register trả về `onChange`, `onBlur`, `name`, `ref` — nếu đặt trước rồi viết `onChange` thủ công phía sau, prop của bạn sẽ **ghi đè** register → hỏng. Quy ước an toàn: register spread cuối cùng.

#### Nút Hủy vs Lưu

| Nút | `type` | Hành vi |
|---|---|---|
| Hủy | `type="button"` | `onClick={() => navigate(-1)}` — quay lại trang trước. `type="button"` để **không** trigger submit form. |
| Lưu | `type="submit"` | Trigger `<form onSubmit>`. `disabled={isSubmitting}` chống double-click khi đang gửi. |

> **Cẩn thận**: trong `<form>`, button không khai `type` mặc định là `type="submit"`. Nút Hủy **phải** ghi rõ `type="button"`, nếu không bấm Hủy lại submit form → bug khó chịu.

#### `isSubmitting` đổi label nút

`{isSubmitting ? 'Đang lưu...' : 'Lưu'}` — phản hồi trực quan cho user trong lúc chờ mock API 300ms.

---

## 8. Luồng dữ liệu tổng quát

```
User gõ → TextField (uncontrolled, RHF đọc qua ref)
   │
   ▼ bấm "Lưu" (type=submit)
handleSubmit  ── validate bằng zodResolver(taskSchema) ──┐
   │ hợp lệ                                  lỗi ──► điền formState.errors
   ▼                                                 (TextField viền đỏ + helperText)
onSubmit(values)
   │  convert due_date: '' → null
   ▼
useTaskStore().createTask(payload)  → taskApi.create → localStorage
   │  (isSubmitting = true suốt quá trình)
   ▼
navigate('/tasks')   → quay về danh sách
```

---

## 9. Sai lầm thường gặp (đọc kỹ!)

### 9.1. Quên `resolver: zodResolver(...)`

Triệu chứng: gõ form rỗng vẫn submit được, `errors` luôn rỗng, schema "vô tác dụng".
→ Nguyên nhân: tạo schema nhưng **quên truyền `resolver`** vào `useForm`. RHF không tự biết schema; phải nối qua `zodResolver`. Kiểm tra `useForm({ resolver: zodResolver(taskSchema), ... })`.

### 9.2. Dùng controlled `useState` song song với RHF

```tsx
// ❌ SAI — vừa register vừa tự quản state
const [title, setTitle] = useState('')
<TextField value={title} onChange={(e) => setTitle(e.target.value)} {...register('title')} />
```

→ Hai cơ chế "đánh nhau": value bị controlled cố định nên register không cập nhật được, hoặc onChange ghi đè lẫn nhau. **Chọn một**: đã dùng RHF thì để register lo hết, **không** thêm `value`/`onChange`/`useState` cho field đó. Cần đọc value để render chỗ khác thì dùng `watch('title')`, không phải `useState`.

### 9.3. Dùng `register` cho MUI `Select` (hoặc DatePicker)

```tsx
// ❌ SAI — Select không nhận register kiểu này
<Select {...register('status')}>...</Select>
```

→ MUI `Select` không forward `ref` tới native input theo chuẩn → register "trượt", value không vào form, không validate được. **Phải dùng `Controller`** (mục 4.2). Triệu chứng điển hình: chọn xong submit thấy field đó luôn rỗng/undefined.

### 9.4. Quên convert `due_date '' → null`

→ Gửi `due_date: ''` xuống API. Entity `Task.due_date` là `string | null` nên `''` là giá trị "rác" (không phải ngày, không phải null). Khi render `formatDate('')` sẽ ra `'—'` (may mà util đã handle), nhưng dữ liệu vẫn sai bản chất. Luôn `due_date || null` tại submit.

### 9.5. Nút Hủy quên `type="button"`

→ Trong `<form>`, button mặc định `type="submit"`. Bấm Hủy lại chạy validate + submit. Luôn ghi rõ `type="button"` cho nút không-submit.

### 9.6. Spread `{...register(...)}` rồi vẫn viết `onChange` riêng phía sau

→ `onChange` của bạn ghi đè `onChange` của register → RHF không nhận được giá trị. Đặt register **cuối**, hoặc nếu cần cả hai thì compose thủ công (hiếm khi cần).

---

## 10. Checkpoint Bài 8

- [ ] `npm install react-hook-form zod @hookform/resolvers` chạy không lỗi, `package.json` có 3 package
- [ ] File `pages/tasks/TaskCreatePage.tsx` tồn tại, export `TaskCreatePage`
- [ ] Có `taskSchema = z.object({ title, description, due_date })` với đúng rule (title min1/max200, description max1000 default '', due_date string default '')
- [ ] `useForm<TaskFormValues>` có `resolver: zodResolver(taskSchema)` + `defaultValues` đủ 3 field
- [ ] 3 `TextField` dùng `{...register(...)}` (title, description, due_date type="date")
- [ ] Submit rỗng → field Tiêu đề viền đỏ + hiện "Bắt buộc nhập tiêu đề"
- [ ] Nhập >200 ký tự tiêu đề → hiện lỗi max
- [ ] `onSubmit` convert `due_date: due_date || null` rồi gọi `useTaskStore().createTask(...)`
- [ ] Submit hợp lệ → `navigate('/tasks')` (hoặc console.log nếu chưa có router)
- [ ] Nút Hủy có `type="button"` + `navigate(-1)`; nút Lưu `type="submit"` + `disabled={isSubmitting}`
- [ ] Trong lúc submit, nút Lưu disable + đổi chữ "Đang lưu..."

---

## 11. Câu hỏi tự kiểm tra

1. Vì sao RHF (uncontrolled) ít re-render hơn controlled `useState`? Cơ chế là gì?
2. `zodResolver` đóng vai trò gì giữa Zod và RHF? Quên nó thì điều gì xảy ra?
3. Khi nào dùng `register`, khi nào phải dùng `Controller`? Cho 2 ví dụ component cần `Controller`.
4. Vì sao `TaskFormValues` để `due_date: string` thay vì `string | null`, và convert ở đâu?
5. `formState.isSubmitting` dùng để làm gì, và vì sao ta không cần tự `useState` cho loading?
6. `z.infer<typeof taskSchema>` cho ra type gì? Vì sao bài này vẫn dùng `TaskFormValues` từ spec?

**Đáp án:**

1. Controlled giữ value trong React state → mỗi ký tự gõ gọi `setState` → re-render component (và toàn bộ field con). RHF gắn `ref` vào input và đọc value trực tiếp từ DOM khi cần (submit/validate), **không** lưu vào state → gõ phím không trigger re-render. Form càng nhiều field, lợi ích càng rõ.

2. `zodResolver(schema)` biến một Zod schema thành "resolver function" theo interface mà RHF hiểu. Mỗi lần validate, RHF gọi resolver → resolver chạy schema parse trên values → trả `{ values, errors }` đúng format RHF. Quên truyền `resolver` vào `useForm` → RHF không validate gì, `errors` luôn rỗng, form rỗng vẫn submit được.

3. **`register`**: cho input HTML thật (text/textarea/native `<input>`, kể cả MUI `TextField` vì nó render `<input>` và forward ref) — chế độ uncontrolled. **`Controller`**: cho component controlled-only không forward ref/onChange chuẩn DOM. Ví dụ: MUI `Select`, MUI `DatePicker` (`@mui/x-date-pickers`), `Autocomplete`.

4. Vì HTML input chỉ làm việc với chuỗi — `<input type="date">` khi trống trả `''`, không có khái niệm `null`. Để form khớp DOM, `TaskFormValues` để toàn `string`. Còn entity/API cần `null` nghĩa là "không có hạn", nên ta convert tại **`onSubmit`**: `due_date: due_date || null` (`''` falsy → `null`).

5. `isSubmitting` là `true` trong suốt thời gian callback submit (async) đang chạy. Dùng để disable nút Lưu (chống double-submit) và đổi label "Đang lưu...". Vì `onSubmit` là `async` và ta `await createTask(...)`, RHF tự bật/tắt `isSubmitting` quanh quá trình đó → không cần tự quản `useState` loading.

6. Cho ra `{ title: string; description: string; due_date: string }` — đúng bằng `TaskFormValues`. Bài này vẫn dùng `TaskFormValues` từ `types/pages/task.ts` để nhất quán với toàn bộ các bài khác (type là single source dùng chung ở store/page); có thể đối chiếu `z.infer` để xác nhận schema viết khớp type.

---

## 12. So sánh với QLVB thật

Mở `frontend/src/pages/documents/incoming/IncomingDocumentCreatePage.tsx` của QLVB:

| Khía cạnh | QLVB | Bài 8 |
|---|---|---|
| Form lib | react-hook-form + zod + zodResolver | Giống hệt |
| Số field | ~12-15 (số hiệu, ngày, loại VB, độ khẩn, cơ quan ban hành, file đính kèm, ...) | 3 (title, description, due_date) |
| `Controller` | Dùng nhiều (Select loại VB, DatePicker, Autocomplete cơ quan, Upload file) | Không cần (toàn TextField) |
| Schema | Tách ra file `*.schema.ts` riêng, có cross-field validate | Inline trong page (đủ nhỏ) |
| Submit | Gọi service tạo VB, upload file, rồi navigate + toast | Gọi `createTask` rồi navigate |
| Convert value | Date object → ISO string, Select id → number, ... | `'' → null` cho due_date |

→ Bài này là **xương sống** của form QLVB: cùng RHF + Zod + resolver, cùng pattern convert value tại submit. QLVB chỉ "phình" thêm vì nhiều field controlled cần `Controller` và schema phức tạp hơn. Nắm chắc bài 8 là đọc được form QLVB.

---

## 13. Khi nào sang bài 9?

Khi các checkbox mục 10 đều tick: submit rỗng ra lỗi đúng chỗ, submit hợp lệ tạo task + điều hướng, nút Hủy/Lưu hành xử đúng.

Bài 9 sẽ làm `TaskDetailPage` + sửa/xóa:

- `useParams()` lấy `id`, gọi `taskApi.getById(id)` để load chi tiết.
- Hiển thị title, `StatusChip`, mô tả, ngày (dùng `formatDate`/`formatDateTime`).
- "Đánh dấu hoàn thành" → `markDone(id)` rồi reload.
- "Xóa" → mở `ConfirmDialog` → `deleteTask(id)` → navigate('/tasks').
- (Tùy chọn) tái dùng RHF + schema bài 8 cho màn hình **Sửa** task.

Báo tôi "xong bài 8" để tôi viết tiếp `bai-09-detail-edit-delete.md`.

---

**Bài 8 — phiên bản 2026-06-08.**
