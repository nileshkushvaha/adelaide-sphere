import { describe, expect, it } from 'vitest';
import { SERVICE_ICON_LIBRARY, isServiceIconKey, serviceIconKey } from './service-icons.js';

describe('serviceIconKey', () => {
  it('names the subject of a service, most specific first', () => {
    expect(serviceIconKey('Wifi')).toBe('wifi');
    expect(serviceIconKey('Free Wi-Fi')).toBe('wifi');
    expect(serviceIconKey('Wheelchair access')).toBe('accessible');
    expect(serviceIconKey('Hot water systems')).toBe('water');
    expect(serviceIconKey('Gas fitting')).toBe('gas');
    expect(serviceIconKey('Emergency call-out')).toBe('emergency');
    expect(serviceIconKey('Same-day delivery')).toBe('delivery');
    expect(serviceIconKey('Wedding arrangements')).toBe('wedding');
    expect(serviceIconKey('Dental check-ups')).toBe('dental');
    expect(serviceIconKey('Teeth whitening')).toBe('whitening');
  });

  it('matches whole words, so a bar snack is food and not a bar', () => {
    expect(serviceIconKey('Bar snacks')).toBe('snacks');
    expect(serviceIconKey('Coffee')).toBe('coffee');
    expect(serviceIconKey('Scarves')).toBe('generic');
  });

  it('offers every key in the library, each with a label', () => {
    expect(isServiceIconKey('wifi')).toBe(true);
    expect(isServiceIconKey('Wifi')).toBe(false);
    expect(SERVICE_ICON_LIBRARY.find((entry) => entry.key === 'wifi')?.label).toBe('Wi-Fi');
    expect(new Set(SERVICE_ICON_LIBRARY.map((entry) => entry.key)).size).toBe(SERVICE_ICON_LIBRARY.length);
  });

  it('falls back to a plain tick rather than a wrong picture', () => {
    expect(serviceIconKey('Something nobody has thought of')).toBe('generic');
    expect(serviceIconKey('')).toBe('generic');
  });
});
