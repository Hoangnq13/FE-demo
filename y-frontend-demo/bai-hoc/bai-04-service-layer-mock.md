# Bài 4 — Service layer mock localStorage

> **Thời lượng**: ~60 phút.
> **Mục tiêu**: Hiểu **service layer** là gì và tại sao UI không bao giờ gọi thẳng `localStorage`. Tự tay viết `services/api/base.ts` (delay, readDB, writeDB, ok, genId) + `services/api/taskApi.ts` (list/getById/create/update/markDone/remove) làm "backend giả" — single source of truth, giả lập network delay, trả `ApiResponse<T>`. Sau bài này, swap sang BE thật (bài 11) chỉ phải đổi **1 chỗ import**.
> **Map QLVB**: `frontend/src/services/api/base.ts`, `frontend/src/services/api/incomingDocumentApi.ts` (và các `*Api.ts` khác).

---

## 0. Service layer là gì, và tại sao cần nó?

Giả sử bạn lười, viết thẳng trong component:

```tsx
// ❌ Cách "tiện" nhưng sai
function TaskListPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  useEffect(() => {
    const raw = localStorage.getItem('task-app:tasks')
    setTasks(raw ? JSON.parse(raw) : [])
  }, [])
  // ...
}
```

Nhìn thì chạy được. Nhưng nó **rò rỉ chi tiết lưu trữ** ra khắp UI. Hậu quả:

- Mỗi component tự `JSON.parse` → mỗi nơi xử lý lỗi parse một kiểu (hoặc không xử lý → crash).
- Key `'task-app:tasks'` viết tay rải rác → gõ sai 1 chỗ là bug ngầm.
- Logic filter / search / phân trang lặp lại ở từng page.
- **Ngày swap sang backend thật**: phải đi sửa **hàng chục** component đang gọi `localStorage`.

**Service layer** là một lớp trung gian (abstraction) đứng giữa UI và nguồn dữ liệu:

```
UI (component / store)
        │  chỉ gọi: taskApi.list(), taskApi.create(), ...
        ▼
   Service layer  (taskApi)  ← lớp ta viết bài này
        │  hôm nay: đọc/ghi localStorage
        │  bài 11:  gọi axios → Go backend
        ▼
   Nguồn dữ liệu (localStorage / HTTP)
```

UI **không biết** dữ liệu đến từ đâu. Nó chỉ biết: gọi `taskApi.list(params)` thì nhận về một `Promise<ApiResponse<Paginated<Task>>>`. Hôm nay nguồn là `localStorage`, bài 11 đổi thành HTTP — **chữ ký hàm (signature) không đổi** nên UI không cần sửa.

Đây chính là lý do bài 11 chỉ đổi 1 chỗ: ta thay file implement, giữ nguyên interface.

> Nếu bạn từng làm Node/Express: service layer ở đây giống tầng **repository / service** trong backend — controller không đụng SQL trực tiếp, mà gọi `userRepo.findById()`. Cùng triết lý, chỉ là dịch sang frontend.

---

## 1. Folder `services/api/` — gương QLVB

QLVB tổ chức:

```
frontend/src/services/api/
├── base.ts                    # apiService chung (axios instance + interceptor)
├── incomingDocumentApi.ts     # CRUD văn bản đến
├── outgoingDocumentApi.ts     # CRUD văn bản đi
└── ...                        # mỗi entity 1 file *Api.ts
```

Ta mirror y hệt, nhưng nội dung `base.ts` là **mock** (đọc/ghi localStorage + delay) thay vì axios:

```
task-app/src/services/api/
├── base.ts        # delay, readDB, writeDB, ok, genId
└── taskApi.ts     # list, getById, create, update, markDone, remove
```

Quy ước đặt tên giữ nguyên kiểu QLVB: một entity → một file `<entity>Api.ts`, export một object `<entity>Api` chứa các method.

Bài 4 **không cài lib mới** — toàn bộ là TS thuần + `localStorage` (Web API có sẵn).

---

## 2. `base.ts` — bộ công cụ chung của "backend giả"

Tạo `src/services/api/base.ts`:

```ts
import type { ApiResponse } from '@/types/api/common'

const DELAY_MS = 300

export function delay(ms = DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function readDB<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeDB<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function ok<T>(data: T, message = 'OK'): ApiResponse<T> {
  return { success: true, message, data }
}

// id ngẫu nhiên đơn giản (đủ cho mock)
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
```

### 2.1. `delay()` — vì sao cố tình làm UI chậm 300ms?

Nghe phản trực giác: ta **chủ động** chèn 300ms chờ vào mỗi call.

Lý do: `localStorage` là **đồng bộ** (synchronous) — đọc/ghi trả về **tức thì**. Nhưng backend thật là **bất đồng bộ** (network mất 50–500ms). Nếu mock trả ngay lập tức thì:

- UI không bao giờ thấy trạng thái "đang tải" → bạn quên viết loading spinner.
- Đến bài 11 nối BE thật, loading mới xuất hiện lần đầu → lộ ra hàng loạt bug "màn hình nhấp nháy", "bấm 2 lần tạo 2 task".

Vì vậy `delay(~300ms)` ép UI **phải** xử lý loading ngay từ bây giờ. Mock càng giống thật, càng ít bất ngờ khi lên thật.

`delay()` trả `Promise<void>`, dùng kèm `await delay()` ở đầu mỗi method. `setTimeout` + `resolve` là cách chuẩn để "promisify" một khoảng chờ.

### 2.2. `readDB` / `writeDB` — đọc/ghi localStorage an toàn, có generic

`localStorage` chỉ lưu **string**. Nên mọi object phải `JSON.stringify` khi ghi và `JSON.parse` khi đọc. Hai hàm này gói chuyện đó lại **một chỗ duy nhất**:

- `readDB<T>(key, fallback)`:
  - Không có key (`null`) → trả `fallback` (thường là mảng rỗng hoặc `null`).
  - Parse lỗi (string hỏng, ai đó sửa tay trong DevTools) → `try/catch` nuốt lỗi, trả `fallback` thay vì để app crash trắng màn hình.
  - `<T>` generic + ép `as T` → nơi gọi tự khai kiểu nó mong đợi, không phải `any`.
- `writeDB<T>(key, value)`: `JSON.stringify` rồi `setItem`. Gọn.

Nhờ tập trung hoá, sau này muốn đổi storage (vd `sessionStorage`, hoặc thêm mã hoá) chỉ sửa 2 hàm này.

### 2.3. `ok()` — factory cho `ApiResponse<T>`

Nhắc lại type ở `types/api/common.ts` (bài 3):

```ts
export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}
```

Tại sao bọc data trong một **envelope** `{ success, message, data }` thay vì trả thẳng `Task[]`?

- **Khớp BE thật**: hầu hết REST API trả wrapper kiểu `{ success, message, data }`. Mock theo đúng hình dạng → bài 11 swap không phải reshape gì.
- **Có chỗ cho message**: "Tạo task thành công", "Đã xóa task" → UI hiện toast/snackbar từ `res.message`, không hard-code chuỗi trong component.
- **Nhất quán**: mọi method đều trả cùng kiểu envelope → store xử lý theo một mẫu (`res.data`).

`ok(data, message)` chỉ là helper để khỏi gõ `{ success: true, message, data }` lặp đi lặp lại. `message` default `'OK'`.

### 2.4. `genId()` — id đủ-dùng-cho-mock

```ts
return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
```

- `Date.now().toString(36)` — timestamp ở hệ cơ số 36 (0-9a-z) → chuỗi ngắn, tăng dần theo thời gian.
- `Math.random().toString(36).slice(2, 8)` — 6 ký tự ngẫu nhiên để tránh trùng khi tạo nhiều task trong cùng 1ms.

Đây **không phải** UUID chuẩn và không chống xung đột tuyệt đối — nhưng cho một mock single-user thì quá đủ. BE thật sẽ tự sinh id (auto-increment hoặc UUID); lúc đó `genId()` biến mất theo `taskApi` mock.

---

## 3. `taskApi.ts` — service CRUD đầy đủ

Tạo `src/services/api/taskApi.ts`:

```ts
import type { Task } from '@/types/entities/task'
import type { ApiResponse, Paginated } from '@/types/api/common'
import type { ListTaskParams, CreateTaskPayload, UpdateTaskPayload } from '@/types/api/task'
import { STORAGE_KEY_TASKS, DEFAULT_PAGE_SIZE } from '@/constants/task'
import { delay, readDB, writeDB, ok, genId } from './base'

function seed(): Task[] {
  const now = new Date().toISOString()
  return [
    { id: genId(), title: 'Đọc tài liệu React 19', description: 'Hooks, Suspense', status: 'todo', due_date: null, created_at: now, updated_at: now },
    { id: genId(), title: 'Setup MUI theme', description: '', status: 'in_progress', due_date: null, created_at: now, updated_at: now },
    { id: genId(), title: 'Viết bài học task-app', description: 'Bài 1-11', status: 'done', due_date: null, created_at: now, updated_at: now },
  ]
}

function loadAll(): Task[] {
  const existing = readDB<Task[] | null>(STORAGE_KEY_TASKS, null)
  if (existing) return existing
  const seeded = seed()
  writeDB(STORAGE_KEY_TASKS, seeded)
  return seeded
}

export const taskApi = {
  async list(params: ListTaskParams = {}): Promise<ApiResponse<Paginated<Task>>> {
    await delay()
    const { search = '', status = 'all', page = 1, page_size = DEFAULT_PAGE_SIZE } = params
    let rows = loadAll()
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
    }
    if (status !== 'all') rows = rows.filter((t) => t.status === status)
    rows = rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
    const total = rows.length
    const start = (page - 1) * page_size
    const items = rows.slice(start, start + page_size)
    return ok({ items, total, page, page_size })
  },

  async getById(id: string): Promise<ApiResponse<Task>> {
    await delay()
    const found = loadAll().find((t) => t.id === id)
    if (!found) throw new Error('Không tìm thấy task')
    return ok(found)
  },

  async create(payload: CreateTaskPayload): Promise<ApiResponse<Task>> {
    await delay()
    const rows = loadAll()
    const now = new Date().toISOString()
    const task: Task = {
      id: genId(),
      title: payload.title,
      description: payload.description ?? '',
      status: 'todo',
      due_date: payload.due_date ?? null,
      created_at: now,
      updated_at: now,
    }
    writeDB(STORAGE_KEY_TASKS, [task, ...rows])
    return ok(task, 'Tạo task thành công')
  },

  async update(id: string, payload: UpdateTaskPayload): Promise<ApiResponse<Task>> {
    await delay()
    const rows = loadAll()
    const idx = rows.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error('Không tìm thấy task')
    const updated: Task = { ...rows[idx], ...payload, updated_at: new Date().toISOString() }
    rows[idx] = updated
    writeDB(STORAGE_KEY_TASKS, rows)
    return ok(updated, 'Cập nhật thành công')
  },

  async markDone(id: string): Promise<ApiResponse<Task>> {
    await delay()
    const rows = loadAll()
    const idx = rows.findIndex((t) => t.id === id)
    if (idx === -1) throw new Error('Không tìm thấy task')
    rows[idx] = { ...rows[idx], status: 'done', updated_at: new Date().toISOString() }
    writeDB(STORAGE_KEY_TASKS, rows)
    return ok(rows[idx], 'Đã đánh dấu hoàn thành')
  },

  async remove(id: string): Promise<ApiResponse<null>> {
    await delay()
    const rows = loadAll().filter((t) => t.id !== id)
    writeDB(STORAGE_KEY_TASKS, rows)
    return ok(null, 'Đã xóa task')
  },
}
```

Đọc một lượt thấy có vẻ dài, nhưng chỉ là **6 method CRUD + 2 helper private**. Ta mổ từng phần.

### 3.1. `seed()` + `loadAll()` — single source of truth

`seed()` trả 3 task mẫu. `loadAll()` là **cửa ngõ duy nhất** để lấy toàn bộ task ra:

```ts
function loadAll(): Task[] {
  const existing = readDB<Task[] | null>(STORAGE_KEY_TASKS, null)
  if (existing) return existing      // đã có data → trả về
  const seeded = seed()              // lần đầu (chưa có key)
  writeDB(STORAGE_KEY_TASKS, seeded) // ghi data mẫu xuống localStorage
  return seeded
}
```

**Seed lần đầu**: dùng `fallback = null` để phân biệt "chưa từng chạy app" (key chưa tồn tại → `null`) với "đã có mảng rỗng" (user xóa hết task → `[]`). Nếu lấy `fallback = []` thì sẽ không phân biệt được, và user vừa xóa task cuối lại bị nhồi seed về — sai. Vậy nên:

- `existing === null` (chưa có key) → seed, ghi xuống, trả 3 task.
- `existing === []` (đã từng có, giờ rỗng) → trả `[]`, **không** seed lại.

**Single source of truth**: tất cả method (`list`, `getById`, `create`, ...) đều đi qua `loadAll()` để đọc và qua `writeDB(STORAGE_KEY_TASKS, ...)` để ghi. Key `'task-app:tasks'` chỉ xuất hiện ở `taskApi.ts` (qua hằng số `STORAGE_KEY_TASKS`), **không nơi nào khác trong app**. Đó là định nghĩa của "nguồn sự thật duy nhất": muốn biết app có task gì, chỉ có một chỗ để hỏi.

> Lưu ý: `STORAGE_KEY_TASKS` import từ `@/constants/task` (= `'task-app:tasks'`), không gõ chuỗi tay. Đây là lý do bài 3 tách hằng số ra constants.

### 3.2. `list()` — nơi gánh search + filter + pagination

Backend thật làm filter/sort/paginate ở **server** (qua SQL `WHERE`, `ORDER BY`, `LIMIT`/`OFFSET`). Mock của ta làm y hệt, nhưng **trên mảng JS trong bộ nhớ** — để UI gọi giống hệt như gọi BE thật:

```ts
const { search = '', status = 'all', page = 1, page_size = DEFAULT_PAGE_SIZE } = params
```

Destructure params với **default value** → nơi gọi có thể `taskApi.list()` (không tham số) vẫn chạy. Thứ tự xử lý:

1. **Search** (theo `title` + `description`, không phân biệt hoa thường):
   ```ts
   if (search.trim()) {
     const q = search.trim().toLowerCase()
     rows = rows.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
   }
   ```
   `trim()` để query toàn khoảng trắng không lọc nhầm. `toLowerCase()` cả hai vế → "react" khớp "React".

2. **Filter theo status**: `if (status !== 'all') rows = rows.filter(...)`. Giá trị `'all'` là quy ước "không lọc".

3. **Sort**: `b.created_at.localeCompare(a.created_at)` — `created_at` là chuỗi ISO, mà ISO so sánh chuỗi cũng chính là so sánh thời gian. `b` trước `a` → **mới nhất lên đầu**.

4. **Pagination** — đếm **trước khi** cắt:
   ```ts
   const total = rows.length                       // tổng SAU filter, TRƯỚC cắt trang
   const start = (page - 1) * page_size
   const items = rows.slice(start, start + page_size)
   ```
   `total` phải là số dòng đã-lọc nhưng chưa-cắt-trang, để UI tính được số trang. `page` 1-based: trang 1 → `start = 0`. `slice(start, start + page_size)` lấy đúng một trang.

Trả về `ok({ items, total, page, page_size })` — đúng hình dạng `Paginated<Task>`.

### 3.3. `getById()` — và vì sao `throw` khi không thấy

```ts
const found = loadAll().find((t) => t.id === id)
if (!found) throw new Error('Không tìm thấy task')
return ok(found)
```

Không tìm thấy → **`throw new Error`**, không trả `ok(null)`. Lý do:

- Đây mô phỏng **HTTP 404** của BE thật. Axios cũng `throw` khi gặp 4xx/5xx → mock throw thì store/UI viết `try/catch` ngay từ bây giờ, bài 11 không phải đổi cách xử lý.
- Tách bạch hai trạng thái: "tìm thấy task = `null`" (không hợp lệ về kiểu — `ApiResponse<Task>` không cho `data: null`) vs "không có task đó" (lỗi). Throw làm rạch ròi.

Tầng store sẽ bắt error này (`catch`) và đẩy ra `error` state. UI hiện "Không tìm thấy task" thay vì màn hình trắng.

### 3.4. `create()` — service tự đóng dấu thời gian + default

```ts
const task: Task = {
  id: genId(),
  title: payload.title,
  description: payload.description ?? '',   // optional → default ''
  status: 'todo',                           // task mới luôn 'todo'
  due_date: payload.due_date ?? null,       // optional → default null
  created_at: now,
  updated_at: now,                          // tạo mới: created = updated
}
writeDB(STORAGE_KEY_TASKS, [task, ...rows])
```

Điểm cần thấy: **UI chỉ gửi `CreateTaskPayload`** (`title`, `description?`, `due_date?`) — những gì người dùng nhập. Còn `id`, `status`, `created_at`, `updated_at` là **việc của service** (giống BE thật tự sinh các field hệ thống). UI không nên — và không cần — biết các field này được tạo thế nào.

`[task, ...rows]` đặt task mới lên đầu mảng (dù sao `list()` cũng sort lại theo `created_at`, nhưng prepend cho nhất quán). `?? ''` và `?? null` xử lý field optional.

### 3.5. `update()` / `markDone()` — pattern "tìm index → merge → ghi"

Cả hai cùng một khuôn:

```ts
const idx = rows.findIndex((t) => t.id === id)
if (idx === -1) throw new Error('Không tìm thấy task')          // 404
const updated: Task = { ...rows[idx], ...payload, updated_at: new Date().toISOString() }
rows[idx] = updated
writeDB(STORAGE_KEY_TASKS, rows)
```

- `{ ...rows[idx], ...payload }` — **partial update**: giữ field cũ, đè field mới có trong payload. `UpdateTaskPayload = Partial<CreateTaskPayload>` nên gửi 1 field cũng được.
- `updated_at` luôn refresh về giờ hiện tại; `created_at` không bao giờ đụng tới.
- `markDone` là ca đặc biệt của update: cứng `status: 'done'`. Tách riêng để UI gọi `taskApi.markDone(id)` ngữ nghĩa rõ ràng hơn `update(id, { status: 'done' })`.

### 3.6. `remove()` — filter ra rồi ghi lại

```ts
const rows = loadAll().filter((t) => t.id !== id)
writeDB(STORAGE_KEY_TASKS, rows)
return ok(null, 'Đã xóa task')
```

Đơn giản: lọc bỏ phần tử trùng id, ghi lại. Trả `ApiResponse<null>` (xóa thì không có data trả về, `null` là hợp lệ). Lưu ý `remove` **không throw** nếu id không tồn tại — filter một id không có chỉ trả lại mảng cũ, idempotent (xóa nhiều lần kết quả như nhau). Đây là lựa chọn thiết kế hợp lý cho DELETE.

---

## 4. Bảng tổng kết 6 method

| Method | Tham số | Trả về | Throw khi | Ghi localStorage? |
|---|---|---|---|---|
| `list` | `ListTaskParams` (optional) | `ApiResponse<Paginated<Task>>` | không | không (chỉ đọc) |
| `getById` | `id` | `ApiResponse<Task>` | không tìm thấy | không |
| `create` | `CreateTaskPayload` | `ApiResponse<Task>` | không | có |
| `update` | `id`, `UpdateTaskPayload` | `ApiResponse<Task>` | không tìm thấy | có |
| `markDone` | `id` | `ApiResponse<Task>` | không tìm thấy | có |
| `remove` | `id` | `ApiResponse<null>` | không | có |

Mọi method đều `async` + `await delay()` đầu tiên → mọi call đều mất ~300ms như gọi mạng thật.

---

## 5. Test nhanh service (tạm thời, rồi xóa)

Chưa có store (bài 5) hay UI dùng nó (bài 7), nhưng ta nên verify `taskApi` chạy đúng **ngay bây giờ**. Hai cách:

### 5.1. Gọi tạm trong `App.tsx`

Thêm vào `App.tsx` (xóa sau khi test xong):

```tsx
import { useEffect } from 'react'
import { taskApi } from '@/services/api/taskApi'

function App() {
  useEffect(() => {
    async function test() {
      // lần đầu chạy: tự seed 3 task
      const listed = await taskApi.list()
      console.log('list:', listed)

      const created = await taskApi.create({ title: 'Task test', description: 'từ console' })
      console.log('create:', created.data)

      const done = await taskApi.markDone(created.data.id)
      console.log('markDone:', done.data.status) // 'done'

      const search = await taskApi.list({ search: 'react' })
      console.log('search react:', search.data.items.map((t) => t.title))

      try {
        await taskApi.getById('id-khong-ton-tai')
      } catch (e) {
        console.log('getById throw:', (e as Error).message) // 'Không tìm thấy task'
      }
    }
    test()
  }, [])

  return <div>Mở Console (F12) xem log test taskApi</div>
}
```

Chạy `npm run dev`, mở **DevTools → Console** (F12). Bạn sẽ thấy lần lượt log. Mỗi call có độ trễ ~300ms (cảm nhận được) — đúng như mong muốn.

### 5.2. Gọi thẳng trong Console của trình duyệt

Hoặc không sửa code, mở Console và import động:

```js
const { taskApi } = await import('/src/services/api/taskApi.ts')
await taskApi.list()
```

### 5.3. Kiểm tra localStorage đã được seed

Vẫn trong DevTools → tab **Application → Local Storage → localhost** → tìm key `task-app:tasks`. Bạn sẽ thấy mảng JSON 3 task (hoặc 4 sau khi `create`). Đây là bằng chứng service là nguồn sự thật.

> **Quan trọng**: sau khi test xong, **xóa hết** đoạn `useEffect` test trong `App.tsx`. Nó chỉ để verify, không thuộc app. Nếu muốn reset data về trạng thái đầu: trong Console gõ `localStorage.removeItem('task-app:tasks')` rồi reload — lần load sau service sẽ seed lại 3 task.

---

## 6. Sai lầm thường gặp

### 6.1. Quên `await delay()` / quên `async`

Bỏ `await delay()` → mock trả tức thì → bài sau bạn quên viết loading, lên BE thật mới lòi bug. Giữ `delay()` ở **mọi** method.

### 6.2. Gõ chuỗi key `'task-app:tasks'` thẳng trong component

```ts
localStorage.getItem('task-app:tasks')  // ❌ trong component → phá single source of truth
```

UI **không bao giờ** đụng `localStorage` cho task. Mọi truy cập đi qua `taskApi`. Key chỉ xuất hiện ở `constants/task.ts` (định nghĩa) và `taskApi.ts` (sử dụng).

### 6.3. Dùng `fallback = []` cho seed thay vì `null`

```ts
const existing = readDB<Task[]>(STORAGE_KEY_TASKS, [])  // ❌
if (existing.length === 0) { /* seed */ }               // sai: user xóa hết cũng bị seed lại
```

Phải dùng `null` để phân biệt "chưa có key" với "có nhưng rỗng". Xem lại mục 3.1.

### 6.4. Trả `ok(null)` thay vì `throw` khi không tìm thấy

`getById`/`update`/`markDone` phải **throw** khi không thấy id (mô phỏng 404). Trả `null` làm UI khó phân biệt lỗi với dữ liệu hợp lệ, và không khớp axios bài 11.

### 6.5. Quên `total` đếm trước khi `slice`

```ts
const items = rows.slice(start, start + page_size)
const total = items.length  // ❌ chỉ là số dòng trong 1 trang, không phải tổng
```

`total` phải là `rows.length` (sau filter, trước cắt trang). Nếu lấy `items.length` thì UI tính sai số trang.

### 6.6. Mutate state cũ thay vì tạo object mới

`update` dùng `{ ...rows[idx], ...payload }` tạo object mới rồi gán lại `rows[idx]`. Đừng sửa trực tiếp `rows[idx].status = 'done'` rồi quên `writeDB` — thay đổi sẽ không được lưu xuống localStorage.

---

## 7. Checkpoint Bài 4

- [ ] Có file `src/services/api/base.ts` export đủ 5 hàm: `delay`, `readDB`, `writeDB`, `ok`, `genId`
- [ ] Có file `src/services/api/taskApi.ts` export object `taskApi` với 6 method: `list`, `getById`, `create`, `update`, `markDone`, `remove`
- [ ] `base.ts` import `ApiResponse` từ `@/types/api/common`; `taskApi.ts` import types + `STORAGE_KEY_TASKS`, `DEFAULT_PAGE_SIZE` từ `@/constants/task`
- [ ] `loadAll()` seed 3 task mẫu **chỉ lần đầu** (fallback `null`), không seed lại khi mảng rỗng
- [ ] `list()` làm đủ search (title+description, không phân biệt hoa thường) + filter status + sort mới nhất + pagination, `total` đếm trước khi `slice`
- [ ] `getById`/`update`/`markDone` `throw new Error('Không tìm thấy task')` khi id không tồn tại
- [ ] Mọi method `async` + `await delay()` đầu tiên
- [ ] Test trong Console: `list` ra 3 task lần đầu, `create` thêm task, `markDone` đổi status, `getById('sai')` throw — đều OK
- [ ] DevTools → Application thấy key `task-app:tasks` chứa JSON task
- [ ] Đã xóa đoạn `useEffect` test trong `App.tsx`
- [ ] KHÔNG cài lib mới nào ở bài này

---

## 8. Câu hỏi tự kiểm tra

1. Service layer giải quyết vấn đề gì so với việc gọi thẳng `localStorage` trong component? Nêu ít nhất 2 lợi ích.
2. Tại sao cố tình chèn `delay(~300ms)` vào mock, dù `localStorage` vốn đồng bộ và trả tức thì?
3. Tại sao bọc dữ liệu trong `ApiResponse<T>` (`{ success, message, data }`) thay vì trả thẳng `Task[]`?
4. Trong `loadAll()`, tại sao dùng `fallback = null` chứ không phải `[]`? Chuyện gì xảy ra nếu dùng `[]`?
5. `getById` không tìm thấy task thì `throw` thay vì trả `ok(null)`. Lý do là gì và nó giúp ích gì cho bài 11?
6. Trong `list()`, vì sao `total` phải tính **trước** khi `slice` cắt trang?

**Đáp án:**

1. (a) **Abstraction**: UI không biết dữ liệu đến từ localStorage hay HTTP → bài 11 swap chỉ đổi 1 chỗ import, không sửa component. (b) **DRY + an toàn**: logic parse JSON, xử lý lỗi, key storage, filter/search/paginate gom một chỗ, không lặp và không gõ sai key rải rác. (c) **Single source of truth**: chỉ một nơi đọc/ghi task → dễ debug, không có 2 nguồn lệch nhau.

2. Vì backend thật là bất đồng bộ (network có độ trễ). Nếu mock trả tức thì, UI không bao giờ thấy trạng thái loading → ta quên viết spinner/disable nút. Đến khi nối BE thật mới lộ hàng loạt bug (nhấp nháy, double-submit). `delay()` ép UI xử lý loading ngay từ giai đoạn mock — mock càng giống thật càng ít bất ngờ.

3. (a) Khớp hình dạng response của BE thật → bài 11 swap không phải reshape. (b) Có chỗ chứa `message` ("Tạo task thành công") để UI hiện toast, không hard-code chuỗi trong component. (c) Mọi method trả cùng một envelope → store xử lý theo một mẫu nhất quán (`res.data`, `res.message`).

4. `null` để phân biệt "chưa từng chạy app" (key chưa tồn tại → `readDB` trả `null`) với "đã có nhưng rỗng" (user xóa hết task → `[]`). Nếu dùng `fallback = []` thì hai trường hợp này không phân biệt được; user vừa xóa task cuối cùng sẽ bị service nhồi 3 task seed về — sai hành vi.

5. Throw mô phỏng HTTP 404 của BE thật. Axios (bài 11) cũng throw khi gặp 4xx/5xx → nếu mock throw ngay từ bây giờ thì store/UI viết `try/catch` đúng kiểu, bài 11 swap sang axios không phải đổi cách xử lý lỗi. Ngoài ra `ApiResponse<Task>` không cho `data: null` về mặt kiểu, nên throw là cách sạch để báo "không có".

6. `total` là tổng số dòng **sau filter/search nhưng trước khi cắt trang** — UI cần con số này để tính tổng số trang (vd `TablePagination`). Nếu tính `total` sau `slice` thì nó chỉ bằng số dòng trong một trang (≤ `page_size`), UI sẽ tưởng chỉ có 1 trang.

---

## 9. So sánh với QLVB thật

Mở `frontend/src/services/api/base.ts` và `incomingDocumentApi.ts` của QLVB:

| Khía cạnh | QLVB | Bài 4 |
|---|---|---|
| `base.ts` chứa gì | axios instance + interceptor (gắn token, refresh, xử lý 401) | delay + đọc/ghi localStorage + helper `ok`/`genId` |
| Nguồn dữ liệu | HTTP → backend Spring/Go thật | `localStorage` (mock) |
| Method `*Api.ts` | gọi `apiService.get/post/put/delete(url)` | đọc/ghi mảng JS trong bộ nhớ |
| Filter / sort / paginate | làm ở **server** (SQL) | làm ở **client** (mảng JS) trong `list()` |
| Response wrapper | `{ success, message, data }` thật từ BE | `ApiResponse<T>` ta tự đắp |
| Lỗi không tìm thấy | HTTP 404 → axios throw | `throw new Error('Không tìm thấy task')` |
| Auth | có (token, refresh) | KHÔNG (single-user, không login) |

→ Điểm cốt lõi giống nhau là **interface**: cả hai đều export một object `<entity>Api` với các method trả `Promise<ApiResponse<...>>`. Vì interface giống, bài 11 chỉ cần viết `taskApiHttp.ts` (cùng signature, ruột axios) rồi đổi đúng **một dòng import** trong store. Đó là toàn bộ phần thưởng của việc bỏ công làm service layer hôm nay.

---

## 10. Khi nào sang bài 5?

Khi tất cả checkbox mục 7 đều tick, đặc biệt là: test trong Console chạy đúng và đã xóa code test khỏi `App.tsx`. Bài 5 sẽ làm:

- Cài `zustand` (`npm i zustand`) và tạo `store/taskStore.ts`.
- Store **gọi `taskApi`**, KHÔNG tự đụng `localStorage` cho danh sách task (tránh 2 nguồn sự thật) — store chỉ là **cache phía client + UI state**.
- Dùng `persist` middleware **chỉ** để lưu UI prefs (`statusTab` + `pageSize`) ở key `task-app:ui`, với `partialize`.
- Hiểu vì sao **không double-persist** task (service đã giữ rồi), đối chiếu với `authStore` của QLVB (persist token).

Báo tôi "xong bài 4" để tôi viết tiếp `bai-05-zustand-store.md`.

---

**Bài 4 — phiên bản 2026-06-08.**
