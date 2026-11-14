const usd = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol' })

export const money = (n: number) => usd.format(n)
/** $1.2M / $481k, for labels where space is tight */
export const moneyShort = (n: number) =>
  Math.abs(n) >= 999_500 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`
export const signedPct = (n: number) => `${n >= 0 ? '+' : ''}${pct(n)}`
