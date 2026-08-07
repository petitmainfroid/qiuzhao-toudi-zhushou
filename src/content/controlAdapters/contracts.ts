export type PageControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

export type AdapterWriteFailureReason = "option-not-found" | "unsupported-control" | "verification-failed";

export interface AdapterWriteContext {
  optionTimeoutMs: number;
  normalize(value: string): string;
}

export type AdapterWriteResult =
  | { status: "written" }
  | { status: "failed"; reason: AdapterWriteFailureReason };

export interface PageControlAdapter {
  id:
    | "feishu-date-range"
    | "feishu-select"
    | "ant-select"
    | "element-select"
    | "aria-combobox"
    | "native";
  canHandle(element: PageControl): boolean;
  read(element: PageControl): string[] | null;
  write(element: PageControl, value: string, context: AdapterWriteContext): Promise<AdapterWriteResult>;
  verify(element: PageControl, value: string, context: AdapterWriteContext): boolean;
}
