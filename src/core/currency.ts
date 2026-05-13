/** عرض المبالغ — الدينار الأردني (Jordanian Dinar) */
export const CURRENCY_SUFFIX = ' JD'

/** تسمية قصيرة للحقول (مثال: الرصيد الافتتاحي) */
export const CURRENCY_LABEL = 'JD'

export function formatMoney(value: number, fractionDigits = 2): string {
  return `${value.toFixed(fractionDigits)}${CURRENCY_SUFFIX}`
}
