import type { PageControl, PageControlAdapter } from "./contracts";
import { feishuDateRangeAdapter } from "./dateRangeAdapter";
import {
  antSelectAdapter,
  ariaComboboxAdapter,
  elementSelectAdapter,
  feishuSelectAdapter
} from "./frameworkSelectAdapters";
import { nativeControlAdapter } from "./nativeAdapter";

export class PageControlAdapterRegistry {
  constructor(private readonly adapters: readonly PageControlAdapter[]) {}

  resolve(element: PageControl, preferredId?: PageControlAdapter["id"]): PageControlAdapter | null {
    if (preferredId) {
      const preferred = this.adapters.find((adapter) => adapter.id === preferredId);
      return preferred?.canHandle(element) ? preferred : null;
    }
    return this.adapters.find((adapter) => adapter.canHandle(element)) ?? null;
  }
}

export const defaultPageControlAdapterRegistry = new PageControlAdapterRegistry([
  feishuDateRangeAdapter,
  feishuSelectAdapter,
  antSelectAdapter,
  elementSelectAdapter,
  ariaComboboxAdapter,
  nativeControlAdapter
]);
