import { describe, it, expect } from 'vitest';
import { successRateLabel } from './format';

describe('successRateLabel', () => {
  it('renders a dash when the rate is null', () => {
    expect(successRateLabel(null)).toBe('—');
  });
  it('rounds the rate to a whole percentage', () => {
    expect(successRateLabel(2 / 3)).toBe('67%');
    expect(successRateLabel(1)).toBe('100%');
  });
});
