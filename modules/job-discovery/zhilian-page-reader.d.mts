export type ZhilianPrivateCandidate = Readonly<{
  jobUrl: string;
  title: string;
  company: string;
  description: string;
}>;

export type ZhilianPrivateReadResult = Readonly<{
  candidates: readonly ZhilianPrivateCandidate[];
  blocker?: 'login_required' | 'verification_required' | 'page_drift' | 'rate_limited';
}>;

export function collectZhilianSearchCards(
  maxCards: number,
  maxDetails?: number
): Promise<ZhilianPrivateReadResult>;

export class ZhilianPageReader {
  constructor(options: {
    connection: {
      cdpPort: number;
      targetId: string;
      origin: string;
      pathPattern: string;
    };
    cdpFactory?: (connection: unknown) => {
      send(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
      close(): void;
    };
    findTarget?: (port: number, targetId: string) => Promise<{
      origin: string;
      pathPattern: string;
    }>;
  });

  readPage(input: { page: number; remaining: number; maxDetails?: number; deadlineMs?: number }): Promise<ZhilianPrivateReadResult>;
}
