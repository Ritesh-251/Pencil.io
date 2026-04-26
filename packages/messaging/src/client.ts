import amqp, { ChannelModel, ConfirmChannel } from "amqplib";

export interface RabbitMQConfig {
  url: string;
  reconnectDelayMs?: number;
  serviceName: string;
  logger?: {
    info: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
  };
}

export type TopologySetup = (channel: ConfirmChannel) => Promise<void>;

export class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private config: RabbitMQConfig;
  private isHealthy = false;
  private reconnecting = false;
  private readyListeners = new Set<() => void | Promise<void>>();
  private topologySetup?: TopologySetup;

  constructor(config: RabbitMQConfig) {
    this.config = {
      reconnectDelayMs: 2000,
      ...config,
    };
  }

  public setTopology(setup: TopologySetup) {
    this.topologySetup = setup;
  }

  public onReady(listener: () => void | Promise<void>) {
    this.readyListeners.add(listener);
    if (this.isHealthy) {
      void listener();
    }
    return () => this.readyListeners.delete(listener);
  }

  public async connect(): Promise<void> {
    if (this.reconnecting) return;

    try {
      this.config.logger?.info(`[${this.config.serviceName}] Connecting to RabbitMQ...`);
      const conn = await amqp.connect(this.config.url);
      this.connection = conn;

      conn.on("close", () => this.handleDisconnect("connection closed"));
      conn.on("error", (err) => this.handleDisconnect("connection error", err));

      const ch = await conn.createConfirmChannel();
      this.channel = ch;

      ch.on("close", () => this.handleDisconnect("channel closed"));
      ch.on("error", (err) => this.handleDisconnect("channel error", err));

      if (this.topologySetup) {
        await this.topologySetup(ch);
      }

      this.isHealthy = true;
      this.config.logger?.info(`[${this.config.serviceName}] RabbitMQ connected and topology ready`);

      for (const listener of this.readyListeners) {
        await listener();
      }
    } catch (error) {
      this.handleDisconnect("connection failed", error);
    }
  }

  private handleDisconnect(reason: string, error?: any) {
    this.isHealthy = false;
    this.connection = null;
    this.channel = null;

    if (error) {
      this.config.logger?.error(`[${this.config.serviceName}] RabbitMQ ${reason}`, { err: error });
    } else {
      this.config.logger?.info(`[${this.config.serviceName}] RabbitMQ ${reason}`);
    }

    if (!this.reconnecting) {
      this.reconnecting = true;
      setTimeout(async () => {
        this.reconnecting = false;
        await this.connect();
      }, this.config.reconnectDelayMs);
    }
  }

  public getChannel(): ConfirmChannel {
    if (!this.channel) {
      throw new Error(`[${this.config.serviceName}] RabbitMQ channel not initialized`);
    }
    return this.channel;
  }

  public getStatus() {
    return {
      healthy: this.isHealthy,
    };
  }
}
