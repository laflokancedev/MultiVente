import type { Condition } from '@multimarket/shared';

export const VINTED_CONDITION: Record<Condition, string> = {
  new: 'Neuf avec étiquette',
  like_new: 'Neuf sans étiquette',
  good: 'Très bon état',
  fair: 'Bon état',
};

export const LEBONCOIN_CONDITION: Record<Condition, string> = {
  new: 'Neuf',
  like_new: 'Comme neuf',
  good: 'Bon état',
  fair: 'État correct',
};

export const EBAY_CONDITION: Record<Condition, string> = {
  new: 'NEW',
  like_new: 'LIKE_NEW',
  good: 'USED_GOOD',
  fair: 'USED_ACCEPTABLE',
};

export const WALLAPOP_CONDITION: Record<Condition, string> = {
  new: 'Nuevo',
  like_new: 'Como nuevo',
  good: 'En buen estado',
  fair: 'Aceptable',
};

export const KLEINANZEIGEN_CONDITION: Record<Condition, string> = {
  new: 'Neu',
  like_new: 'Neuwertig',
  good: 'Gut',
  fair: 'In Ordnung',
};

export const SUBITO_CONDITION: Record<Condition, string> = {
  new: 'Nuovo',
  like_new: 'Come nuovo',
  good: 'Buono',
  fair: 'Accettabile',
};
