export interface DemoServer {
  port: number;
  setMutations(names: string[]): void;
  close(): Promise<void>;
}
export function startDemoServer(port?: number): Promise<DemoServer>;
