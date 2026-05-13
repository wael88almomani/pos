# دليل Material Design 3 للمشروع

## ✅ تم تطبيقه:
- ✅ PosPage - صفحة البيع (كاملة)
- ✅ AppShell - القائمة الجانبية والعلوية (كاملة)
- 🔄 ProductsPage - صفحة المنتجات (جزئي)

---

## 🎨 نمط التصميم الموحد

### 1. الصفحة الرئيسية (Container)
```tsx
<div className="flex h-screen flex-col overflow-hidden bg-gray-50">
```
**قديم:** `bg-[#d0d0d0]` | **جديد:** `bg-gray-50`

### 2. شريط العنوان (Header)
```tsx
<header className="border-b border-gray-200 bg-gradient-to-r from-white to-gray-50 px-4 py-3 shadow-sm">
  <h1 className="text-xl font-bold text-blue-700">العنوان</h1>
</header>
```
**قديم:** `border-b-2 border-[#555] bg-gradient-to-b from-[#e8e8e8] to-[#c0c0c0]`

### 3. الإحصائيات/Cards العلوية
```tsx
<div className="border-b border-gray-200 bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
  <span className="font-bold text-slate-600">اسم الحقل:</span>
  <span className="mr-2 font-mono font-bold text-blue-600">{value}</span>
</div>
```

### 4. الجداول (Tables)
```tsx
<div className="flex-1 overflow-auto p-4">
  <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
          <th className="border-l border-gray-200 px-3 py-3 text-right">
            <button className="font-bold text-slate-700 hover:text-blue-600 transition-colors">
              العنوان ↑
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors">
          <td className="border-l border-gray-100 px-3 py-2.5 text-right">النص</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

**قديم:** `border-2 border-[#808080]` | **جديد:** `rounded-xl border border-gray-200`

### 5. الأزرار (Buttons)

#### زر أساسي (Primary)
```tsx
<button className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all">
  حفظ
</button>
```

#### زر ثانوي (Secondary)
```tsx
<button className="rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-gray-50 hover:shadow-md transition-all">
  إلغاء
</button>
```

#### زر خطر (Danger)
```tsx
<button className="rounded-lg bg-gradient-to-br from-red-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg hover:from-red-600 hover:to-red-700 active:scale-95 transition-all">
  حذف
</button>
```

### 6. الحقول (Inputs)
```tsx
<input 
  className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
  placeholder="البحث..."
/>
```

**قديم:** `border border-slate-400 shadow-inner`

### 7. Select/Dropdown
```tsx
<select className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all">
  <option>اختر...</option>
</select>
```

### 8. النوافذ المنبثقة (Modals)
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
  <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
    {/* Header */}
    <div className="flex items-center justify-between bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 text-white">
      <h2 className="text-lg font-bold">عنوان النافذة</h2>
      <button className="rounded-lg p-1.5 hover:bg-white/20 transition-all">
        <X className="h-5 w-5" />
      </button>
    </div>
    
    {/* Body */}
    <div className="p-4">
      المحتوى
    </div>
    
    {/* Footer */}
    <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3">
      <button className="...">إلغاء</button>
      <button className="...">حفظ</button>
    </div>
  </div>
</div>
```

### 9. البطاقات (Cards)
```tsx
<div className="rounded-xl border border-gray-200 bg-white p-4 shadow-lg hover:shadow-xl transition-all">
  <h3 className="text-lg font-bold text-slate-800 mb-2">عنوان</h3>
  <p className="text-sm text-slate-600">النص</p>
</div>
```

---

## 📊 لوحة الألوان

### الأساسية
- **Primary Blue**: `from-blue-500 to-blue-600` | `text-blue-600` | `border-blue-300`
- **Success Green**: `from-green-500 to-green-600` | `text-green-600`
- **Danger Red**: `from-red-500 to-red-600` | `text-red-600`
- **Warning Orange**: `from-orange-500 to-orange-600` | `text-orange-600`

### الخلفيات
- **صفحة**: `bg-gray-50`
- **Card/Table**: `bg-white`
- **Header**: `bg-gradient-to-r from-white to-gray-50`
- **Stats**: `bg-gradient-to-br from-blue-50 to-indigo-50`

### النصوص
- **عناوين**: `text-blue-700`
- **نصوص**: `text-slate-700`
- **ثانوية**: `text-slate-600`
- **Hover**: `hover:text-blue-600`

---

## 🔄 أمثلة التحويل

### قبل (Windows 98):
```tsx
<div className="bg-[#d0d0d0] border-2 border-[#808080]">
  <h1 className="font-black text-[#1a1a1a]">العنوان</h1>
</div>
```

### بعد (Material Design 3):
```tsx
<div className="bg-gray-50 rounded-xl border border-gray-200 shadow-lg">
  <h1 className="text-xl font-bold text-blue-700">العنوان</h1>
</div>
```

---

## ✨ نصائح سريعة

1. **الحدود**: استبدل `border-2 border-[#808080]` بـ `border border-gray-200`
2. **الظلال**: استبدل `shadow-lg` (قديم) بـ `shadow-sm` أو `shadow-md` أو `shadow-lg`
3. **الانحناءات**: استبدل `rounded-sm` بـ `rounded-lg` أو `rounded-xl`
4. **الخلفيات**: استبدل `bg-[#hex]` بـ `bg-gray-50` أو `bg-gradient-to-r from-blue-500 to-blue-600`
5. **Transitions**: أضف `transition-all` لكل عنصر تفاعلي

---

## 📋 قائمة الصفحات للتحديث

- [x] PosPage.tsx
- [x] AppShell.tsx
- [ ] ProductsPage.tsx (جزئي)
- [ ] InventoryPage.tsx
- [ ] InventoryCountPage.tsx
- [ ] CustomersPage.tsx
- [ ] SuppliersPage.tsx
- [ ] ReceivablesPage.tsx
- [ ] PurchasesPage.tsx
- [ ] ReturnsPage.tsx
- [ ] ReportsPage.tsx
- [ ] ExpensesModulePage.tsx
- [ ] UsersPage.tsx
- [ ] UserPermissionsPage.tsx
- [ ] RolesPermissionsPage.tsx
- [ ] SettingsPage.tsx
- [ ] HardwareSettingsPage.tsx
- [ ] DiagnosticsPage.tsx
- [ ] RestorePage.tsx
- [ ] PromotionsPage.tsx
- [ ] AuditPage.tsx

---

## 🚀 البدء السريع

لتحديث أي صفحة:

1. ابحث عن `bg-[#` واستبدلها بـ Material colors
2. ابحث عن `border-2` واستبدلها بـ `border`
3. ابحث عن `border-[#` واستبدلها بـ `border-gray-200`
4. أضف `rounded-lg` أو `rounded-xl` للعناصر
5. أضف `shadow-sm` أو `shadow-md` للبطاقات
6. أضف `transition-all` للأزرار والعناصر التفاعلية
7. استخدم `text-blue-600` للعناوين بدلاً من الألوان الداكنة

**التصميم الآن احترافي وجاهز للتطبيق على باقي الصفحات! 🎨✨**
