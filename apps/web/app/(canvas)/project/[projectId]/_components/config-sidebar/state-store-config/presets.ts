import { GlobalStoreField, GlobalStoreAction } from "@workspace/canvas/types";

export interface StorePreset {
  name: string;
  description: string;
  storage: "memory" | "localStorage" | "sessionStorage";
  fields: Array<Omit<GlobalStoreField, "id">>;
  actions: Array<
    Omit<GlobalStoreAction, "id"> & {
      targetFieldName?: string;
    }
  >;
}

export const STORE_PRESETS: StorePreset[] = [
  {
    name: "Cart",
    description: "E-commerce shopping cart with items, quantity, and price calculation",
    storage: "localStorage",
    fields: [
      { name: "items", type: "array", defaultValue: [] },
      { name: "total", type: "number", defaultValue: 0 },
      { name: "itemCount", type: "number", defaultValue: 0 },
      { name: "discountCode", type: "string", defaultValue: "" },
    ],
    actions: [
      {
        name: "addItem",
        actionType: "custom",
        targetFieldName: "items",
        parameters: [
          { id: "p1", name: "item", type: "object", required: true },
          { id: "p2", name: "quantity", type: "number", required: false },
        ],
        code: `// Add item and auto-recalculate total\nconst items = get().items || [];\nconst qty = payload?.quantity || 1;\nconst existing = items.find((i) => i.id === payload?.item?.id);\nlet nextItems;\nif (existing) {\n  nextItems = items.map((i) => i.id === payload?.item?.id ? { ...i, qty: (i.qty || 1) + qty } : i);\n} else {\n  nextItems = [...items, { ...payload?.item, qty }];\n}\nconst newTotal = nextItems.reduce((sum, i) => sum + (Number(i.price) || 0) * (i.qty || 1), 0);\nset({ items: nextItems, total: newTotal, itemCount: nextItems.length });`,
      },
      { name: "setTotal", actionType: "set", targetFieldName: "total" },
      { name: "resetCart", actionType: "reset", targetFieldName: "items" },
    ],
  },
  {
    name: "UserSession",
    description: "User authentication session and preferences",
    storage: "memory",
    fields: [
      { name: "userId", type: "string", defaultValue: "" },
      { name: "isAuthenticated", type: "boolean", defaultValue: false },
      { name: "user", type: "object", defaultValue: null },
      { name: "theme", type: "string", defaultValue: "system" },
    ],
    actions: [
      {
        name: "loginSuccess",
        actionType: "custom",
        targetFieldName: "user",
        parameters: [
          { id: "p1", name: "userData", type: "object", required: true },
        ],
        code: `// Set user and mark authenticated\nconst data = payload?.userData || payload;\nset({\n  user: data,\n  userId: data?.id || data?.userId || "usr_123",\n  isAuthenticated: true,\n});`,
      },
      { name: "logout", actionType: "reset", targetFieldName: "isAuthenticated" },
      { name: "setTheme", actionType: "set", targetFieldName: "theme" },
    ],
  },
  {
    name: "UIState",
    description: "Global modal, sidebar, notifications, and navigation state",
    storage: "memory",
    fields: [
      { name: "isSidebarOpen", type: "boolean", defaultValue: true },
      { name: "activeModal", type: "string", defaultValue: "" },
      { name: "notificationsCount", type: "number", defaultValue: 0 },
      { name: "searchQuery", type: "string", defaultValue: "" },
    ],
    actions: [
      { name: "toggleSidebar", actionType: "toggle", targetFieldName: "isSidebarOpen" },
      { name: "setActiveModal", actionType: "set", targetFieldName: "activeModal" },
      { name: "incrementNotifications", actionType: "increment", targetFieldName: "notificationsCount" },
      { name: "resetUI", actionType: "reset", targetFieldName: "isSidebarOpen" },
    ],
  },
];
