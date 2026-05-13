import { contextBridge, ipcRenderer } from 'electron'

const api = {
  ping: () => ipcRenderer.invoke('pos:ping'),
  auth: {
    login: (username: string, pin: string) => ipcRenderer.invoke('auth:login', { username, pin }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    me: () => ipcRenderer.invoke('auth:me'),
    verifyPin: (pin: string) => ipcRenderer.invoke('auth:verifyPin', pin),
    usernames: () => ipcRenderer.invoke('auth:usernames')
  },
  session: {
    open: (openingCash: number, deviceId: string) =>
      ipcRenderer.invoke('session:open', { openingCash, deviceId }),
    current: () => ipcRenderer.invoke('session:current'),
    salesStats: () => ipcRenderer.invoke('session:salesStats'),
    close: (payload: { actualCash: number; notes?: string; managerPin?: string }) =>
      ipcRenderer.invoke('session:close', payload)
  },
  barcode: {
    lookup: (code: string) => ipcRenderer.invoke('barcode:lookup', code),
    parseWeight: (code: string) => ipcRenderer.invoke('barcode:parseWeight', code)
  },
  products: {
    list: (q: { search?: string; categoryId?: string }) => ipcRenderer.invoke('products:list', q),
    get: (id: string) => ipcRenderer.invoke('products:get', id),
    searchAdvanced: (q: { query: string; limit?: number; recentProductIds?: string[] }) =>
      ipcRenderer.invoke('products:searchAdvanced', q),
    posGrid: () => ipcRenderer.invoke('products:posGrid'),
    categories: () => ipcRenderer.invoke('products:categories'),
    createCategory: (payload: { name: string }) => ipcRenderer.invoke('products:createCategory', payload),
    generateBarcode: () => ipcRenderer.invoke('products:generateBarcode'),
    save: (payload: unknown) => ipcRenderer.invoke('products:save', payload),
    exportStockTsv: () => ipcRenderer.invoke('products:exportStockTsv'),
    importStockTsv: () => ipcRenderer.invoke('products:importStockTsv')
  },
  paymentMethods: {
    list: () => ipcRenderer.invoke('paymentMethods:list')
  },
  sales: {
    create: (payload: unknown) => ipcRenderer.invoke('sales:create', payload),
    getDetail: (saleId: string) => ipcRenderer.invoke('sales:getDetail', saleId),
    hold: (payload: unknown) => ipcRenderer.invoke('sales:hold', payload),
    heldList: () => ipcRenderer.invoke('sales:heldList'),
    heldGet: (id: string) => ipcRenderer.invoke('sales:heldGet', id),
    /** استرجاع مع إزالة المعلقة من القائمة (استخدمه بدل heldGet عند الاسترجاع للسلة) */
    heldConsume: (id: string) => ipcRenderer.invoke('sales:heldConsume', id),
    heldDelete: (id: string) => ipcRenderer.invoke('sales:heldDelete', id)
  },
  inventory: {
    lowStock: () => ipcRenderer.invoke('inventory:lowStock'),
    movements: (q: { productId?: string; take?: number }) => ipcRenderer.invoke('inventory:movements', q),
    applyMove: (payload: {
      type: string
      productId: string
      quantity: number
      note?: string
      unitCost?: number
    }) => ipcRenderer.invoke('inventory:applyMove', payload),
    countCreate: (note?: string) => ipcRenderer.invoke('inventory:count:create', note),
    countSetLine: (payload: { sessionId: string; productId: string; countedQty: number }) =>
      ipcRenderer.invoke('inventory:count:setLine', payload),
    countPost: (sessionId: string) => ipcRenderer.invoke('inventory:count:post', sessionId),
    countList: () => ipcRenderer.invoke('inventory:count:list'),
    countDetails: (sessionId: string) => ipcRenderer.invoke('inventory:count:details', sessionId)
  },
  supplier: {
    list: () => ipcRenderer.invoke('supplier:list'),
    save: (row: unknown) => ipcRenderer.invoke('supplier:save', row),
    delete: (id: string) => ipcRenderer.invoke('supplier:delete', id),
    payment: (payload: { supplierId: string; amount: number; method: string; note?: string }) =>
      ipcRenderer.invoke('supplier:payment', payload),
    balance: (supplierId: string) => ipcRenderer.invoke('supplier:balance', supplierId)
  },
  purchase: {
    list: (q: { supplierId?: string; status?: string }) => ipcRenderer.invoke('purchase:list', q),
    get: (id: string) => ipcRenderer.invoke('purchase:get', id),
    saveDraft: (payload: unknown) => ipcRenderer.invoke('purchase:saveDraft', payload),
    complete: (id: string) => ipcRenderer.invoke('purchase:complete', id)
  },
  returns: {
    sale: (payload: unknown) => ipcRenderer.invoke('returns:sale', payload),
    purchase: (payload: unknown) => ipcRenderer.invoke('returns:purchase', payload)
  },
  expense: {
    categories: () => ipcRenderer.invoke('expense:categories'),
    categorySave: (row: { id?: string; name: string }) => ipcRenderer.invoke('expense:categorySave', row),
    listRegistrars: () => ipcRenderer.invoke('expense:listRegistrars'),
    list: (q: { from?: string; to?: string; createdById?: string | null }) => ipcRenderer.invoke('expense:list', q),
    create: (payload: unknown) => ipcRenderer.invoke('expense:create', payload),
    setReceipt: (payload: { expenseId: string; relativePath: string | null }) =>
      ipcRenderer.invoke('expense:setReceipt', payload)
  },
  customers: {
    list: (q: { search?: string }) => ipcRenderer.invoke('customers:list', q),
    save: (row: unknown) => ipcRenderer.invoke('customers:save', row),
    loyalty: (payload: { customerId: string; delta: number; reason: string }) =>
      ipcRenderer.invoke('customers:loyalty', payload),
    receivePayment: (payload: { customerId: string; amount: number; note?: string }) =>
      ipcRenderer.invoke('customers:receivePayment', payload),
    invoices: (payload: { customerId: string }) => ipcRenderer.invoke('customers:invoices', payload),
    invoiceDetails: (payload: { saleId: string }) => ipcRenderer.invoke('customers:invoiceDetails', payload),
    delete: (payload: { id: string }) => ipcRenderer.invoke('customers:delete', payload)
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    roles: () => ipcRenderer.invoke('users:roles'),
    save: (row: unknown) => ipcRenderer.invoke('users:save', row),
    delete: (id: string) => ipcRenderer.invoke('users:delete', id),
    permissionState: (userId: string) => ipcRenderer.invoke('users:permissionState', userId),
    setPermissionState: (payload: {
      userId: string
      useCustomPermissions: boolean
      permissionCodes: string[]
    }) => ipcRenderer.invoke('users:setPermissionState', payload)
  },
  permissions: {
    list: () => ipcRenderer.invoke('permissions:list')
  },
  roles: {
    create: (payload: { name: string; code?: string }) => ipcRenderer.invoke('roles:create', payload),
    setPermissions: (payload: { roleId: string; permissionCodes: string[] }) =>
      ipcRenderer.invoke('roles:setPermissions', payload)
  },
  audit: {
    list: (q: { take?: number; action?: string }) => ipcRenderer.invoke('audit:list', q)
  },
  reports: {
    dashboard: () => ipcRenderer.invoke('reports:dashboard'),
    slowMovers: () => ipcRenderer.invoke('reports:slowMovers'),
    salesSummary: (q: { from: string; to: string; paymentMethod?: string; invoiceSearch?: string }) =>
      ipcRenderer.invoke('reports:salesSummary', q),
    topSelling: (q: { from: string; to: string; limit?: number }) =>
      ipcRenderer.invoke('reports:topSelling', q),
    profit: (q: { from: string; to: string }) => ipcRenderer.invoke('reports:profit', q),
    inventoryValue: () => ipcRenderer.invoke('reports:inventoryValue'),
    hourlySales: (q: { from: string; to: string }) => ipcRenderer.invoke('reports:hourlySales', q),
    cashierStats: (q: { from: string; to: string }) => ipcRenderer.invoke('reports:cashierStats', q),
    paymentBreakdown: (q: { from: string; to: string; paymentMethod?: string; invoiceSearch?: string }) =>
      ipcRenderer.invoke('reports:paymentBreakdown', q),
    salesList: (q: {
      from: string
      to: string
      paymentMethod?: string
      invoiceSearch?: string
      take?: number
    }) => ipcRenderer.invoke('reports:salesList', q)
  },
  print: {
    saleReceipt: (saleId: string) => ipcRenderer.invoke('print:saleReceipt', saleId)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', { key, value })
  },
  shortcuts: {
    list: () => ipcRenderer.invoke('shortcuts:list'),
    set: (actionId: string, keys: string) => ipcRenderer.invoke('shortcuts:set', { actionId, keys })
  },
  backup: {
    list: () => ipcRenderer.invoke('backup:list'),
    run: () => ipcRenderer.invoke('backup:run'),
    restore: (filePath: string) => ipcRenderer.invoke('backup:restore', filePath)
  },
  device: {
    getId: () => ipcRenderer.invoke('device:getId')
  },
  hardware: {
    cashDrawer: () => ipcRenderer.invoke('hardware:cashDrawer'),
    listPrinters: () => ipcRenderer.invoke('hardware:listPrinters'),
    getConfig: () => ipcRenderer.invoke('hardware:getConfig'),
    setConfig: (cfg: unknown) => ipcRenderer.invoke('hardware:setConfig', cfg),
    testPrint: () => ipcRenderer.invoke('hardware:testPrint'),
    testDrawer: () => ipcRenderer.invoke('hardware:testDrawer')
  },
  scale: {
    readWeight: () => ipcRenderer.invoke('scale:readWeight')
  },
  files: {
    pickExpenseImage: () => ipcRenderer.invoke('files:pickExpenseImage')
  },
  invoice: {
    exportSalePdf: (saleId: string) => ipcRenderer.invoke('invoice:exportSalePdf', saleId)
  },
  expenses: {
    add: (payload: { amount: number; category: string; note?: string }) =>
      ipcRenderer.invoke('expenses:add', payload)
  },
  onHardware: (channel: 'hardware:print' | 'hardware:cash-drawer', fn: (payload: unknown) => void) => {
    const sub = (_: Electron.IpcRendererEvent, data: unknown) => fn(data)
    ipcRenderer.on(channel, sub)
    return () => ipcRenderer.removeListener(channel, sub)
  },
  diagnostics: {
    collect: () => ipcRenderer.invoke('diagnostics:collect')
  },
  recovery: {
    saveCart: (snap: {
      lines: { productId: string; name: string; quantity: number; unitPrice: number; discount: number }[]
      cartDiscount: number
    }) => ipcRenderer.invoke('recovery:saveCart', snap),
    loadCart: () => ipcRenderer.invoke('recovery:loadCart'),
    clearCart: () => ipcRenderer.invoke('recovery:clearCart')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    setChannel: (ch: 'stable' | 'beta') => ipcRenderer.invoke('updater:setChannel', ch),
    onStatus: (fn: (payload: unknown) => void) => {
      const sub = (_: Electron.IpcRendererEvent, data: unknown) => fn(data)
      ipcRenderer.on('updater:status', sub)
      return () => ipcRenderer.removeListener('updater:status', sub)
    }
  },
  promotions: {
    save: (payload: unknown) => ipcRenderer.invoke('promotions:save', payload),
    list: (productId: string) => ipcRenderer.invoke('promotions:list', productId),
    delete: (id: string) => ipcRenderer.invoke('promotions:delete', id),
    toggle: (id: string) => ipcRenderer.invoke('promotions:toggle', id),
    getActive: (productIds: string[]) => ipcRenderer.invoke('promotions:getActive', productIds)
  }
}

contextBridge.exposeInMainWorld('posApi', api)
