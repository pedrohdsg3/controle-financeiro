import {
  AlertTriangle, Bell, CalendarRange, Car, Check, Clock, CreditCard, Divide, FileText, Home, Package, PartyPopper, Pill,
  Repeat, Search, ShoppingBag, Tag, Target, Tv, User, Users, Utensils, Wallet, Zap, type LucideIcon,
} from 'lucide-react';

/** Categorias guardam um emoji no banco; aqui ele vira um ícone de linha. Emoji sem par aparece como está. */
const MAP: Record<string, LucideIcon> = {
  '🍔': Utensils, '🎉': PartyPopper, '📺': Tv, '🛍': ShoppingBag, '🚗': Car, '💊': Pill, '🏠': Home, '📦': Package, '🏷': Tag,
  '💰': Wallet, '🔁': Repeat, '📆': CalendarRange, '⚡': Zap, '💳': CreditCard, '🧾': FileText, '🔎': Search, '✅': Check,
  '⚠': AlertTriangle, '⏰': Clock, '⏳': Clock, '🔔': Bell, '🎯': Target, '👥': Users, '🙋': User, '➗': Divide,
};

export function Glyph({ e, size = 16, color }: { e?: string; size?: number; color?: string }) {
  if (!e) return null;
  const Icon = MAP[e.replace(/️/g, '')];
  if (!Icon) return <span aria-hidden style={{ fontSize: size }}>{e}</span>;
  return <Icon size={size} color={color} strokeWidth={2} aria-hidden style={{ flex: 'none', verticalAlign: '-0.15em' }} />;
}

export function Avatar({ icon, color }: { icon: string; color?: string }) {
  return (
    <div className="avatar" style={{ background: `color-mix(in srgb, ${color ?? 'var(--muted)'} 16%, transparent)` }}>
      <Glyph e={icon} size={18} color={color ?? 'var(--muted)'} />
    </div>
  );
}
