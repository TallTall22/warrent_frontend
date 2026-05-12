export const formatPrice = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(val)

export const formatQty = (val: number): string =>
  new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
