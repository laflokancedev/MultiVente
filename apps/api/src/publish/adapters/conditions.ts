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
