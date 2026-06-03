# `task-app` — Mini FE app học pattern QLVB

> **Audience**: Dev quen Node/TS, lần đầu làm React + MUI + Zustand thật, hoặc đã quen React cơ bản nhưng chưa quen kiến trúc QLVB.
> **Mục tiêu**: Tự code 1 SPA React 19 đầy đủ pattern QLVB (types phân tầng → service layer → store → ui wrappers → page → form RHF+Zod → router), nghiệp vụ đơn giản (Task management).
> **Thời gian**: ~2 buổi (8-12 giờ) cho Bài 1-9. Bài 10-11 optional.
> **Cách dùng**: Đọc từng file `bai-hoc/bai-XX-*.md` tuần tự. Học đến đâu, viết bài đến đấy — xong bài này báo tôi viết bài tiếp.

---

## Tổng quan: app sẽ build

### Nghiệp vụ — Task Management

Cùng nghiệp vụ với `y-golang-demo/` BE để cuối cùng có thể nối FE ↔ BE Go thật:

- **List task** có search + filter (status) + pagination
- **Create task** (title bắt buộc, description optional, due_date optional)
- **Detail task** — xem chi tiết
- **Mark done** — đánh dấu hoàn thành (chỉ đổi `status`, không cho update lại)
- **Delete task** — xóa kèm `ConfirmDialog`

### Data source

- **Bài 1-9**: lưu trong `localStorage` (mock), không cần BE
- **Bài 11 (optional)**: swap sang fetch BE `task-svc` Go đã build ở `y-golang-demo/`

### Stack

Mirror QLVB thật:

| Concern | Library | QLVB tương đương |
|---|---|---|
| Build tool | Vite 5 | Vite (giống QLVB) |
| Framework | React 19 + TypeScript | React 19 + TS |
| UI components | MUI 7 (`@mui/material`) | MUI 7 |
| Icons | MUI Icons (`@mui/icons-material`) | MUI Icons |
| State | Zustand + persist middleware | Zustand |
| Form | React Hook Form + Zod | RHF + Zod |
| Routing | React Router v6 | React Router v6 |
| HTTP (bài 11) | axios | axios |
| Date | `date-fns` (đơn giản hơn `dateUtils.ts` của QLVB) | dateUtils custom |

### Cấu trúc folder (mirror QLVB)

```
y-frontend-demo/
├── README.md                        ← file này
├── bai-hoc/
│   ├── bai-01-setup-vite-react-ts.md
│   ├── bai-02-mui-theme-va-layout.md
│   ├── bai-03-types-phan-tang.md
│   ├── bai-04-service-layer-mock.md
│   ├── bai-05-zustand-store.md
│   ├── bai-06-ui-wrappers-custom.md
│   ├── bai-07-list-page-search-filter.md
│   ├── bai-08-form-rhf-zod.md
│   ├── bai-09-detail-edit-delete.md
│   ├── bai-10-router-layout.md
│   └── bai-11-noi-task-svc-go.md (optional)
└── task-app/                        ← project Vite (bạn tạo ở bài 1)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── themes/
        ├── types/
        │   ├── entities/             # Task domain model
        │   ├── api/                  # ApiResponse, request/response shapes
        │   ├── pages/                # Form data types
        │   ├── features/             # Filter state types
        │   └── store/                # Zustand store types
        ├── constants/
        ├── services/
        │   └── api/
        │       ├── base.ts           # Mock apiService
        │       └── taskApi.ts
        ├── store/
        │   └── taskStore.ts
        ├── components/
        │   ├── ui/                   # CustomTextField, Table, ConfirmDialog
        │   └── layout/
        ├── hooks/
        ├── pages/
        │   └── tasks/
        │       ├── TaskListPage.tsx
        │       ├── TaskCreatePage.tsx
        │       └── TaskDetailPage.tsx
        ├── router/
        └── utils/
```

---

## Roadmap — 11 bài học

Mỗi bài 30-90 phút, đọc trong `bai-hoc/`. Học đến đâu, tôi viết bài đến đấy.

| Bài | Mục tiêu | QLVB pattern map |
|---|---|---|
| **1** | Setup Vite + React 19 + TS, chạy được "Hello task-app" | Project bootstrap |
| **2** | MUI 7 + ThemeProvider + 1 page layout với `sx` token | `themes/`, MUI Grid `size` |
| **3** | Types phân 5 tầng cho Task — `entities/`, `api/`, `pages/`, `features/`, `store/` | `types/` 6 folders |
| **4** | Service layer mock localStorage với abstraction `ApiResponse<T>` | `services/api/base.ts` |
| **5** | Zustand store quản lý danh sách task, persist localStorage | `store/authStore.ts` |
| **6** | Tự build wrapper: `CustomTextField`, `ConfirmDialog`, mini `Table` | `components/ui/` |
| **7** | Trang `TaskListPage`: table + tabs + search + filter + pagination | `IncomingDocumentListPage.tsx` |
| **8** | Trang `TaskCreatePage`: React Hook Form + Zod schema | `IncomingDocumentCreatePage.tsx` |
| **9** | Trang `TaskDetailPage`: xem chi tiết + mark done + delete (ConfirmDialog) | `IncomingDocumentDetailPage.tsx` |
| **10** | React Router setup + layout wrapper + 404 page | `router/`, `layouts/` |
| **11** (optional) | Swap service mock → axios gọi `task-svc` Go thật ở `y-golang-demo/` | Real BE integration |

---

## Mapping bài học → file QLVB tham chiếu

Sau khi xong từng bài, mở file QLVB tương đương để **đối chiếu pattern production-grade**:

| Bài demo | File QLVB tham chiếu |
|---|---|
| Bài 1 | `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx` |
| Bài 2 | `frontend/src/themes/` |
| Bài 3 | `frontend/src/types/entities/documents/incoming.ts`, `frontend/src/types/api/documents/incoming.ts` |
| Bài 4 | `frontend/src/services/api/base.ts`, `frontend/src/services/api/incomingDocumentApi.ts` |
| Bài 5 | `frontend/src/store/authStore.ts` |
| Bài 6 | `frontend/src/components/ui/CustomTextField.tsx`, `frontend/src/components/ui/Table.tsx`, `frontend/src/components/ui/ConfirmDialog.tsx` |
| Bài 7 | `frontend/src/pages/documents/incoming/IncomingDocumentListPage.tsx` |
| Bài 8 | `frontend/src/pages/documents/incoming/IncomingDocumentCreatePage.tsx` |
| Bài 9 | `frontend/src/pages/documents/incoming/IncomingDocumentDetailPage.tsx` |
| Bài 10 | `frontend/src/router/AuthRouter.tsx`, `frontend/src/layouts/` |

---

## Quy tắc khi học

1. **TỰ GÕ CODE** — đừng copy-paste cả block. Gõ tay giúp nhớ syntax và quen IDE autocomplete.
2. **Đọc giải thích từng dòng trong bài** — không bỏ qua. Pattern QLVB có nhiều cái không-hiển-nhiên (vd tại sao `register` cho text input nhưng `control` cho select).
3. **Checkpoint cuối bài phải tick đủ** — nếu thiếu 1 mục, dừng lại fix, đừng sang bài tiếp.
4. **Câu hỏi tự kiểm tra cuối bài** — trả lời không Google. Sai đáp án = chưa nắm chắc, đọc lại phần liên quan.
5. **Đối chiếu file QLVB** — sau bài 7, 8, 9 mở file `IncomingDocument*Page.tsx` đọc kèm xem QLVB làm gì khác/phức tạp hơn.
6. **Khi bí**: paste error message + 5-10 dòng code → hỏi tôi. Tránh paste cả file 500 dòng.

---

## Khi xong cả 11 bài

Self-evaluation:

1. **Đọc QLVB**: Mở `frontend/src/pages/documents/incoming/IncomingDocumentListPage.tsx` (1500+ dòng) — bạn đọc-hiểu 70%+ không?
2. **Sửa bug nhỏ**: Tìm TODO/FIXME trong QLVB → tự sửa không cần hỏi
3. **Thêm tính năng nhỏ**: Cho mini-app, thêm filter theo `due_date` (range) — bạn tự code được không cần guide?

Đạt 3/3 → bạn đã sẵn sàng làm task QLVB FE thật.

---

## Bắt đầu

Đọc **`bai-hoc/bai-01-setup-vite-react-ts.md`** rồi báo tôi xong từng bài để tôi viết bài tiếp.

---

**README phiên bản 2026-05-19.**
