export type SmsProvider = (to: string, message: string) => Promise<void>;

let provider: SmsProvider | undefined;

export function configureSmsProvider(nextProvider: SmsProvider): void {
  provider = nextProvider;
}

export async function sendSms(to: string, message: string): Promise<void> {
  if (!provider) {
    console.info('SMS provider is not configured; notification remains available in-app.');
    return;
  }
  await provider(to, message);
}