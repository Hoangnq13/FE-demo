# Bài 5 — Zustand store + persist

> **Thời lượng**: ~60 phút.
> **Mục tiêu**: Hiểu Zustand là gì (so với Context / Redux), tạo `store/taskStore.ts` đúng spec bằng `create<T>()(...)` + `persist` middleware, dùng selector `useTaskStore(s => s.tasks)` để tránh re-render thừa, viết action async gọi `taskApi`, quản lý `loading`/`error`, và quan trọng nhất: hiểu vì sao **chỉ persist UI prefs** chứ không persist cả mảng `tasks`.
> **Map QLVB**: `frontend/src/store/authStore.ts` (cùng pattern Zustand + persist — nhưng QLVB persist **token**, ta persist **UI prefs**).

---

## 0. Bài này đứng ở đâu trong app?

Nhắc lại quyết định kiến trúc (đã chốt ở bài 4):

- **Service layer** (`services/api/taskApi.ts`, bài 4) = "backend giả" = **single source of truth** cho danh sách task. Nó đọc/ghi `localStorage` key `task-app:tasks`, giả lập delay ~300ms, trả `ApiResponse<T>`.
- **Store Zustand** (bài 5, bài này) = **cache phía client + UI state**. Store **gọi `taskApi`**, KHÔNG tự đụng vào `localStorage` cho danh sách task. Store chỉ dùng `persist` để lưu **UI prefs** (status tab + page size) ở key `task-app:ui`.

Hình dung luồng dữ liệu:

```
Component  ──gọi action──▶  Zustand store  ──gọi──▶  taskApi  ──đọc/ghi──▶  localStorage (task-app:tasks)
    ▲                            │
    └──────selector đọc──────────┘
         (tasks, loading, error, statusTab, pageSize)
```

→ Store là **trạm trung gian**: component không gọi thẳng `taskApi`, mà gọi `store.fetchTasks()`. Store gọi api, nhận kết quả, cập nhật state → component đọc state qua selector và re-render.

---

## 1. Zustand là gì? So với Context và Redux

**Zustand** (tiếng Đức nghĩa là "state/trạng thái") là một thư viện quản lý state global cho React. Nhỏ (~1KB), không boilerplate, không cần Provider bọc cây component.

### 1.1. Bảng so sánh

| Khía cạnh | React Context | Redux (Toolkit) | **Zustand** |
|---|---|---|---|
| Boilerplate | Trung bình (Provider + useReducer) | Nhiều (slice, action, reducer, dispatch) | **Rất ít** (1 hàm `create`) |
| Cần Provider bọc app | Có | Có (`<Provider store>`) | **Không** |
| Re-render khi state đổi | **Toàn bộ consumer** re-render | Có selector (`useSelector`) tránh được | **Có selector** tránh được |
| Async logic | Tự xử lý ngoài | Cần thunk / middleware | **Viết thẳng trong action** |
| DevTools | Không | Có | Có (middleware `devtools`) |
| Học trong bao lâu | 30 phút | Vài ngày | **15 phút** |

### 1.2. Vì sao QLVB và bài này chọn Zustand?

- **Context** sinh ra để **truyền** giá trị, không phải để **quản lý state thay đổi liên tục**. Mỗi lần value đổi → **mọi** component dùng `useContext` re-render, kể cả component chỉ cần 1 field nhỏ. Với danh sách task lọc/đổi trang liên tục → re-render thừa rất nhiều.
- **Redux** mạnh nhưng nặng boilerplate. Với app nội bộ cỡ task-app / QLVB thì over-engineering.
- **Zustand** vừa đủ: có selector để tối ưu re-render (giống Redux), nhưng viết gọn như một custom hook bình thường (giống Context). Action async (gọi api) viết thẳng trong store, không cần thunk.

→ Đây chính xác là lý do QLVB dùng Zustand cho `authStore`, `uiStore`, ... và ta học theo.

---

## 2. Cài Zustand

Trong `task-app/`:

```powershell
npm i zustand
```

Đợi ~10 giây. Mở `package.json` confirm `"dependencies"` có `"zustand"`.

> Zustand không có peer dependency phức tạp như MUI. Chỉ cần React ≥ 18 (ta đang dùng React 19 — OK).

---

## 3. `create<T>()(...)` — cú pháp cốt lõi

Trước khi viết store thật, hiểu khung cú pháp đã. Đây là chỗ người mới hay sai nhất.

```ts
import { create } from 'zustand'

const useStore = create<MyState>()((set, get) => ({
  // state + actions ở đây
}))
```

Để ý có **HAI** cặp ngoặc liên tiếp: `create<MyState>()(...)`.

### 3.1. Vì sao có 2 cặp ngoặc?

- `create<MyState>()` — cặp ngoặc **thứ nhất** (rỗng). Đây là một mẹo của TypeScript gọi là **"currying để suy luận generic"**. Vì TS không thể vừa nhận generic `<MyState>` ta khai báo, vừa tự suy luận type của initializer cùng lúc, Zustand tách thành 2 bước: bước 1 nhận type `MyState`, bước 2 nhận hàm initializer.
- `(set, get) => ({ ... })` — cặp ngoặc **thứ hai**, là **initializer**: hàm trả về object state + actions. Zustand đưa cho bạn 2 công cụ:
  - `set` — cập nhật state (merge nông — shallow merge).
  - `get` — đọc state hiện tại bên trong action (không gây subscribe).

> **Ghi nhớ**: khi khai generic `create<T>()(...)` thì **bắt buộc** có `()` rỗng ở giữa. Nếu viết `create<T>(...)` (thiếu `()`) → TS báo lỗi type khó hiểu. Đây là sai lầm số 1, xem mục "Sai lầm thường gặp".

### 3.2. `set` hoạt động thế nào?

```ts
set({ loading: true })             // chỉ cập nhật field `loading`, các field khác GIỮ NGUYÊN
set({ tasks: [], total: 0 })       // cập nhật nhiều field một lúc
set((s) => ({ count: s.count + 1 }))  // dạng hàm: đọc state cũ rồi tính state mới
```

- `set` **merge nông**: object bạn truyền vào được trộn vào state hiện tại ở **tầng 1**. Field không nhắc tới thì giữ nguyên (khác `useState` của React — `useState` thay nguyên giá trị).
- Dạng hàm `set((s) => ...)` dùng khi state mới phụ thuộc state cũ (an toàn với cập nhật bất đồng bộ).

### 3.3. `get` dùng khi nào?

`get()` trả về **toàn bộ state hiện tại** ngay tại thời điểm gọi, không tạo subscription. Dùng bên trong action khi cần đọc state để quyết định:

```ts
doSomething: () => {
  const { pageSize } = get()   // đọc pageSize hiện tại
  // ... dùng pageSize
}
```

(Trong taskStore của ta, các action chủ yếu chỉ `set`, `get` ít dùng — nhưng nhớ là có nó.)

---

## 4. Selector — chìa khóa tránh re-render thừa

Đây là điểm khiến Zustand "đáng tiền" so với Context.

### 4.1. Hook trả về gì?

`useTaskStore` là một **hook**. Bạn gọi nó với một **selector** — hàm nhận toàn bộ state, trả về **đúng phần** bạn cần:

```tsx
const tasks = useTaskStore((s) => s.tasks)        // chỉ subscribe `tasks`
const loading = useTaskStore((s) => s.loading)    // chỉ subscribe `loading`
const fetchTasks = useTaskStore((s) => s.fetchTasks)  // lấy action
```

→ Component **chỉ re-render khi đúng mảnh đó thay đổi**. `loading` đổi từ `true`→`false` thì component chỉ đọc `tasks` **không** re-render (nếu `tasks` chưa đổi).

### 4.2. Đối lập: lấy cả object → re-render thừa

```tsx
// ❌ XẤU: lấy nguyên state
const { tasks, loading } = useTaskStore((s) => ({ tasks: s.tasks, loading: s.loading }))
```

Mỗi lần render, selector trả về **object MỚI** (`{ tasks, loading }` là literal mới mỗi lần) → Zustand so sánh tham chiếu thấy "khác" → component re-render kể cả khi `tasks` và `loading` đều y nguyên. Đây là bẫy kinh điển.

### 4.3. Cách lấy nhiều field đúng

Có 2 cách an toàn:

**Cách 1 — tách từng selector (đơn giản, khuyên dùng cho task-app):**

```tsx
const tasks = useTaskStore((s) => s.tasks)
const loading = useTaskStore((s) => s.loading)
const fetchTasks = useTaskStore((s) => s.fetchTasks)
```

**Cách 2 — dùng `useShallow` (khi cần gom nhiều field):**

```tsx
import { useShallow } from 'zustand/react/shallow'

const { tasks, loading } = useTaskStore(
  useShallow((s) => ({ tasks: s.tasks, loading: s.loading })),
)
```

`useShallow` so sánh **nông** từng field thay vì so sánh tham chiếu object → object literal mới nhưng field cũ thì **không** re-render.

> Trong bài này (và `TaskListPage` bài 7) ta dùng **Cách 1** cho rõ ràng. `useShallow` để dành khi component cần ≥4 field cùng lúc.

---

## 5. Viết `store/taskStore.ts` (đúng spec)

Tạo folder `src/store/` rồi file `taskStore.ts`:

```powershell
New-Item -ItemType Directory -Path src/store -Force
```

`src/store/taskStore.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskStoreState } from '@/types/store/task'
import { taskApi } from '@/services/api/taskApi'
import { STORAGE_KEY_UI, DEFAULT_PAGE_SIZE } from '@/constants/task'

export const useTaskStore = create<TaskStoreState>()(
  persist(
    (set, get) => ({
      tasks: [],
      total: 0,
      loading: false,
      error: null,
      statusTab: 'all',
      pageSize: DEFAULT_PAGE_SIZE,

      fetchTasks: async (params) => {
        set({ loading: true, error: null })
        try {
          const res = await taskApi.list(params)
          set({ tasks: res.data.items, total: res.data.total, loading: false })
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Lỗi tải task', loading: false })
        }
      },

      createTask: async (payload) => {
        const res = await taskApi.create(payload)
        return res.data
      },

      updateTask: async (id, payload) => {
        const res = await taskApi.update(id, payload)
        return res.data
      },

      markDone: async (id) => {
        await taskApi.markDone(id)
      },

      deleteTask: async (id) => {
        await taskApi.remove(id)
      },

      setStatusTab: (tab) => set({ statusTab: tab }),
      setPageSize: (n) => set({ pageSize: n }),
    }),
    {
      name: STORAGE_KEY_UI,
      // CHỈ persist UI prefs, KHÔNG persist tasks (service đã là nguồn sự thật)
      partialize: (s) => ({ statusTab: s.statusTab, pageSize: s.pageSize }),
    },
  ),
)
```

> `get` được khai trong `(set, get) => ...` để đúng signature và sẵn sàng cho các bài sau, dù taskStore phiên bản này chưa dùng tới. Đừng xóa — bài 7+ có thể cần.

### 5.1. Nhắc lại type `TaskStoreState` (đã tạo ở bài 3)

```ts
// types/store/task.ts
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

→ Store **implement đúng** interface này. TS sẽ báo đỏ nếu thiếu field hoặc sai signature. Đây là lợi ích của việc tách type ra trước (bài 3).

### 5.2. Đọc từng phần store

| Phần | Giải thích |
|---|---|
| `create<TaskStoreState>()(...)` | Generic là `TaskStoreState`. Nhớ `()` rỗng ở giữa. |
| `persist(initializer, options)` | Bọc initializer trong middleware `persist` để tự lưu/khôi phục một phần state vào `localStorage`. |
| `tasks: [], total: 0, loading: false, error: null` | **Data cache** — KHÔNG persist (xem mục 6). Khởi tạo rỗng, mỗi lần mở app là fetch lại từ service. |
| `statusTab: 'all', pageSize: DEFAULT_PAGE_SIZE` | **UI prefs** — ĐƯỢC persist. Lần sau mở app, tab và page size người dùng chọn vẫn còn. |
| `fetchTasks` | Action async: bật `loading`, gọi `taskApi.list`, đổ kết quả vào `tasks`/`total`, bắt lỗi vào `error`. |
| `createTask`/`updateTask` | Gọi api, trả về `Task` để component dùng (vd navigate sang detail). KHÔNG tự sửa `tasks` cache — component sẽ gọi lại `fetchTasks` để đồng bộ. |
| `markDone`/`deleteTask` | Gọi api thay đổi dữ liệu rồi xong. Component tự reload danh sách. |
| `setStatusTab`/`setPageSize` | Setter UI prefs đồng bộ (`set` thuần, không async). |

### 5.3. `persist` options

| Option | Ý nghĩa |
|---|---|
| `name: STORAGE_KEY_UI` | Key `localStorage` để lưu = `'task-app:ui'`. Mỗi store persist phải có name **riêng**, không trùng `task-app:tasks` của service. |
| `partialize: (s) => ({ statusTab, pageSize })` | Hàm chọn **đúng phần** state cần lưu. Trả về object chỉ gồm 2 field UI prefs → chỉ 2 field này được ghi vào `localStorage`. `tasks`, `loading`, `error`, ... **bị bỏ qua**. |

> Mặc định nếu **không** khai `partialize`, `persist` sẽ lưu **toàn bộ** state (gồm cả `tasks`) — đó chính là điều ta **không** muốn. `partialize` là cái van chặn.

---

## 6. ĐIỂM QUAN TRỌNG NHẤT — Vì sao KHÔNG persist `tasks`?

Đây là phần đáng giá nhất của bài 5. Đọc kỹ.

### 6.1. Vấn đề "hai nguồn sự thật" (two sources of truth)

Danh sách task **đã** được lưu ở `localStorage` key `task-app:tasks` — do **service layer** (bài 4) quản lý. Service là **single source of truth**.

Giả sử ta **cũng** persist `tasks` của store vào key `task-app:ui`. Khi đó danh sách task tồn tại ở **hai chỗ**:

```
task-app:tasks  ← service quản lý (nguồn thật)
task-app:ui     ← store persist tasks (bản sao)
```

Chuyện gì xảy ra khi user tạo task mới?

1. `createTask` gọi `taskApi.create` → service ghi task mới vào `task-app:tasks`. ✅ Đúng.
2. Nhưng bản sao trong `task-app:ui` **vẫn cũ** (chưa có task mới).
3. Lần sau mở app, `persist` khôi phục `tasks` từ `task-app:ui` (bản cũ) → user thấy **thiếu task vừa tạo**.
4. Đến khi gọi `fetchTasks` thì lại nhảy ra task mới → màn hình **nhấp nháy** giữa 2 trạng thái.

→ Đây là **two sources of truth bị lệch nhau**: cùng một dữ liệu, hai bản, cập nhật không đồng bộ → bug khó debug, dữ liệu hiển thị sai.

### 6.2. Giải pháp: chỉ một nguồn thật + cache tạm

Quy tắc: **một dữ liệu chỉ được "thật" ở MỘT nơi.**

- `tasks` thật ở **service** (`task-app:tasks`).
- Store chỉ giữ `tasks` như **cache tạm trong RAM**, khởi tạo rỗng mỗi lần load app, luôn lấy lại từ service qua `fetchTasks`.
- Vì cache là tạm → **không persist**. Mỗi lần mở app fetch lại → luôn khớp nguồn thật, không bao giờ lệch.

→ `partialize` chỉ giữ `statusTab` + `pageSize`. `tasks` cố tình bị loại.

### 6.3. Vậy cái gì ĐÁNG persist? — UI prefs

`statusTab` và `pageSize` là **client state thuần** — chỉ tồn tại ở phía client, không phải bản sao của dữ liệu server. Persist chúng là **hợp lý**:

- Không có "nguồn thật" nào khác cho việc "user thích xem tab nào, mỗi trang bao nhiêu dòng" → store **chính là** nguồn thật.
- Persist để trải nghiệm tốt hơn: đóng app, mở lại vẫn ở tab/page size cũ.
- Không có rủi ro lệch vì không có bản sao thứ hai.

### 6.4. Đối chiếu QLVB: `authStore` persist **token**

Mở `frontend/src/store/authStore.ts` của QLVB — cùng pattern Zustand + persist, nhưng nó persist **token đăng nhập**:

```ts
// QLVB authStore (rút gọn)
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token) => set({ token }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'qlvb:auth',
      partialize: (s) => ({ token: s.token }),  // chỉ persist token
    },
  ),
)
```

Vì sao persist token **đúng**? Vì:

| | `tasks` (KHÔNG persist) | `token` (persist hợp lý) |
|---|---|---|
| Bản chất | Bản sao dữ liệu server | **Client state thuần** (do server cấp 1 lần, client giữ) |
| Có nguồn thật khác không? | Có — service/`localStorage` tasks | Không — token chỉ sống ở client |
| Persist gây lệch không? | **Có** — service đổi, bản sao cũ | Không — token không bị "tính lại" ở chỗ khác |
| Mục đích persist | (không persist) | Giữ phiên đăng nhập sau khi F5 / mở lại tab |

→ Quy tắc chung rút ra: **persist cái KHÔNG có nguồn thật nào khác (client state / UI prefs); KHÔNG persist cái là bản sao của dữ liệu server.** QLVB persist token (client state), ta persist UI prefs (client state). Cả hai đều tránh được two-sources-of-truth.

---

## 7. Test store nhanh trong `App.tsx`

Trước khi có UI thật (bài 7), ta test store bằng cách gọi `fetchTasks` tạm trong `App.tsx` và log ra console.

Sửa `src/App.tsx` (tạm thời):

```tsx
import { useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useTaskStore } from '@/store/taskStore'

function App() {
  const tasks = useTaskStore((s) => s.tasks)
  const total = useTaskStore((s) => s.total)
  const loading = useTaskStore((s) => s.loading)
  const error = useTaskStore((s) => s.error)
  const statusTab = useTaskStore((s) => s.statusTab)
  const pageSize = useTaskStore((s) => s.pageSize)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)

  useEffect(() => {
    fetchTasks({ status: 'all', page: 1, page_size: pageSize })
  }, [fetchTasks, pageSize])

  useEffect(() => {
    console.log('[taskStore] tasks =', tasks)
  }, [tasks])

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Test taskStore (bài 5)
      </Typography>
      <Typography variant="body2">loading: {String(loading)}</Typography>
      <Typography variant="body2">error: {error ?? '—'}</Typography>
      <Typography variant="body2">total: {total}</Typography>
      <Typography variant="body2">statusTab: {statusTab}</Typography>
      <Typography variant="body2">pageSize: {pageSize}</Typography>
      <Typography variant="body2">số task đang cache: {tasks.length}</Typography>
    </Box>
  )
}

export default App
```

### 7.1. Chạy và kiểm tra

```powershell
npm run dev
```

Mở browser + DevTools (F12):

1. **Console** in `[taskStore] tasks = []` (lần đầu) rồi `[taskStore] tasks = [Array(3)]` sau ~300ms (delay giả lập của service). 3 task seed mẫu xuất hiện.
2. Trên màn hình: `loading` nhảy `true` → `false`, `total: 3`, `số task đang cache: 3`.
3. Mở tab **Application → Local Storage**:
   - `task-app:tasks` — chứa **3 task đầy đủ** (do service tạo).
   - `task-app:ui` — chứa **chỉ** `{"state":{"statusTab":"all","pageSize":5},"version":0}`. **KHÔNG** có `tasks` trong đó. → Đúng spec.

### 7.2. Test persist UI prefs

1. Trong console, chỉnh thử: `useTaskStore.getState().setPageSize(20)` (gõ trực tiếp). Hoặc đợi UI bài 7.
2. Xem `task-app:ui` đổi thành `pageSize: 20`.
3. **F5 reload trang.** → `pageSize` vẫn là `20` (khôi phục từ `localStorage`), nhưng `tasks` lại fetch mới từ service → khớp nguồn thật. Đây chính là hành vi ta muốn.

> Sau khi test xong, nhớ **khôi phục** `App.tsx`. Code test này chỉ để verify store, bài 7 sẽ thay bằng `TaskListPage` thật.

---

## 8. Sai lầm thường gặp (đọc kỹ!)

### 8.1. Quên `()` thứ hai trong `create<T>()()`

```ts
const useStore = create<MyState>((set) => ({ ... }))     // ❌ thiếu () giữa
const useStore = create<MyState>()((set) => ({ ... }))   // ✅ đúng
```

Triệu chứng: TS báo lỗi type rất khó hiểu kiểu *"Argument of type ... is not assignable to parameter of type ..."*. Nguyên nhân: khi khai generic tường minh, Zustand cần dạng curry. Cứ thấy `create<T>` thì phải có `()` rỗng theo sau.

### 8.2. Selector trả về object literal → re-render thừa

```tsx
const { tasks, loading } = useTaskStore((s) => ({ tasks: s.tasks, loading: s.loading }))  // ❌
```

Object literal mới mỗi render → component re-render kể cả khi `tasks`/`loading` không đổi. Sửa: tách selector từng field, hoặc bọc `useShallow` (mục 4.3).

### 8.3. Persist cả `tasks` → hai nguồn sự thật lệch nhau

Bỏ `partialize`, hoặc khai `partialize: (s) => s` (lưu hết) → `tasks` bị persist → dữ liệu hiển thị cũ/nhấp nháy, lệch với service. Luôn `partialize` chỉ UI prefs (mục 6).

### 8.4. Gọi action như selector

```tsx
useTaskStore.fetchTasks()           // ❌ sai, store không có property này trực tiếp
const fetchTasks = useTaskStore((s) => s.fetchTasks)  // ✅ lấy qua selector
fetchTasks()
```

Hoặc ngoài React (vd trong file util) thì dùng `useTaskStore.getState().fetchTasks()`.

### 8.5. Đọc state cũ trong action mà dùng biến closure thay vì `get()`

Trong action async, nếu cần state **mới nhất** giữa chừng, dùng `get()` chứ đừng giữ biến cũ từ ngoài — biến closure có thể đã stale.

### 8.6. Trùng `name` của persist với key service

`name` của persist phải là `task-app:ui`, KHÔNG được trùng `task-app:tasks`. Trùng key → hai cái ghi đè nhau, hỏng dữ liệu.

---

## 9. Checkpoint Bài 5

- [ ] `npm i zustand` chạy không lỗi, `package.json` có `zustand`
- [ ] Tạo `src/store/taskStore.ts` đúng spec (`create<TaskStoreState>()(persist(...))`)
- [ ] Store implement đủ 8 field/action của `TaskStoreState`, không TS đỏ
- [ ] `persist` khai `name: STORAGE_KEY_UI` và `partialize` chỉ gồm `statusTab` + `pageSize`
- [ ] Test trong `App.tsx`: console log ra 3 task seed sau ~300ms
- [ ] DevTools → Local Storage: `task-app:tasks` có 3 task, `task-app:ui` CHỈ có `statusTab` + `pageSize` (KHÔNG có `tasks`)
- [ ] F5 reload: `pageSize` được giữ, `tasks` fetch lại mới
- [ ] Hiểu vì sao KHÔNG persist `tasks` (giải thích được "two sources of truth")
- [ ] Khôi phục lại `App.tsx` sau khi test xong

---

## 10. Câu hỏi tự kiểm tra

1. Zustand khác React Context ở điểm cốt lõi nào về **re-render**? Vì sao điều đó quan trọng với danh sách task lọc liên tục?
2. Vì sao `create<TaskStoreState>()(...)` có HAI cặp ngoặc? Bỏ cặp rỗng ở giữa thì sao?
3. `useTaskStore((s) => ({ tasks: s.tasks, loading: s.loading }))` có vấn đề gì? Sửa thế nào?
4. Tại sao ta KHÔNG persist `tasks` mà chỉ persist `statusTab` + `pageSize`? Mô tả bug xảy ra nếu persist cả `tasks`.
5. QLVB `authStore` persist **token** — vì sao đó là quyết định ĐÚNG, không vi phạm nguyên tắc của câu 4?
6. `set` của Zustand merge nông hay thay nguyên state? Khác `useState` của React thế nào?

**Đáp án:**

1. Context: mọi consumer `useContext` re-render khi value đổi (kể cả chỉ cần 1 field). Zustand: dùng **selector** `(s) => s.x` nên component chỉ re-render khi đúng mảnh `x` đổi. Với danh sách task đổi tab/search/trang liên tục, `loading` bật/tắt liên tục — selector giúp component chỉ-đọc-`tasks` không re-render thừa, app mượt hơn.

2. Vì TypeScript không thể vừa nhận generic tường minh `<TaskStoreState>` vừa suy luận type của initializer trong một lần gọi. Zustand tách curry: `create<T>()` (bước nhận type, ngoặc rỗng) rồi `(...)` (bước nhận initializer). Bỏ cặp `()` giữa → TS báo lỗi type khó hiểu, không compile.

3. Selector trả về **object literal mới** mỗi lần render → so sánh tham chiếu luôn "khác" → component re-render kể cả khi `tasks`/`loading` không đổi. Sửa: tách 2 selector riêng (`const tasks = useTaskStore(s => s.tasks)` ...), hoặc bọc `useShallow((s) => ({ tasks, loading }))` để so sánh nông từng field.

4. Vì `tasks` đã có **nguồn sự thật duy nhất** là service (`task-app:tasks`). Persist thêm vào store → hai bản sao. Khi tạo/sửa task, service cập nhật nhưng bản persist trong store vẫn cũ → lần mở app sau hiển thị danh sách cũ, rồi `fetchTasks` nhảy ra bản mới → màn hình nhấp nháy / hiển thị sai. `tasks` chỉ nên là cache tạm trong RAM, khởi tạo rỗng, luôn fetch lại.

5. Vì `token` là **client state thuần**, không phải bản sao của dữ liệu nào ở chỗ khác — token chỉ sống ở client (server cấp một lần). Không có "nguồn thật thứ hai" để lệch. Persist nó để giữ phiên đăng nhập sau khi F5/mở lại tab. Quy tắc: persist cái không có nguồn thật khác (client state), không persist cái là bản sao của server data. `statusTab`/`pageSize` cũng là client state → persist hợp lý y như token.

6. `set` merge **nông**: object truyền vào được trộn vào tầng 1 của state, field không nhắc tới **giữ nguyên**. Khác `useState`: `setState(newValue)` **thay nguyên** giá trị; muốn merge phải tự `setState(prev => ({ ...prev, ...patch }))`. Zustand tự merge giúp nên `set({ loading: true })` không xóa các field khác.

---

## 11. So sánh với QLVB thật

Mở `frontend/src/store/` của QLVB:

| Khía cạnh | QLVB | Bài 5 (task-app) |
|---|---|---|
| Số store | Nhiều (`authStore`, `uiStore`, `notificationStore`, ...) | 1 (`taskStore`) |
| Middleware | `persist` + `devtools` (+ đôi chỗ `immer`) | chỉ `persist` |
| Cái được persist | `authStore`: token; `uiStore`: theme, sidebar collapsed | `statusTab`, `pageSize` |
| Cái KHÔNG persist | data từ API (danh sách văn bản, user list, ...) | `tasks`, `total`, `loading`, `error` |
| Cách gọi API trong action | giống hệt — action async gọi service layer | giống |
| Selector | `useShallow` cho component nhiều field | tách selector / `useShallow` |

→ Bài 5 là **subset** store pattern của QLVB: cùng `create<T>()(persist(...))`, cùng nguyên tắc "chỉ persist client state, không persist server data". QLVB chỉ thêm `devtools`/`immer` và nhiều store hơn — bản chất không khác.

---

## 12. Khi nào sang bài 6?

Khi các checkbox phía trên đều tick, đặc biệt:

- Store chạy được, console log ra 3 task.
- `task-app:ui` chỉ chứa UI prefs, không có `tasks`.
- Bạn **giải thích được bằng lời** vì sao không persist `tasks` (two sources of truth) và vì sao QLVB persist token lại đúng.

Bài 6 sẽ làm:

- Viết **UI wrapper components** custom: `StatusChip`, `CustomTextField` (forwardRef, RHF-friendly), `ConfirmDialog`, generic `Table<T>`.
- Hiểu vì sao bọc component MUI thành wrapper riêng (đồng bộ style, dễ swap, ít lặp props).
- Pattern `forwardRef` để wrapper dùng được với react-hook-form (bài 8).

Báo tôi "xong bài 5" để tôi viết tiếp `bai-06-ui-wrappers-custom.md`.

---

**Bài 5 — phiên bản 2026-06-08.**
