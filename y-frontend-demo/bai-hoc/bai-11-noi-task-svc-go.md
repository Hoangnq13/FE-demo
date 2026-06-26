# Bài 11 (optional) — Nối task-svc Go thật bằng axios

> **Thời lượng**: ~90 phút.
> **Mục tiêu**: Cài axios, hiểu biến môi trường Vite (`import.meta.env`, prefix `VITE_`), tạo axios instance + interceptor, viết `taskApiHttp.ts` **cùng interface** với `taskApi` mock nhưng gọi BE thật, map response BE → shape chuẩn, rồi **swap 1 dòng import** trong store. Hiểu CORS, proxy dev của Vite, và khác biệt mock vs real.
> **Map QLVB**: real BE integration — `frontend/src/services/api/base.ts` (axios instance + interceptor gắn token, xử lý lỗi 401/403 tập trung), `frontend/.env`, `frontend/vite.config.ts` (`server.proxy`). Đây chính là cách QLVB nối FE ↔ BE Go thật.

---

## 0. Vì sao bài này là "phần thưởng" của cả khóa?

Suốt bài 4 → 10 ta code app với **service layer mock** (`taskApi.ts` đọc/ghi `localStorage`). Lý do: học pattern FE mà không phụ thuộc BE chạy hay không.

Nhưng từ đầu khóa ta đã **cố tình** thiết kế service layer như một lớp trừu tượng (abstraction):

- Store **không bao giờ** gọi `localStorage` trực tiếp — nó gọi `taskApi.list()`, `taskApi.create()`, ...
- `taskApi` trả về kiểu chuẩn `ApiResponse<T>` / `Paginated<T>`.
- Page/store **không cần biết** dữ liệu đến từ `localStorage` hay từ HTTP.

→ Lợi ích lộ ra ở bài này: muốn đổi từ mock sang BE thật, ta chỉ **viết 1 file mới cùng interface** (`taskApiHttp.ts`) rồi **đổi 1 dòng import** trong store. Phần còn lại của app (page, form, table) **không sửa gì**.

Đây là điểm quan trọng nhất cần "thấm" trong bài: **service abstraction** giúp swap backend gần như miễn phí.

> **Lưu ý ngay từ đầu**: BE `task-svc` Go nằm ở `y-golang-demo/`. Bài này giả định bạn chạy được nó ở `http://localhost:8080`. Nếu BE chưa chạy được, **vẫn đọc hết bài để hiểu**, rồi giữ nguyên mock (đổi lại 1 dòng import là về như cũ).

---

## 1. Cài axios

Trong `task-app/`:

```powershell
npm install axios
```

### Vì sao axios mà không dùng `fetch` thuần?

`fetch` có sẵn trong trình duyệt, nhưng axios tiện hơn cho app thật:

| Khía cạnh | `fetch` | `axios` |
|---|---|---|
| Parse JSON | phải tự gọi `await res.json()` | tự parse, nằm sẵn ở `res.data` |
| Lỗi HTTP (4xx/5xx) | **KHÔNG** reject — phải tự check `res.ok` | tự `throw` khi status ≥ 400 |
| Base URL | tự nối chuỗi | `baseURL` trong instance |
| Interceptor | không có | có (gắn header, xử lý lỗi tập trung) |
| Timeout | phải tự `AbortController` | option `timeout` |
| Hủy request | `AbortController` | hỗ trợ sẵn |

QLVB dùng axios → ta theo cùng. Điểm "tự throw khi 4xx/5xx" đặc biệt hợp với `try/catch` mà store đã viết sẵn ở bài 5.

---

## 2. Biến môi trường Vite — `.env` + `import.meta.env`

Base URL của BE **không nên** hard-code trong code. Lý do: dev chạy `localhost:8080`, staging/prod chạy domain khác. Ta đưa nó vào biến môi trường.

### 2.1. Tạo file `.env` ở gốc `task-app/`

```bash
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

### 2.2. Quy tắc biến môi trường của Vite (đọc kỹ — hay sai)

- Vite **chỉ** expose ra client những biến có **prefix `VITE_`**. Biến `API_BASE_URL` (không prefix) sẽ là `undefined` ở phía browser. Đây là cơ chế bảo mật: tránh lỡ tay leak secret (DB password, API key server) ra bundle.
- Đọc biến qua `import.meta.env.VITE_API_BASE_URL` (KHÔNG phải `process.env` — đó là Node, không có ở browser/Vite).
- File `.env` được đọc lúc **build/dev start**. Sửa `.env` xong phải **restart `npm run dev`** mới có hiệu lực (Vite không hot-reload `.env`).
- Thêm `.env` vào `.gitignore` nếu chứa giá trị nhạy cảm. Ở đây URL dev không nhạy cảm nhưng giữ thói quen tốt: commit `.env.example` (mẫu rỗng), bỏ `.env` thật.

### 2.3. (Tùy chọn) Khai type cho `import.meta.env`

Để TypeScript autocomplete và không gạch đỏ, tạo/sửa `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

→ Giờ gõ `import.meta.env.` IDE sẽ gợi ý `VITE_API_BASE_URL`.

---

## 3. Tạo axios instance + interceptor — `services/api/http.ts`

Ta không gọi `axios.get(...)` trực tiếp ở khắp nơi. Thay vào đó tạo **một instance** cấu hình sẵn `baseURL`, header, timeout — rồi dùng lại. Đây là pattern QLVB (`services/api/base.ts`).

Tạo `src/services/api/http.ts`:

```ts
import axios from 'axios'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10_000, // 10s — quá thời gian này coi như lỗi mạng
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Request interceptor: chạy TRƯỚC khi request bay đi ---
http.interceptors.request.use(
  (config) => {
    // Ví dụ gắn token (QLVB lấy từ authStore / localStorage).
    // task-app chưa có auth nên để placeholder minh hoạ:
    const token = localStorage.getItem('task-app:token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// --- Response interceptor: chạy SAU khi nhận response / khi lỗi ---
http.interceptors.response.use(
  (response) => response, // 2xx → trả nguyên response
  (error) => {
    // Xử lý lỗi TẬP TRUNG ở 1 chỗ thay vì rải rác từng call.
    if (error.response) {
      // Server có trả về (status 4xx/5xx)
      const status = error.response.status
      if (status === 401) {
        // QLVB: redirect về /login, clear token. Ở đây chỉ log.
        console.warn('[http] 401 Unauthorized')
      }
      if (status >= 500) {
        console.error('[http] Server error', status)
      }
    } else if (error.request) {
      // Request bay đi nhưng KHÔNG có response (BE tắt, CORS chặn, timeout)
      console.error('[http] Không kết nối được server', error.message)
    }
    return Promise.reject(error) // ném tiếp để store .catch() bắt được
  },
)
```

### Giải thích từng điểm

| Thành phần | Vai trò |
|---|---|
| `axios.create({...})` | Tạo instance riêng, có `baseURL` + config mặc định. Mọi call qua `http` đều thừa hưởng. |
| `baseURL` | Lấy từ `import.meta.env.VITE_API_BASE_URL`. Sau này gọi `http.get('/tasks')` → request đi tới `http://localhost:8080/api/v1/tasks`. |
| `timeout: 10_000` | Quá 10s không có phản hồi → axios reject với lỗi timeout (mock không bao giờ có chuyện này). |
| **request interceptor** | Chạy trước mỗi request — chỗ lý tưởng để gắn `Authorization` header. QLVB lấy token từ `authStore`. |
| **response interceptor** | Chạy sau mỗi response. Nhánh thành công trả về nguyên; nhánh lỗi xử lý **tập trung** (401 → logout, 5xx → log/toast) rồi `reject` tiếp để chỗ gọi vẫn `catch` được. |
| `error.response` vs `error.request` | `error.response` = server CÓ trả (có status code). `error.request` = gửi đi nhưng KHÔNG nhận lại gì (BE tắt, CORS chặn, timeout). Phân biệt 2 cái này để báo lỗi đúng. |

> **Vì sao interceptor quan trọng?** Không có nó, mỗi chỗ gọi API phải tự gắn token và tự check 401 → lặp code, dễ sót. Interceptor gom logic chung về 1 chỗ.

---

## 4. Viết `services/api/taskApiHttp.ts` — cùng interface, gọi BE thật

Đây là trái tim của bài. File này phải có **đúng các method với đúng signature** như `taskApi` mock ở bài 4:

`list / getById / create / update / markDone / remove` — trả `ApiResponse<...>` / `Paginated<...>`.

Khác biệt duy nhất: bên trong gọi `http` (axios) thay vì đọc `localStorage`, và phải **map response BE → shape chuẩn của FE**.

Tạo `src/services/api/taskApiHttp.ts`:

```ts
import type { Task } from '@/types/entities/task'
import type { ApiResponse, Paginated } from '@/types/api/common'
import type { ListTaskParams, CreateTaskPayload, UpdateTaskPayload } from '@/types/api/task'
import { DEFAULT_PAGE_SIZE } from '@/constants/task'
import { http } from './http'

// ---- Mapping layer ----
// Shape BE trả về CÓ THỂ khác FE. Ta gom việc "dịch" về 1 chỗ.
// Giả định task-svc Go trả mỗi task đúng field như entity Task.
// Nếu BE đặt tên khác (vd: snake/camel lệch), sửa DUY NHẤT ở đây.
function mapTask(raw: any): Task {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    description: raw.description ?? '',
    status: raw.status,
    due_date: raw.due_date ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

function ok<T>(data: T, message = 'OK'): ApiResponse<T> {
  return { success: true, message, data }
}

export const taskApiHttp = {
  async list(params: ListTaskParams = {}): Promise<ApiResponse<Paginated<Task>>> {
    const { search = '', status = 'all', page = 1, page_size = DEFAULT_PAGE_SIZE } = params
    const res = await http.get('/tasks', {
      params: {
        search: search || undefined,            // bỏ field rỗng khỏi query string
        status: status === 'all' ? undefined : status,
        page,
        page_size,
      },
    })
    // Giả định BE trả: { items: [...], total, page, page_size }
    // Nếu BE bọc trong { data: {...} } thì đọc res.data.data thay vì res.data.
    const body = res.data
    const paginated: Paginated<Task> = {
      items: (body.items ?? []).map(mapTask),
      total: body.total ?? 0,
      page: body.page ?? page,
      page_size: body.page_size ?? page_size,
    }
    return ok(paginated)
  },

  async getById(id: string): Promise<ApiResponse<Task>> {
    const res = await http.get(`/tasks/${id}`)
    return ok(mapTask(res.data))
  },

  async create(payload: CreateTaskPayload): Promise<ApiResponse<Task>> {
    const res = await http.post('/tasks', {
      title: payload.title,
      description: payload.description ?? '',
      due_date: payload.due_date ?? null,
    })
    return ok(mapTask(res.data), 'Tạo task thành công')
  },

  async update(id: string, payload: UpdateTaskPayload): Promise<ApiResponse<Task>> {
    const res = await http.put(`/tasks/${id}`, payload)
    return ok(mapTask(res.data), 'Cập nhật thành công')
  },

  async markDone(id: string): Promise<ApiResponse<Task>> {
    // Tuỳ BE: có thể là PATCH /tasks/:id/done, hoặc PUT status='done'.
    const res = await http.patch(`/tasks/${id}/done`)
    return ok(mapTask(res.data), 'Đã đánh dấu hoàn thành')
  },

  async remove(id: string): Promise<ApiResponse<null>> {
    await http.delete(`/tasks/${id}`)
    return ok(null, 'Đã xóa task')
  },
}
```

### Giải thích các điểm mấu chốt

- **Cùng interface**: so sánh từng method với `taskApi` mock — tên, tham số, kiểu trả về **giống hệt**. Đó là điều kiện để swap không-sửa-store.
- **`mapTask` — mapping layer**: BE Go có thể đặt tên field khác, kiểu khác (vd `id` là số). Ta gom việc "dịch" về duy nhất hàm này. Sau này BE đổi shape → sửa 1 chỗ, không lan ra store/page.
- **`String(raw.id)`**: entity `Task.id` là `string`. Nếu BE trả `id` kiểu số (Go `uint`), ta ép về string cho khớp type FE → giữ types entities **ổn định**.
- **`params` của axios**: truyền object, axios tự build query string `?search=...&page=1`. Field `undefined` bị bỏ qua → query sạch.
- **`ok(...)`**: BE thật có thể KHÔNG trả đúng bao bì `{ success, message, data }`. Ta tự gói lại để store nhận đúng `ApiResponse<T>` như khi dùng mock.

### Ví dụ: khi field BE khác tên

Giả sử BE Go trả `deadline` thay vì `due_date`, và `createdAt` (camelCase) thay vì `created_at`. Chỉ sửa `mapTask`:

```ts
function mapTask(raw: any): Task {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    description: raw.description ?? '',
    status: raw.status,
    due_date: raw.deadline ?? null,       // ← BE: deadline → FE: due_date
    created_at: raw.createdAt,            // ← BE: camelCase → FE: snake_case
    updated_at: raw.updatedAt,
  }
}
```

→ Toàn bộ phần còn lại của app (page, table, store) **không hề biết** BE đổi tên field. Đó là tác dụng của mapping layer.

---

## 5. Swap import trong store — đổi đúng 1 dòng

Mở `src/store/taskStore.ts`. Hiện tại (bài 5):

```ts
import { taskApi } from '@/services/api/taskApi'
```

Đổi thành:

```ts
import { taskApiHttp as taskApi } from '@/services/api/taskApiHttp'
```

Mẹo: dùng `as taskApi` (alias) để **phần thân store giữ nguyên** — vẫn gọi `taskApi.list()`, `taskApi.create()`, ... Không phải sửa chỗ nào khác.

> Nếu `TaskDetailPage.tsx` (bài 9) import `taskApi` mock trực tiếp để gọi `getById`, đổi y hệt 1 dòng đó nữa. Cả app chỉ có 1-2 dòng import cần đổi.

### Đây chính là phần thưởng của abstraction

Dừng lại 30 giây để thấm: cả một app — list, search, filter, pagination, form, detail, mark done, delete — chuyển từ "chạy bằng localStorage" sang "gọi BE Go HTTP thật" chỉ bằng **1 dòng import**. Vì:

- Page/component chỉ biết **store**, không biết service.
- Store chỉ biết **interface `taskApi`**, không biết bên trong là mock hay HTTP.
- `taskApiHttp` cùng interface → cắm vào là chạy.

Quay về mock cũng chỉ là đổi lại 1 dòng. Đó là lý do ta tách service layer ngay từ bài 4.

---

## 6. CORS — nó là gì và vì sao bạn sẽ gặp

Khi swap xong, mở app, mở Console — rất có thể thấy lỗi đỏ kiểu:

```
Access to XMLHttpRequest at 'http://localhost:8080/api/v1/tasks'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

### CORS là gì?

- FE chạy ở **origin** `http://localhost:5173` (Vite dev). BE chạy ở `http://localhost:8080`. Khác **port** = khác origin.
- Trình duyệt có chính sách bảo mật **Same-Origin Policy**: mặc định chặn request từ origin này sang origin khác.
- **CORS** (Cross-Origin Resource Sharing) là cách BE "cho phép" origin khác gọi vào, bằng cách trả các header `Access-Control-Allow-Origin: ...`.
- Nếu BE Go **không** set các header này → trình duyệt chặn → bạn thấy lỗi CORS (dù BE thực ra đã xử lý request).

### 2 cách xử lý

1. **BE bật CORS** (cách đúng cho production): trong `task-svc` Go, thêm middleware CORS cho phép origin `http://localhost:5173`. Đây là cách QLVB làm.
2. **Dùng proxy dev của Vite** (cách nhanh khi học, mục 7): FE gọi cùng origin `localhost:5173`, Vite chuyển tiếp sang `8080` → trình duyệt không thấy "cross-origin" nên không chặn.

> CORS là cơ chế của **trình duyệt**, không phải của server. Gọi BE bằng Postman/curl không bao giờ dính CORS — chỉ trình duyệt mới enforce.

---

## 7. Proxy dev của Vite — `server.proxy`

Cách gọn nhất để né CORS khi học: cho Vite làm trung gian.

### 7.1. Sửa `vite.config.ts`

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
  server: {
    proxy: {
      // Mọi request bắt đầu bằng /api → chuyển tiếp sang BE Go
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

### 7.2. Đổi `.env` cho khớp proxy

Khi dùng proxy, base URL của FE trỏ về **chính nó** (đường dẫn tương đối), Vite lo phần chuyển tiếp:

```bash
VITE_API_BASE_URL=/api/v1
```

→ FE gọi `http://localhost:5173/api/v1/tasks` (cùng origin, không CORS) → Vite thấy prefix `/api` → forward sang `http://localhost:8080/api/v1/tasks`.

| Option | Ý nghĩa |
|---|---|
| `'/api'` | match mọi request có path bắt đầu bằng `/api`. |
| `target` | địa chỉ BE thật để chuyển tiếp. |
| `changeOrigin: true` | đổi header `Host` của request thành target — nhiều BE cần để nhận đúng. |

> **Nhớ restart `npm run dev`** sau khi sửa cả `vite.config.ts` lẫn `.env`. Proxy chỉ hoạt động ở **dev**; production phải bật CORS thật ở BE hoặc đặt FE + BE sau cùng reverse proxy (nginx).

---

## 8. Khác biệt mock vs real — cái mà bài 4-10 giấu bạn

Mock "hiền" hơn BE thật rất nhiều. Khi nối thật, chuẩn bị tinh thần cho:

| Khía cạnh | Mock (bài 4) | BE thật (bài 11) |
|---|---|---|
| Độ trễ | cố định ~300ms | thay đổi, có thể chậm, có thể **timeout** |
| Lỗi mạng | không bao giờ | BE tắt, mất mạng → `error.request`, không có response |
| HTTP status | luôn "thành công" | 400 (validate), 401 (chưa login), 404, 409, 500... |
| Async | giả lập `setTimeout` | network thật, không đoán trước |
| Shape data | đúng `ApiResponse<T>` luôn | có thể khác (camelCase, bọc thêm tầng, field thiếu) → cần **mapping layer** |
| Thứ tự/đồng thời | tuần tự | race condition khi nhiều request song song |

→ Vì vậy:

- `try/catch` trong store (viết từ bài 5) giờ **thực sự** bắt được lỗi mạng/HTTP, không chỉ là trang trí.
- `loading` state quan trọng hơn — request thật có thể lâu.
- Mapping layer (`mapTask`) là **bắt buộc**, không phải tùy chọn — vì BE thật hiếm khi trả đúng y shape FE muốn.
- Types **entities** (`Task`) giữ **ổn định**: dù BE đổi tên field, ta chỉ sửa mapping, không sửa entity → page/store không lung lay.

---

## 9. Test khi BE chạy

Giả sử đã chạy `task-svc` Go ở `:8080`:

1. `npm run dev` (đã sửa `.env` + `vite.config.ts`, đã swap import).
2. Mở app, vào danh sách task → mở tab **Network** trong DevTools.
3. Thấy request `GET /api/v1/tasks?page=1&page_size=5` với status `200` → dữ liệu từ BE Go hiển thị trong table.
4. Tạo task mới → thấy `POST /api/v1/tasks` `201`/`200`, task xuất hiện.
5. Mark done / Delete → thấy `PATCH` / `DELETE` tương ứng.

Nếu BE **chưa** chạy:

- Sẽ thấy lỗi `error.request` (không kết nối được). App không crash (store `catch` được, set `error`).
- Đổi lại `import { taskApi } from '@/services/api/taskApi'` để về mock — học tiếp bình thường.

---

## Sai lầm thường gặp

### 1. Quên prefix `VITE_`

```bash
API_BASE_URL=http://localhost:8080/api/v1   # ❌ Vite KHÔNG expose → undefined ở browser
VITE_API_BASE_URL=http://localhost:8080/api/v1   # ✅
```

Triệu chứng: `import.meta.env.VITE_API_BASE_URL` ra `undefined`, axios gọi vào path tương đối sai → 404 hoặc gọi nhầm origin. Sửa tên + **restart dev**.

### 2. Sửa `.env` mà không restart `npm run dev`

`.env` chỉ đọc lúc dev start. Sửa xong vẫn thấy giá trị cũ → tưởng code sai. Luôn restart sau khi đụng `.env` hoặc `vite.config.ts`.

### 3. Gặp CORS, đổ lỗi cho code FE

Lỗi CORS không phải bug JS của bạn — là **trình duyệt chặn** vì BE chưa cho phép origin. Hoặc bật proxy Vite (mục 7), hoặc bật CORS ở BE Go. Đừng cố "fix" bằng cách sửa axios — không có header nào ở FE gỡ được CORS.

### 4. `baseURL` sai (thừa/thiếu `/`)

```ts
baseURL: 'http://localhost:8080/api/v1/'  // và gọi http.get('/tasks')
// → http://localhost:8080/api/v1//tasks  (double slash) hoặc nuốt path
```

Quy ước an toàn: `baseURL` **không** có dấu `/` cuối, path **có** dấu `/` đầu (`http.get('/tasks')`). Kiểm tra tab Network xem URL cuối có đúng không.

### 5. Không map shape BE → đọc `undefined`

Dùng thẳng `res.data.items` khi BE bọc trong `res.data.data.items`, hoặc field tên `deadline` mà đọc `due_date` → ra `undefined`, table trống dù request 200. Luôn `console.log(res.data)` lần đầu, rồi viết `mapTask` cho khớp.

---

## Checkpoint Bài 11

- [ ] `npm install axios` chạy không lỗi, `package.json` có `axios`
- [ ] Có file `.env` ở gốc `task-app/` với `VITE_API_BASE_URL=...` (prefix `VITE_`)
- [ ] (Tùy chọn) `vite-env.d.ts` khai type cho `import.meta.env`
- [ ] `services/api/http.ts`: `axios.create` lấy `baseURL` từ `import.meta.env`, có request + response interceptor
- [ ] `services/api/taskApiHttp.ts`: đủ 6 method `list/getById/create/update/markDone/remove`, **cùng signature** với `taskApi` mock
- [ ] `taskApiHttp` có hàm `mapTask` (mapping layer), trả về `ApiResponse<T>` / `Paginated<T>`
- [ ] Swap import trong `taskStore.ts` (và `TaskDetailPage` nếu cần) sang `taskApiHttp` — **không sửa thân store/page**
- [ ] Hiểu được khi nào dùng `server.proxy` của Vite vs khi nào cần BE bật CORS
- [ ] Nếu có BE `:8080`: tab Network thấy request thật (200) và app hoạt động; nếu không: đổi lại import về mock, app vẫn chạy

---

## Câu hỏi tự kiểm tra

1. Vì sao biến môi trường phải có prefix `VITE_` mới dùng được ở browser? Đọc bằng `import.meta.env` hay `process.env`?
2. `axios.create()` cho ta cái gì so với gọi `axios.get()` trực tiếp khắp nơi?
3. Request interceptor và response interceptor mỗi cái dùng để làm gì? Cho 1 ví dụ mỗi loại.
4. CORS là cơ chế của trình duyệt hay của server? Vì sao gọi BE bằng Postman không bao giờ dính CORS?
5. `server.proxy` của Vite né CORS bằng cách nào? Nó hoạt động ở môi trường nào?
6. Nhờ đâu mà đổi từ mock sang BE thật chỉ cần sửa 1 dòng import? Mapping layer (`mapTask`) giải quyết vấn đề gì?

**Đáp án:**

1. Vite chỉ expose biến có prefix `VITE_` ra client để tránh leak secret server ra bundle. Biến không prefix sẽ `undefined` ở browser. Đọc bằng `import.meta.env.VITE_...` (Vite/ESM), **không** dùng `process.env` (đó là Node, không tồn tại ở browser).

2. `axios.create()` tạo instance cấu hình sẵn `baseURL`, `timeout`, header mặc định và **interceptor**. Nhờ đó mọi call dùng chung config + logic xử lý lỗi/token tập trung, không lặp code. Gọi `axios.get()` trực tiếp thì mỗi chỗ phải tự nối base URL, tự gắn token, tự check lỗi.

3. **Request interceptor** chạy trước khi request bay đi — ví dụ gắn `Authorization: Bearer <token>`. **Response interceptor** chạy sau khi nhận response/lỗi — ví dụ gặp 401 thì logout/redirect về login, gặp 5xx thì log/toast, rồi `reject` tiếp để chỗ gọi vẫn `catch` được.

4. CORS là cơ chế của **trình duyệt** (Same-Origin Policy), được enforce phía client. Postman/curl không phải trình duyệt nên không áp dụng chính sách này → request đi thẳng tới server, không bao giờ thấy lỗi CORS.

5. Proxy làm FE gọi vào **cùng origin** với dev server (vd `localhost:5173/api/...`), nên trình duyệt không coi là cross-origin → không chặn. Vite nhận request prefix `/api` rồi forward sang `target` (`localhost:8080`). Nó chỉ chạy ở **dev** (`npm run dev`); production phải bật CORS thật ở BE hoặc dùng reverse proxy.

6. Nhờ **service abstraction**: page chỉ biết store, store chỉ biết interface `taskApi`, không biết bên trong là mock hay HTTP. `taskApiHttp` cùng interface nên cắm vào là chạy. **Mapping layer** (`mapTask`) gom việc "dịch" shape BE → shape FE về 1 chỗ, giữ types entities ổn định: BE đổi tên/kiểu field chỉ cần sửa `mapTask`, không lan ra store/page.

---

## So sánh với QLVB thật

Mở `frontend/src/services/api/base.ts` và `frontend/.env` của QLVB:

| Khía cạnh | QLVB | Bài 11 |
|---|---|---|
| axios instance | có, `baseURL` từ `import.meta.env.VITE_API_URL` | có, cùng pattern |
| Request interceptor | gắn token từ `authStore`, refresh token khi cần | gắn token placeholder (chưa có auth) |
| Response interceptor | 401 → gọi refresh token / logout, 403 → báo quyền, toast lỗi tập trung | log 401/5xx, reject tiếp |
| Mapping layer | có, mỗi domain 1 file `*Api.ts` map response BE | 1 hàm `mapTask` |
| Bọc `ApiResponse` | BE QLVB trả sẵn `{ success, message, data }` chuẩn | tự gói lại bằng `ok()` |
| Env | `.env`, `.env.staging`, `.env.production` | 1 file `.env` |
| Proxy | thường BE bật CORS, FE deploy sau nginx | proxy Vite cho dev |

→ Bài này là **subset** lớp HTTP của QLVB: đủ để hiểu axios instance + interceptor + mapping + CORS/proxy, chưa có refresh token và multi-env. Khi đọc `base.ts` QLVB bạn sẽ nhận ra cùng bộ khung, chỉ nhiều logic auth hơn.

---

## Kết thúc khóa học

Bạn đã đi hết 11 bài: từ Vite trống → một SPA React 19 đầy đủ pattern QLVB (types phân tầng → service layer → Zustand store → UI wrapper → list/form/detail page → router → nối BE Go thật). Chúc mừng!

### Self-evaluation — bạn đã thật sự sẵn sàng chưa?

Tự chấm 3 mục sau (như README mục "Khi xong cả 11 bài"):

1. **Đọc-hiểu QLVB**: Mở `frontend/src/pages/documents/incoming/IncomingDocumentListPage.tsx` (1500+ dòng). Bạn đọc-hiểu **70%+** không? Nhận ra được table + tabs + search debounce + filter + pagination + store — đúng những thứ đã code ở bài 7?
2. **Tự sửa bug nhỏ**: Tìm một `TODO`/`FIXME` trong QLVB → tự sửa, không cần hỏi.
3. **Tự thêm tính năng**: Trong mini-app này, tự thêm **filter theo `due_date`** (vd lọc khoảng ngày) — từ thêm field vào `ListTaskParams`, sửa service (mock và/hoặc HTTP), tới thêm input ở `TaskListPage`. Làm được mà không cần guide?

Đạt **3/3** → bạn đã sẵn sàng nhận task QLVB FE thật.

### Bước tiếp theo

- Clone/checkout repo QLVB `frontend/`, chạy local, nối với BE.
- Nhận một task nhỏ thật (sửa UI, thêm field, fix bug) — áp dụng đúng pattern đã học.
- Khi bí: paste error + 5-10 dòng code (đừng paste cả file) → hỏi.
- Đối chiếu liên tục: mỗi lần đụng phần lạ trong QLVB, soi lại bài demo tương ứng để thấy "cùng khung, nhiều chi tiết hơn".

Khóa học demo dừng ở đây. Phần còn lại là **làm thật** — đó mới là chỗ kỹ năng định hình. Chúc bạn làm tốt!

---

**Bài 11 — phiên bản 2026-06-08.**
