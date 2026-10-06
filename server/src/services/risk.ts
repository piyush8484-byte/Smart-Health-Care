export type VitalInput = {
  heartRate?: number | null;
  spo2?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  temperatureC?: number | null;
  glucoseMgDl?: number | null;
};

export type RiskAssessment = {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number;
  reasons: string[];
  recommendations: string[];
  disclaimer: 'Decision support, not a diagnosis.';
};

export function assessRisk(vitals: VitalInput): RiskAssessment {
  const high: string[] = [];
  const moderate: string[] = [];
  const { heartRate, spo2, systolic, diastolic, temperatureC, glucoseMgDl } = {
    heartRate: vitals.heartRate ?? undefined,
    spo2: vitals.spo2 ?? undefined,
    systolic: vitals.systolic ?? undefined,
    diastolic: vitals.diastolic ?? undefined,
    temperatureC: vitals.temperatureC ?? undefined,
    glucoseMgDl: vitals.glucoseMgDl ?? undefined
  };
  if (spo2 !== undefined && spo2 < 90) high.push('Oxygen saturation is below 90%.');
  else if (spo2 !== undefined && spo2 < 94) moderate.push('Oxygen saturation is below the typical 94% threshold.');
  if (heartRate !== undefined && (heartRate < 40 || heartRate > 130)) high.push('Heart rate is outside the 40-130 bpm safety range.');
  else if (heartRate !== undefined && (heartRate < 50 || heartRate > 110)) moderate.push('Heart rate is outside the typical 50-110 bpm range.');
  if (systolic !== undefined && (systolic >= 180 || systolic < 80)) high.push('Systolic blood pressure is in a critical range.');
  else if (systolic !== undefined && (systolic >= 140 || systolic < 90)) moderate.push('Systolic blood pressure is outside the typical range.');
  if (diastolic !== undefined && diastolic >= 120) high.push('Diastolic blood pressure is in a critical range.');
  else if (diastolic !== undefined && diastolic >= 90) moderate.push('Diastolic blood pressure is elevated.');
  if (temperatureC !== undefined && (temperatureC >= 39 || temperatureC < 35)) high.push('Temperature is in a critical range.');
  else if (temperatureC !== undefined && temperatureC >= 38) moderate.push('Temperature is elevated.');
  if (glucoseMgDl !== undefined && (glucoseMgDl < 54 || glucoseMgDl > 300)) high.push('Glucose is in a critical range.');
  else if (glucoseMgDl !== undefined && (glucoseMgDl < 70 || glucoseMgDl > 200)) moderate.push('Glucose is outside the typical range.');

  const level = high.length ? 'HIGH' : moderate.length ? 'MEDIUM' : 'LOW';
  const reasons = [...high, ...moderate];
  const recommendations = level === 'HIGH'
    ? ['Seek urgent clinical advice; contact local emergency services for severe or worsening symptoms.', 'Recheck the reading if safe and confirm the device is fitted correctly.']
    : level === 'MEDIUM'
      ? ['Repeat the measurement after resting and contact your care team if readings persist or symptoms occur.']
      : ['Continue routine monitoring and follow your clinician’s care plan.'];
  return { level, score: Math.min(100, high.length * 45 + moderate.length * 20), reasons, recommendations, disclaimer: 'Decision support, not a diagnosis.' };
}