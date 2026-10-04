import { describe, expect, it } from 'vitest';
import { rateLimitWindow } from '../server/openMeteo';

describe('rateLimitWindow', () => {
  it("recognises each of Open-Meteo's limit messages", () => {
    expect(rateLimitWindow(429, 'Minutely API request limit exceeded. Please try again in one minute.')).toBe('minute');
    expect(rateLimitWindow(429, 'Hourly API request limit exceeded. Please try again in the next hour.')).toBe('hour');
    expect(rateLimitWindow(429, 'Daily API request limit exceeded.')).toBe('day');
    expect(rateLimitWindow(429, undefined)).toBe('minute');
  });

  it('leaves other errors alone', () => {
    expect(rateLimitWindow(400, 'Parameter latitude must be in range of -90 to 90')).toBeNull();
    expect(rateLimitWindow(200, undefined)).toBeNull();
  });
});
