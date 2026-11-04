import { Check, Nfc } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Card } from '../db/types';
import { ALERT_DAYS, dueLabel, type Bill } from '../engine/bills';
import { cardProduct, faceStyle } from '../lib/cardStyle';
import { monthLabel, shortDateBR } from '../lib/months';
import { Money } from './common';

function Chip() {
  return (
    <svg className="cc-chip" viewBox="0 0 40 30" aria-hidden>
      <rect x="0.5" y="0.5" width="39" height="29" rx="5" fill="#d9c07c" stroke="#a88f4e" />
      <path d="M0 10h13M0 20h13M27 10h13M27 20h13M13 0v30M27 0v30M13 15h14" stroke="#9c8444" strokeWidth="1" fill="none" />
    </svg>
  );
}

function Face({ card, bill, flipped, onFlip }: { card: Card; bill: Bill; flipped: boolean; onFlip: () => void }) {
  const { background, color, finish } = faceStyle(card);
  const product = cardProduct(card);
  const paidOff = bill.total > 0 && bill.remaining === 0;
  const pct = bill.total ? Math.min(100, (bill.paid / bill.total) * 100) : 0;
  const status = paidOff ? 'Paga'
    : bill.days === null ? 'Sem vencimento'
      : bill.days <= ALERT_DAYS ? dueLabel(bill.days) : `vence ${shortDateBR(bill.dueDate!)}`;
  return (
    <button type="button" className={`cc ${flipped ? 'flipped' : ''}`} onClick={onFlip} style={{ color }}
      aria-label={`${card.name}: toque para ${flipped ? 'ver a frente' : 'ver os detalhes'}`}>
      <span className="cc-inner">
        <span className={`cc-side cc-front finish-${finish}`} style={{ background }}>
          <span className="cc-top">
            <span className="cc-brand">
              <strong>{card.name}</strong>
              {product && <small>{product}</small>}
            </span>
            <Nfc size={20} aria-hidden />
          </span>
          <Chip />
          <span className="cc-bottom">
            <span>
              <small>Fatura de {monthLabel(bill.month)}</small>
              <Money value={bill.total} className="cc-amount" />
            </span>
            <span className={`cc-status ${!paidOff && bill.days !== null && bill.days < 0 ? 'late' : ''}`}>
              {paidOff && <Check size={13} aria-hidden />}{status}
            </span>
          </span>
          <span className="cc-progress" aria-hidden><span style={{ width: `${pct}%` }} /></span>
        </span>
        <span className={`cc-side cc-back finish-${finish}`} style={{ background }}>
          <span className="cc-stripe" />
          <span className="cc-facts">
            <span><small>Fecha</small><b>{card.closingDay ? `dia ${card.closingDay}` : '—'}</b></span>
            <span><small>Vence</small><b>{card.dueDay ? `dia ${card.dueDay}` : '—'}</b></span>
            <span><small>Melhor dia de compra</small><b>{card.closingDay ? `dia ${card.closingDay}` : '—'}</b></span>
          </span>
        </span>
      </span>
    </button>
  );
}

/** Carteira: desliza para trocar de cartão, toca para virar. */
export function CardWallet({ items, active, onActive }: {
  items: { card: Card; bill: Bill }[]; active: number; onActive: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const activeId = items[active]?.card.id;
  const autoScroll = useRef(false);
  const autoTimer = useRef<number | undefined>(undefined);

  // Mantém o cartão ativo centralizado quando ele muda de fora (ex: tocar num aviso ou num ponto).
  useEffect(() => {
    const el = ref.current?.children[active] as HTMLElement | undefined;
    const box = ref.current;
    if (!el || !box) return;
    const target = el.offsetLeft - (box.clientWidth - el.clientWidth) / 2;
    if (Math.abs(box.scrollLeft - target) <= 4) return;
    // Durante esta rolagem automática, os eventos de scroll não podem redefinir o cartão ativo.
    autoScroll.current = true;
    clearTimeout(autoTimer.current);
    autoTimer.current = window.setTimeout(() => {
      // Se a animação não terminou (aparelho lento), posiciona de vez antes de voltar a ouvir o scroll.
      if (Math.abs(box.scrollLeft - target) > 4) box.scrollTo({ left: target, behavior: 'auto' });
      window.setTimeout(() => { autoScroll.current = false; }, 80);
    }, 600);
    box.scrollTo({ left: target, behavior: 'smooth' });
  }, [active, activeId]);

  useEffect(() => { setFlippedId(null); }, [activeId]);

  const onScroll = () => {
    const box = ref.current;
    if (!box || autoScroll.current) return;
    const center = box.scrollLeft + box.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    [...box.children].forEach((c, i) => {
      const el = c as HTMLElement;
      const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - center);
      if (d < dist) { dist = d; best = i; }
    });
    if (best !== active) onActive(best);
  };

  return (
    <>
      <div className="wallet" ref={ref} onScroll={onScroll}>
        {items.map(({ card, bill }, i) => (
          <div key={card.id} className={`wallet-slide ${i === active ? 'active' : ''}`}>
            <Face card={card} bill={bill} flipped={flippedId === card.id}
              onFlip={() => (i === active ? setFlippedId(flippedId === card.id ? null : card.id) : onActive(i))} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="wallet-dots">
          {items.map(({ card }, i) => (
            <button key={card.id} type="button" className={i === active ? 'on' : ''} onClick={() => onActive(i)} aria-label={`Ver ${card.name}`} />
          ))}
        </div>
      )}
    </>
  );
}
