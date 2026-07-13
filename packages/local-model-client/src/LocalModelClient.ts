import type {
  ModelConfig,
  ModelRequest,
  ModelResponse,
} from "@laboratory/shared-types";
export interface ModelHealth {
  readonly healthy: boolean;
  readonly providerReachable: boolean;
  readonly modelInstalled: boolean;
  readonly message: string;
}
export interface LocalModelClient {
  complete(request: ModelRequest): Promise<ModelResponse>;
  healthCheck(config: ModelConfig): Promise<ModelHealth>;
}
