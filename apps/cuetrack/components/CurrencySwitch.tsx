"use client";

import { useMemo, useState } from 'react';
import type { Currency, Payment } from '@/lib/types';
import { currenciesOf } from '@/lib/format';

/**
 * Revenue in different currencies is never summed. When a view spans several
 * currencies (Super Admin, all companies) this picks one to chart/aggregate.
 */
export function useCurrencyScope(payments: Payment[], extra: { currency?: Currency }[] = []) {
  const available = useMemo(() => {
    const list = currenciesOf([...payments, ...extra]);
    return list.length ? list : (['KES'] as Currency[]);
  }, [payments, extra]);
  const [picked, setPicked] = useState<Currency | null>(null);
  const currency: Currency = picked && available.includes(picked) ? picked : available[0];
  const scoped = useMemo(() => payments.filter((p) => (p.currency ?? 'KES') === currency), [payments, currency]);
  return { currency, setCurrency: setPicked, available, scoped, multi: available.length > 1 };
}

export function CurrencySwitch({ value, options, onChange }: { value: Currency; options: Currency[]; onChange: (c: Currency) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="segmented" role="group" aria-label="Currency">
      {options.map((c) => (
        <button key={c} id={`currency-${c.toLowerCase()}`} className={value === c ? 'active' : ''} onClick={() => onChange(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}
