import { assessRisk } from '../src/services/risk';

describe('assessRisk', () => {
  it('returns low risk for ordinary readings', () => {
    const result = assessRisk({ heartRate: 72, spo2: 98, systolic: 120, diastolic: 80, temperatureC: 36.8, glucoseMgDl: 100 });
    expect(result.level).toBe('LOW');
    expect(result.reasons).toHaveLength(0);
    expect(result.disclaimer).toBe('Decision support, not a diagnosis.');
  });

  it('explains high-risk readings and recommends urgent clinical advice', () => {
    const result = assessRisk({ spo2: 86, heartRate: 140 });
    expect(result.level).toBe('HIGH');
    expect(result.reasons).toHaveLength(2);
    expect(result.recommendations[0]).toContain('urgent clinical advice');
  });

  it('marks borderline readings medium and scores their contributors', () => {
    const result = assessRisk({ spo2: 92, temperatureC: 38.2 });
    expect(result.level).toBe('MEDIUM');
    expect(result.score).toBe(40);
  });
});