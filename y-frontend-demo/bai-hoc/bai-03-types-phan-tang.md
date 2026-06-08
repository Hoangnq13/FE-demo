# Bài 3 — Types phân 5 tầng cho Task

> **Thời lượng**: 45-60 phút.
> **Mục tiêu**: Hiểu **tại sao** tách type theo 5 tầng (`entities` → `api` → `pages` → `features` → `store`), viết đủ 6 file type cho `Task` đúng pattern QLVB, nắm union type vs enum, generic `ApiResponse<T>`, `Partial<T>`, và `import type` vs `import`.
> **Map QLVB**: `frontend/src/types/entities/documents/incoming.ts`, `frontend/src/types/api/documents/incoming.ts` (và các folder `pages/`, `features/`, `store/` song song).

---

## 0. Tại sao không nhét tất cả type vào 1 file?

Bạn từ Node/TS qua, phản xạ đầu tiên là tạo `types.ts` rồi quăng hết `interface` vào đó. Với app nhỏ thì ổn. Nhưng app thật (như QLVB) có vấn đề:

- **Một "Task" không phải lúc nào cũng giống nhau.** Lúc nó là dữ liệu từ DB (có `id`, `created_at`). Lúc nó là body bạn gửi lên server để tạo mới (chưa có `id`). Lúc nó là giá trị trong form (mọi field là string). Nếu dùng **chung một type** cho cả 3 ngữ cảnh, bạn sẽ phải nhét đầy `?` (optional) và `| null`, rồi cuối cùng TS không bảo vệ được gì cả.
- **Mỗi tầng đổi theo nhịp khác nhau.** Domain model (`Task`) gần như không đổi. Nhưng request/response shape **đổi mỗi khi BE đổi API**. Form state đổi theo UI. Nếu chung 1 file, sửa 1 chỗ dễ vỡ chỗ khác.

QLVB giải quyết bằng cách **chia type theo "vai trò"** — đúng 5 tầng:

| Tầng | Folder | Trả lời câu hỏi | Đổi theo |
|---|---|---|---|
| **entities** | `types/entities/` | "Một Task **thật sự** là gì?" (domain model) | rất ít — đây là chân lý |
| **api** | `types/api/` | "Gửi gì lên / nhận gì về?" (request/response) | **BE** (đổi API là đổi đây) |
| **pages** | `types/pages/` | "Form đang giữ giá trị gì?" (form data) | UI form |
| **features** | `types/features/` | "Bộ lọc / UI state của 1 feature?" | UI tương tác |
| **store** | `types/store/` | "Zustand store giữ state + action gì?" | logic client |

> **Quy tắc luồng phụ thuộc (1 chiều)**: `entities` là gốc, không import ai. `api` import `entities`. `pages`/`features`/`store` import xuống `entities` + `api`. **Không bao giờ** để `entities` import ngược lên `api`. Cứ hình dung mũi tên chỉ xuống: tầng dưới ổn định, tầng trên hay đổi.

→ **Mục tiêu bài 3**: viết đủ 6 file type cho `Task`, để từ bài 4 (service) trở đi, mọi nơi `import type` ra dùng là có sẵn — không phải định nghĩa lại.

---

## 1. Tầng 1 — `entities/` (domain model ổn định)

Đây là định nghĩa "Task là gì" theo đúng dữ liệu lưu trong "DB" (ở app này là localStorage, bài 4). Mọi field đều **bắt buộc** vì đây là record đã tồn tại.

Tạo `src/types/entities/task.ts`:

```ts
export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  due_date: string | null   // 'yyyy-MM-dd' hoặc null
  created_at: string        // ISO datetime
  updated_at: string        // ISO datetime
}
```

### Giải thích từng điểm

- `id: string` — không phải `number`. Ở app này id sinh bằng chuỗi random (bài 4). QLVB dùng UUID string. Dùng string là an toàn nhất (không tràn `number`, không lệch khi serialize).
- `status: TaskStatus` — kiểu **union type** thay vì `string`. Nhờ đó TS chỉ cho phép đúng 3 giá trị; gõ `status: 'doing'` sẽ báo lỗi ngay. (Phần 1.1 nói kỹ tại sao union chứ không enum.)
- `due_date: string | null` — hạn chót lưu dạng `'yyyy-MM-dd'` (ví dụ `'2026-06-30'`), hoặc `null` khi không có hạn. **Lưu string, không lưu `Date`**, vì JSON không có kiểu Date — khi `JSON.stringify` rồi parse lại, `Date` thành string lung tung. Lưu string ngay từ đầu cho nhất quán.
- `created_at` / `updated_at: string` — ISO datetime đầy đủ (`'2026-06-08T09:30:00.000Z'`), khác với `due_date` chỉ là ngày. Lý do: timestamp cần biết cả giờ để sort chính xác; còn deadline thì người dùng chỉ quan tâm ngày.

### 1.1. Union type vs enum — vì sao chọn union?

TS có 2 cách biểu diễn "một trong vài giá trị cố định":

```ts
// Cách A — union of string literals (CHỌN cái này)
export type TaskStatus = 'todo' | 'in_progress' | 'done'

// Cách B — enum
export enum TaskStatusEnum {
  Todo = 'todo',
  InProgress = 'in_progress',
  Done = 'done',
}
```

| Tiêu chí | Union literal | Enum |
|---|---|---|
| Sinh code runtime | **Không** — chỉ là type, biến mất sau compile | **Có** — enum tạo object JS thật, tốn bundle |
| So sánh với data từ API | Trực tiếp: `if (t.status === 'done')` | Phải `t.status === TaskStatusEnum.Done` |
| Giá trị từ JSON khớp luôn | **Có** — JSON trả `'done'` là khớp luôn | Phải map / ép kiểu |
| `tree-shaking` | Tốt (không có gì để shake) | Kém hơn (enum thường bị giữ lại) |
| Cú pháp | Gọn | Dài dòng |

→ QLVB và app này chọn **union literal** vì: (1) không sinh runtime code, (2) data từ API là string thuần nên so sánh `=== 'done'` là tự nhiên nhất, (3) gõ `status === '` là IDE gợi ý đủ 3 giá trị — vẫn an toàn như enum mà không tốn bundle. Enum chỉ đáng dùng khi bạn cần iterate qua tất cả giá trị tại runtime, mà việc đó ta sẽ làm bằng `TASK_STATUS_OPTIONS` (constants, bài 4) thay vì enum.

---

## 2. Tầng 2 — `api/` (request/response shape, đổi theo BE)

Tầng này mô tả **dữ liệu đi qua dây mạng**: gửi gì lên, nhận gì về. Đây là tầng dễ đổi nhất vì nó phụ thuộc hợp đồng (contract) với backend.

### 2.1. `types/api/common.ts` — wrapper dùng chung mọi API

Tạo `src/types/api/common.ts`:

```ts
export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
```

### Giải thích

- **`ApiResponse<T>` là generic.** `<T>` là một "biến kiểu" — chỗ trống để điền sau. Nó nói: "mọi response của tôi đều có `success` + `message`, còn `data` là tùy chỗ". Khi dùng:
  - `ApiResponse<Task>` → `data` là `Task`.
  - `ApiResponse<Paginated<Task>>` → `data` là một trang danh sách Task.
  - `ApiResponse<null>` → `data` là `null` (ví dụ API xóa, không trả gì).

  Nhờ generic, ta viết **một** interface dùng cho **mọi** endpoint mà vẫn giữ type chính xác cho từng `data`. Đây là lợi ích lớn nhất của generic so với việc khai `data: any`.

- **`Paginated<T>` cũng generic** — bất cứ danh sách phân trang nào (`Paginated<Task>`, sau này `Paginated<User>`...) đều tái dùng được. `items` là mảng phần tử trang hiện tại; `total` là **tổng toàn bộ** (không phải số phần tử trên trang) — cần để tính số trang cho UI phân trang.
- Vì sao bọc data trong `ApiResponse` thay vì trả thẳng `Task`? Để **đồng nhất**: mọi nơi gọi API đều biết chắc có `res.success` và `res.message` để báo lỗi/toast, không cần đoán hình dạng từng endpoint. QLVB BE cũng wrap kiểu này.

> **Lưu ý quan trọng**: đặt convention field theo BE. Ở đây dùng `snake_case` (`page_size`, `due_date`) vì backend QLVB (Go) trả snake_case. **Đừng** tự ý đổi sang camelCase ở tầng api — type api phải khớp **đúng** JSON BE trả về, nếu không lúc runtime field sẽ `undefined`.

### 2.2. `types/api/task.ts` — params + payload riêng cho Task

Tạo `src/types/api/task.ts`:

```ts
import type { Task, TaskStatus } from '@/types/entities/task'

export interface ListTaskParams {
  search?: string
  status?: TaskStatus | 'all'
  page?: number
  page_size?: number
}

export interface CreateTaskPayload {
  title: string
  description?: string
  due_date?: string | null
}

export type UpdateTaskPayload = Partial<CreateTaskPayload>

export type { Task }
```

### Giải thích từng điểm

- **`import type { Task, TaskStatus }`** — tầng api phụ thuộc tầng entities (đúng chiều mũi tên). Dùng `import type` vì ta chỉ cần kiểu, không cần runtime (chi tiết phần 6).
- **`ListTaskParams`** — query params khi gọi `list()`. **Mọi field đều `?` (optional)** vì khi gọi list, bạn có thể không truyền gì (lấy mặc định), hoặc chỉ truyền `search`. Khác hẳn `Task` (mọi field bắt buộc).
- **`status?: TaskStatus | 'all'`** — chú ý có thêm `'all'`. Đây là giá trị **chỉ tồn tại ở tầng lọc**, không phải status thật của Task. Tab "Tất cả" trên UI map vào `'all'`. Ta cố tình **không** nhét `'all'` vào `TaskStatus` (entities) — vì một Task không bao giờ có status "all"; `'all'` là khái niệm của filter, nên chỉ xuất hiện ở api/features.
- **`CreateTaskPayload`** — body gửi lên khi **tạo** task. So với `Task`: **không có** `id`, `status`, `created_at`, `updated_at` — vì server tự sinh những thứ đó. Chỉ cần `title` (bắt buộc), `description?`, `due_date?`. Đây chính là lý do không dùng chung type với `Task`: payload tạo mới là **subset** rất khác.
- **`UpdateTaskPayload = Partial<CreateTaskPayload>`** — `Partial<T>` là utility type của TS biến **mọi field thành optional**. Tức là:

  ```ts
  // Partial<CreateTaskPayload> tương đương:
  // { title?: string; description?: string; due_date?: string | null }
  ```

  Ý nghĩa nghiệp vụ: khi **cập nhật**, người dùng có thể chỉ sửa `title`, hoặc chỉ sửa `due_date`. Không bắt buộc gửi lại toàn bộ. Dùng `Partial` ta **tái sử dụng** `CreateTaskPayload` thay vì gõ lại — nếu sau này thêm field vào Create, Update tự cập nhật theo. DRY và an toàn.
- **`export type { Task }`** — re-export `Task` từ tầng này. Tiện ích: code gọi API chỉ cần import từ `@/types/api/task` là có cả params, payload, lẫn `Task` — không phải nhớ `Task` nằm ở entities. (Đây là lựa chọn tiện dụng, không bắt buộc.)

---

## 3. Tầng 3 — `pages/` (form data, field toàn string)

Tầng này mô tả giá trị mà **form trên trang** đang giữ. Điểm mấu chốt: **field nào cũng là `string`**.

Tạo `src/types/pages/task.ts`:

```ts
export interface TaskFormValues {
  title: string
  description: string
  due_date: string   // '' = không có hạn
}
```

### Giải thích — vì sao `due_date` là `string` chứ không `Date | null`?

Ở entity, `due_date` là `string | null`. Nhưng ở **form**, nó là `string` thuần (`''` khi rỗng). Lý do nằm ở cách form HTML + React Hook Form (RHF) hoạt động:

- **`<input type="date">` luôn trả về `string`.** Khi người dùng chọn ngày, value của input là chuỗi `'2026-06-30'`. Khi chưa chọn, là `''` (chuỗi rỗng). Trình duyệt **không** đưa cho bạn object `Date`.
- **RHF lưu nguyên giá trị input.** RHF không tự convert; nó giữ đúng cái input đưa cho. Nên `defaultValues.due_date` phải là `''`, không thể là `null` (input không hiểu `null`, sẽ thành uncontrolled → React cảnh báo).
- Nếu khai `due_date: Date | null` cho form, bạn sẽ phải convert string ↔ Date ở mỗi lần đổi → rườm rà, dễ bug. Thay vào đó, **giữ string suốt trong form**, chỉ convert **một lần** lúc submit:

  ```ts
  // lúc submit (bài 8): map form → payload
  createTask({ title, description, due_date: due_date || null })
  //                                          ^^^^^^^^^^^^^^^^^
  // '' (rỗng) → null   |   '2026-06-30' → giữ nguyên
  ```

  `due_date || null`: chuỗi rỗng `''` là falsy → thành `null`; chuỗi có ngày là truthy → giữ nguyên. Đây là ranh giới chuyển đổi **page → api**.

→ Quy tắc tổng quát: **form data luôn là string** (vì input HTML là string). Việc ép kiểu (string → number/Date/null) làm ở biên submit, không làm trong form state. Đây là lý do `TaskFormValues` tách riêng khỏi `Task` và `CreateTaskPayload`.

---

## 4. Tầng 4 — `features/` (filter / UI state)

Tầng này giữ state của **một tính năng** trên UI — ở đây là bộ lọc danh sách Task (search + tab status + phân trang).

Tạo `src/types/features/task.ts`:

```ts
import type { TaskStatus } from '@/types/entities/task'

export interface TaskFilterState {
  search: string
  status: TaskStatus | 'all'
  page: number
  pageSize: number
}
```

### Giải thích

- Khác `ListTaskParams` (api) ở chỗ: ở đây **field bắt buộc**, không `?`. Vì đây là **state hiện tại** của UI — luôn có một giá trị cụ thể (search có thể là `''`, nhưng nó tồn tại). Còn `ListTaskParams` là **đối số gửi đi**, được phép thiếu.
- `status: TaskStatus | 'all'` — lại thấy `'all'`. Mặc định tab đang chọn có thể là `'all'`. Khái niệm "all" thuộc về filter/feature, đúng như đã nói ở phần 2.2.
- **Chú ý `pageSize` (camelCase) ở đây** vs **`page_size` (snake_case) ở `ListTaskParams`/`Paginated`**. Không phải lỗi gõ: tầng api dùng snake_case để **khớp BE**; tầng UI (features/store) dùng camelCase theo convention JS. Chỗ nối giữa hai tầng (khi gọi `fetchTasks`) sẽ map `pageSize → page_size`. Việc tách rõ ràng này giúp đổi BE không lan vào UI.

---

## 5. Tầng 5 — `store/` (state + actions của Zustand)

Tầng cuối: mô tả **toàn bộ những gì Zustand store giữ** — gồm data cache, UI prefs, và các action (hàm). Bài 5 sẽ implement store thật; bài này chỉ định nghĩa **hình dạng** của nó.

Tạo `src/types/store/task.ts`:

```ts
import type { Task } from '@/types/entities/task'
import type { CreateTaskPayload, UpdateTaskPayload, ListTaskParams } from '@/types/api/task'

export interface TaskStoreState {
  // data cache
  tasks: Task[]
  total: number
  loading: boolean
  error: string | null
  // UI prefs (được persist)
  statusTab: Task['status'] | 'all'
  pageSize: number
  // actions
  fetchTasks: (params: ListTaskParams) => Promise<void>
  createTask: (payload: CreateTaskPayload) => Promise<Task>
  updateTask: (id: string, payload: UpdateTaskPayload) => Promise<Task>
  markDone: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  setStatusTab: (tab: Task['status'] | 'all') => void
  setPageSize: (n: number) => void
}
```

### Giải thích từng điểm

- Store import xuống cả `entities` (`Task`) lẫn `api` (`CreateTaskPayload`, ...). Đúng chiều mũi tên — tầng cao nhất, import nhiều nhất.
- **`tasks: Task[]` + `total`** — đây là **cache phía client** của trang dữ liệu hiện tại (lấy từ `Paginated<Task>`). Store không lưu toàn bộ DB, chỉ lưu kết quả lần fetch gần nhất.
- **`loading` / `error`** — state UI để trang biết đang tải hay có lỗi. `error: string | null` — `null` khi không lỗi, là string message khi có lỗi.
- **`statusTab: Task['status'] | 'all'`** — chú ý cú pháp **`Task['status']`**. Đây là **indexed access type**: lấy ra kiểu của field `status` trong `Task`, tức là `TaskStatus`. Tương đương viết `TaskStatus | 'all'`. Lợi ích: nếu sau này `Task.status` đổi kiểu, chỗ này tự đổi theo — không cần import `TaskStatus` riêng. (Cả hai cách đều đúng; spec dùng `Task['status']` để minh họa kỹ thuật này.)
- **Phân biệt "data cache" vs "UI prefs"**: comment trong code đánh dấu `statusTab` + `pageSize` là **được persist**. Bài 5 sẽ chỉ lưu 2 field này vào localStorage (qua `persist` middleware), **không** persist `tasks` (vì service mới là nguồn sự thật). Đây là lý do ta tách rõ trong type ngay từ đầu.
- **Actions là field kiểu hàm.** TS mô tả store action bằng signature hàm:
  - `fetchTasks: (params) => Promise<void>` — gọi API, set lại `tasks`/`total`; không trả gì (`void`).
  - `createTask: (payload) => Promise<Task>` — trả `Task` vừa tạo (để trang điều hướng / hiển thị).
  - `setStatusTab` / `setPageSize` — setter đồng bộ (`=> void`), không async.

  Lưu ý các action **trả `Promise`** đều là async (gọi service có network delay). Setter UI thì sync.

---

## 6. `import type` vs `import` — và path alias `@/`

### `import type` vs `import`

Bạn để ý mọi file trên đều dùng `import type { ... }`. Khác biệt:

```ts
import type { Task } from '@/types/entities/task'  // ✅ chỉ kiểu
import { taskApi } from '@/services/api/taskApi'   // import giá trị runtime (bài 4)
```

| | `import type` | `import` (thường) |
|---|---|---|
| Cái gì được import | **chỉ kiểu** (interface, type alias) | giá trị runtime (function, const, class) + có thể cả kiểu |
| Sau khi compile | **bị xóa hoàn toàn** khỏi JS | giữ lại trong bundle |
| Tác dụng phụ | không kéo theo file vào bundle | có thể kéo file vào bundle |

- Dùng `import type` khi chỉ cần **kiểu** → trình biên dịch **xóa sạch** dòng import đó khi build, không để lại import thừa trong JS, tránh circular import vô tình và giúp bundle gọn.
- Dùng `import` thường khi cần **giá trị chạy thật** — như `taskApi` (object có method), `create` của Zustand. Những thứ này phải tồn tại lúc runtime.
- Quy tắc đơn giản: **interface/type → `import type`; function/const/object → `import`.** Tất cả file type ở bài này import 100% là kiểu, nên 100% dùng `import type`.

> TS strict mode (project này bật) khuyến khích mạnh việc này; một số cấu hình (`verbatimModuleSyntax`) còn **bắt buộc** tách rõ `import type`. Cứ tập thói quen ngay.

### Path alias `@/`

Mọi import dùng `@/types/...` thay vì đường dẫn tương đối `../../entities/task`. Alias `@` = `src/` đã config ở **bài 2** (cả `vite.config.ts` lẫn `tsconfig.app.json`). Lợi ích:

- Không còn đếm `../../..` — đổi vị trí file không vỡ import.
- Đọc ra ngay file nằm tầng nào: `@/types/api/task` rõ hơn `../../api/task`.

→ Từ bài này trở đi, **mọi** import nội bộ đều dùng `@/`.

---

## 7. Cây thư mục sau bài 3

Sau khi tạo xong 6 file, `src/types/` trông như sau:

```
src/types/
├── entities/
│   └── task.ts        # Task, TaskStatus            (tầng 1 — domain)
├── api/
│   ├── common.ts      # ApiResponse<T>, Paginated<T>  (tầng 2 — chung)
│   └── task.ts        # ListTaskParams, CreateTaskPayload, UpdateTaskPayload
├── pages/
│   └── task.ts        # TaskFormValues              (tầng 3 — form)
├── features/
│   └── task.ts        # TaskFilterState             (tầng 4 — filter/UI)
└── store/
    └── task.ts        # TaskStoreState              (tầng 5 — store)
```

Chiều phụ thuộc (import) luôn đi **xuống**:

```
store ──┬──→ api ──→ entities
        └──────────→ entities
pages ───────────→ (không import — string thuần)
features ─────────→ entities
api ──────────────→ entities
```

---

## 8. Sai lầm thường gặp (đọc kỹ!)

### 8.1. Dùng chung `Task` cho cả form và payload

Triệu chứng: form khai `useForm<Task>()` → TS bắt bạn cung cấp `id`, `created_at`, `status` trong `defaultValues` dù form không có mấy field đó.
→ Form dùng `TaskFormValues`. Payload tạo dùng `CreateTaskPayload`. **Đừng** ép `Task` vào mọi nơi.

### 8.2. Để `due_date: Date | null` trong `TaskFormValues`

Triệu chứng: React cảnh báo "changing controlled to uncontrolled", hoặc input date trống trơn.
→ Form luôn là string. `due_date: string`, mặc định `''`. Convert sang `null` lúc submit (`due_date || null`).

### 8.3. Nhét `'all'` vào `TaskStatus` (entities)

Triệu chứng: TS cho phép tạo task `status: 'all'` — vô nghĩa về nghiệp vụ.
→ `'all'` chỉ thuộc filter. Giữ `TaskStatus` đúng 3 giá trị; thêm `'all'` **tại chỗ dùng**: `TaskStatus | 'all'`.

### 8.4. Đổi snake_case thành camelCase ở tầng api

Triệu chứng: gọi API xong `res.data.page_size` là `undefined` vì BE trả `page_size` còn type khai `pageSize`.
→ Tầng api **khớp đúng JSON BE** (snake_case). Chuyển sang camelCase chỉ ở tầng UI (features/store), map tại biên.

### 8.5. Dùng `import` thường cho interface

```ts
import { Task } from '@/types/entities/task'       // ⚠️ với verbatimModuleSyntax sẽ lỗi
import type { Task } from '@/types/entities/task'  // ✅
```
→ Interface/type → luôn `import type`.

### 8.6. Dùng `any` cho response thay vì generic

```ts
function list(): Promise<{ data: any }>           // ❌ mất hết type
function list(): Promise<ApiResponse<Paginated<Task>>>  // ✅
```
→ Có generic rồi thì dùng. `any` là tắt TS — phí công chia tầng.

---

## 9. Checkpoint Bài 3

- [ ] `src/types/entities/task.ts` có `TaskStatus` (union 3 giá trị) + `interface Task`
- [ ] `src/types/api/common.ts` có `ApiResponse<T>` + `Paginated<T>`
- [ ] `src/types/api/task.ts` có `ListTaskParams`, `CreateTaskPayload`, `UpdateTaskPayload` (= `Partial<CreateTaskPayload>`), re-export `Task`
- [ ] `src/types/pages/task.ts` có `TaskFormValues` (mọi field `string`, `due_date: string`)
- [ ] `src/types/features/task.ts` có `TaskFilterState`
- [ ] `src/types/store/task.ts` có `TaskStoreState` (data cache + UI prefs + actions)
- [ ] Tất cả import nội bộ dùng `import type` + alias `@/`
- [ ] Chạy `npx tsc --noEmit` (hoặc xem VS Code) — **không có** lỗi đỏ ở các file type

---

## 10. Câu hỏi tự kiểm tra

1. Vì sao không dùng chung một type `Task` cho cả entity, payload tạo mới, và form values?
2. `UpdateTaskPayload = Partial<CreateTaskPayload>` — `Partial<T>` làm gì, và vì sao hợp lý cho thao tác update?
3. Vì sao chọn union `'todo' | 'in_progress' | 'done'` thay vì `enum`? Nêu 2 lý do.
4. `TaskFormValues.due_date` là `string` (mặc định `''`), nhưng `Task.due_date` là `string | null`. Giải thích lý do và chỗ convert.
5. Generic `ApiResponse<T>` cho ta lợi ích gì so với khai `data: any`? Cho ví dụ với `T` là gì cho API list và API xóa.
6. Khi nào dùng `import type` vs `import` thường? Sau compile, `import type` để lại gì trong JS?

**Đáp án:**

1. Vì cùng một "Task" có **hình dạng khác nhau** ở mỗi ngữ cảnh: entity là record đã tồn tại (đủ `id`, `created_at`, mọi field bắt buộc); payload tạo mới **chưa có** `id`/`status`/timestamp (server tự sinh); form values mọi field là **string** (vì input HTML trả string). Dùng chung 1 type buộc phải nhét đầy `?` và `| null` → TS không còn bảo vệ chính xác từng ngữ cảnh.

2. `Partial<T>` biến **mọi field của `T` thành optional** (`?`). Hợp lý cho update vì khi cập nhật, người dùng có thể chỉ sửa một phần (chỉ `title`, hoặc chỉ `due_date`) — không bắt gửi lại toàn bộ. Tái dùng `CreateTaskPayload` nên thêm field vào Create thì Update tự cập nhật theo (DRY).

3. (1) Union literal **không sinh runtime code** — compile xong biến mất, không tốn bundle; enum tạo object JS thật. (2) Data từ API/JSON là string thuần nên so sánh `=== 'done'` là tự nhiên, không phải map qua `Enum.Done`. (Cộng thêm: tree-shaking tốt hơn, cú pháp gọn.)

4. Vì `<input type="date">` + RHF luôn lưu **string** (`''` khi rỗng, `'2026-06-30'` khi có) — input không hiểu `null`/`Date`. Nếu khai `Date | null` sẽ phải convert mỗi lần đổi và gây cảnh báo controlled/uncontrolled. Nên giữ string suốt trong form, convert **một lần lúc submit**: `due_date || null` (`''` → `null`, ngày → giữ nguyên).

5. Generic giữ **type chính xác cho `data`** trong khi `success`/`message` dùng chung; `any` thì mất sạch type, IDE không gợi ý, không bắt lỗi. Ví dụ: API list → `ApiResponse<Paginated<Task>>` (`data.items` là `Task[]`); API xóa → `ApiResponse<null>` (`data` là `null`).

6. `import type` khi **chỉ cần kiểu** (interface, type alias) — sau compile bị **xóa hoàn toàn**, không để lại gì trong JS. `import` thường khi cần **giá trị runtime** (function, const, object như `taskApi`) — được giữ lại trong bundle. Quy tắc: interface/type → `import type`; function/const → `import`.

---

## 11. So sánh với QLVB thật

Mở `frontend/src/types/` của QLVB:

| Khía cạnh | QLVB | Bài 3 (task-app) |
|---|---|---|
| Tầng type | `entities/`, `api/`, `pages/`, `features/`, `store/` (đủ 5) | đủ 5 tầng, mỗi tầng 1 file `task.ts` |
| entities | nhiều domain: `documents/incoming.ts`, `documents/outgoing.ts`, `users/...` | 1 entity `task.ts` |
| Số entity con | hàng chục (incoming, outgoing, internal doc, user, role, ...) | 1 (`Task`) |
| Wrapper response | `ApiResponse<T>`, `PaginatedResponse<T>` (tên có thể khác chút) | `ApiResponse<T>`, `Paginated<T>` |
| status doc | union nhiều giá trị (`draft`, `pending`, `signed`, `archived`, ...) | union 3 (`todo`, `in_progress`, `done`) |
| `Partial` cho update | có (`UpdateXxxPayload`) | `UpdateTaskPayload = Partial<CreateTaskPayload>` |

→ App này là **subset** cấu trúc type QLVB: cùng pattern 5 tầng, cùng generic, cùng quy ước `import type` + alias — chỉ ít entity hơn để dễ học.

---

## 12. Khi nào sang bài 4?

Khi tất cả checkbox phần 9 đều tick (6 file type tạo xong, `tsc --noEmit` sạch). Bài 4 sẽ làm:

- Viết **service layer mock** = "backend giả": `services/api/base.ts` (delay + đọc/ghi localStorage) và `services/api/taskApi.ts`.
- Service là **single source of truth**, seed 3 task mẫu lần đầu vào key `task-app:tasks`, giả lập network delay ~300ms.
- Mọi method (`list`, `getById`, `create`, `update`, `markDone`, `remove`) trả về `ApiResponse<T>` — chính các type ta vừa viết ở bài 3.
- Hiểu vì sao tách service khỏi store, và vì sao mock interface y hệt API thật (để bài 11 swap sang Go BE chỉ cần đổi import).

Báo tôi "xong bài 3" để tôi viết tiếp `bai-04-service-layer-mock.md`.

---

**Bài 3 — phiên bản 2026-06-08.**
