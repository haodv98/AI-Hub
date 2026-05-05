import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ProviderAdapter, PROVIDER_ADAPTERS } from './provider-adapter.interface';

@Injectable()
export class ProviderAdapterRegistry {
  private readonly map = new Map<string, ProviderAdapter>();

  constructor(@Inject(PROVIDER_ADAPTERS) adapters: ProviderAdapter[]) {
    for (const adapter of adapters) {
      this.map.set(adapter.providerAlias, adapter);
    }
  }

  get(alias: string): ProviderAdapter {
    const adapter = this.map.get(alias);
    if (!adapter) throw new NotFoundException(`No provider adapter registered for alias: ${alias}`);
    return adapter;
  }

  list(): string[] {
    return Array.from(this.map.keys());
  }
}
