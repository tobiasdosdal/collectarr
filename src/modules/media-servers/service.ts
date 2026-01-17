/**
 * Media Server Service
 * Generic CRUD operations for media servers (Radarr, Sonarr, Emby)
 */

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { encryptApiKey, decryptApiKey } from '../../utils/api-key-crypto.js';
import type {
  ServerConfig,
  ServerBody,
  ServerResponse,
  ProfileResponse,
  RootFolderResponse,
  StoredServer,
  ServerClient,
  ClientFactory,
  TestConnectionResult,
} from './types.js';

export class MediaServerService<T extends ServerClient> {
  private fastify: FastifyInstance;
  private config: ServerConfig;
  private createClient: ClientFactory<T>;
  private log: FastifyBaseLogger;

  constructor(
    fastify: FastifyInstance,
    config: ServerConfig,
    createClient: ClientFactory<T>
  ) {
    this.fastify = fastify;
    this.config = config;
    this.createClient = createClient;
    this.log = fastify.log;
  }

  private get prismaModel() {
    return (this.fastify.prisma as any)[this.config.modelName];
  }

  /**
   * List all servers (sanitized - no API keys)
   */
  async listServers(): Promise<ServerResponse[]> {
    const servers = await this.prismaModel.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return servers.map((s: StoredServer) => this.sanitizeServer(s));
  }

  /**
   * Get server by ID with connection info
   */
  async getServer(id: string): Promise<(ServerResponse & { serverInfo: { serverName: string; version: string } | null }) | null> {
    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return null;
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = this.createClient(server.url, decryptedApiKey);

    let serverInfo = null;
    if (client) {
      const testResult = await client.testConnection();
      if (testResult.success) {
        serverInfo = {
          serverName: testResult.serverName || '',
          version: testResult.version || '',
        };
      }
    }

    return {
      ...this.sanitizeServer(server),
      serverInfo,
    };
  }

  /**
   * Test connection with provided credentials
   */
  async testConnection(url: string, apiKey: string): Promise<TestConnectionResult> {
    const client = this.createClient(url, apiKey);
    if (!client) {
      return {
        success: false,
        error: 'Invalid url or apiKey provided',
      };
    }
    return client.testConnection();
  }

  /**
   * Create a new server
   */
  async createServer(body: ServerBody): Promise<{
    success: boolean;
    server?: ServerResponse & { serverName?: string; serverVersion?: string };
    error?: string;
    statusCode?: number;
  }> {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = body;

    if (!name || !url || !apiKey) {
      return {
        success: false,
        error: 'name, url, and apiKey are required',
        statusCode: 400,
      };
    }

    // Test connection first
    this.log.info(`Testing ${this.config.serviceName} connection: url=${url}`);
    const client = this.createClient(url, apiKey);
    if (!client) {
      return {
        success: false,
        error: 'Invalid url or apiKey provided',
        statusCode: 400,
      };
    }

    const testResult = await client.testConnection();
    this.log.info(`${this.config.serviceName} test result: ${JSON.stringify(testResult)}`);

    if (!testResult.success) {
      return {
        success: false,
        error: `Failed to connect to ${this.config.serviceName} server: ${testResult.error}`,
        statusCode: 400,
      };
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await this.prismaModel.updateMany({
        data: { isDefault: false },
      });
    }

    // Encrypt API key before storage
    const encryptedKey = encryptApiKey(apiKey);
    if (!encryptedKey) {
      return {
        success: false,
        error: 'Failed to encrypt API key',
        statusCode: 500,
      };
    }

    const serverData: Record<string, unknown> = {
      name,
      url: url.replace(/\/$/, ''),
      apiKey: encryptedKey.apiKey,
      apiKeyIv: encryptedKey.apiKeyIv,
      isDefault: isDefault || false,
    };

    if (this.config.supportsProfiles) {
      serverData.qualityProfileId = qualityProfileId || null;
    }
    if (this.config.supportsRootFolders) {
      serverData.rootFolderPath = rootFolderPath || null;
    }

    const server = await this.prismaModel.create({
      data: serverData,
    });

    return {
      success: true,
      server: {
        ...this.sanitizeServer(server),
        serverName: testResult.serverName,
        serverVersion: testResult.version,
      },
    };
  }

  /**
   * Update an existing server
   */
  async updateServer(id: string, body: ServerBody): Promise<{
    success: boolean;
    server?: ServerResponse;
    error?: string;
    statusCode?: number;
  }> {
    const { name, url, apiKey, isDefault, qualityProfileId, rootFolderPath } = body;

    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return {
        success: false,
        error: `${this.config.serviceName} server not found`,
        statusCode: 404,
      };
    }

    // Decrypt existing API key for connection test
    const existingApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);

    // If updating URL or API key, test connection
    if (url || apiKey) {
      const client = this.createClient(url || server.url, apiKey || existingApiKey);
      if (!client) {
        return {
          success: false,
          error: 'Invalid url or apiKey provided',
          statusCode: 400,
        };
      }
      const testResult = await client.testConnection();
      if (!testResult.success) {
        return {
          success: false,
          error: `Failed to connect: ${testResult.error}`,
          statusCode: 400,
        };
      }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await this.prismaModel.updateMany({
        where: { id: { not: server.id } },
        data: { isDefault: false },
      });
    }

    // Encrypt new API key if provided
    let apiKeyData = {};
    if (apiKey) {
      const encryptedKey = encryptApiKey(apiKey);
      if (!encryptedKey) {
        return {
          success: false,
          error: 'Failed to encrypt API key',
          statusCode: 500,
        };
      }
      apiKeyData = { apiKey: encryptedKey.apiKey, apiKeyIv: encryptedKey.apiKeyIv };
    }

    const updateData: Record<string, unknown> = {
      ...(name && { name }),
      ...(url && { url: url.replace(/\/$/, '') }),
      ...apiKeyData,
      ...(isDefault !== undefined && { isDefault }),
    };

    if (this.config.supportsProfiles && qualityProfileId !== undefined) {
      updateData.qualityProfileId = qualityProfileId;
    }
    if (this.config.supportsRootFolders && rootFolderPath !== undefined) {
      updateData.rootFolderPath = rootFolderPath;
    }

    const updated = await this.prismaModel.update({
      where: { id },
      data: updateData,
    });

    return {
      success: true,
      server: this.sanitizeServer(updated),
    };
  }

  /**
   * Delete a server
   */
  async deleteServer(id: string): Promise<{
    success: boolean;
    error?: string;
    statusCode?: number;
  }> {
    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return {
        success: false,
        error: `${this.config.serviceName} server not found`,
        statusCode: 404,
      };
    }

    await this.prismaModel.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Get quality profiles for a server
   */
  async getProfiles(id: string): Promise<{
    success: boolean;
    profiles?: ProfileResponse[];
    error?: string;
    statusCode?: number;
  }> {
    if (!this.config.supportsProfiles) {
      return {
        success: false,
        error: `${this.config.serviceName} does not support quality profiles`,
        statusCode: 400,
      };
    }

    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return {
        success: false,
        error: `${this.config.serviceName} server not found`,
        statusCode: 404,
      };
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = this.createClient(server.url, decryptedApiKey);
    if (!client) {
      return {
        success: false,
        error: `Failed to create ${this.config.serviceName} client`,
        statusCode: 500,
      };
    }

    try {
      if (!client.getQualityProfiles) {
        return {
          success: false,
          error: `${this.config.serviceName} client does not support quality profiles`,
          statusCode: 500,
        };
      }
      const profiles = await client.getQualityProfiles();
      return {
        success: true,
        profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
      };
    } catch (error) {
      this.log.error(`Failed to fetch ${this.config.serviceName} profiles: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message || `Failed to connect to ${this.config.serviceName} server`,
        statusCode: 502,
      };
    }
  }

  /**
   * Get root folders for a server
   */
  async getRootFolders(id: string): Promise<{
    success: boolean;
    folders?: RootFolderResponse[];
    error?: string;
    statusCode?: number;
  }> {
    if (!this.config.supportsRootFolders) {
      return {
        success: false,
        error: `${this.config.serviceName} does not support root folders`,
        statusCode: 400,
      };
    }

    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return {
        success: false,
        error: `${this.config.serviceName} server not found`,
        statusCode: 404,
      };
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = this.createClient(server.url, decryptedApiKey);
    if (!client) {
      return {
        success: false,
        error: `Failed to create ${this.config.serviceName} client`,
        statusCode: 500,
      };
    }

    try {
      if (!client.getRootFolders) {
        return {
          success: false,
          error: `${this.config.serviceName} client does not support root folders`,
          statusCode: 500,
        };
      }
      const folders = await client.getRootFolders();
      return {
        success: true,
        folders: folders.map((f) => ({
          id: f.id,
          path: f.path,
          freeSpace: f.freeSpace,
          accessible: f.accessible,
        })),
      };
    } catch (error) {
      this.log.error(`Failed to fetch ${this.config.serviceName} root folders: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message || `Failed to connect to ${this.config.serviceName} server`,
        statusCode: 502,
      };
    }
  }

  /**
   * Get a client for a server by ID
   */
  async getClient(id: string): Promise<{
    client: T | null;
    server: StoredServer | null;
    error?: string;
    statusCode?: number;
  }> {
    const server = await this.prismaModel.findUnique({
      where: { id },
    });

    if (!server) {
      return {
        client: null,
        server: null,
        error: `${this.config.serviceName} server not found`,
        statusCode: 404,
      };
    }

    const decryptedApiKey = decryptApiKey(server.apiKey, server.apiKeyIv);
    const client = this.createClient(server.url, decryptedApiKey);

    if (!client) {
      return {
        client: null,
        server,
        error: `Failed to create ${this.config.serviceName} client`,
        statusCode: 500,
      };
    }

    return { client, server };
  }

  /**
   * Sanitize server response (remove sensitive data)
   */
  private sanitizeServer(server: StoredServer): ServerResponse {
    const response: ServerResponse = {
      id: server.id,
      name: server.name,
      url: server.url,
      isDefault: server.isDefault,
      createdAt: server.createdAt,
    };

    if (this.config.supportsProfiles) {
      response.qualityProfileId = server.qualityProfileId;
    }
    if (this.config.supportsRootFolders) {
      response.rootFolderPath = server.rootFolderPath;
    }

    return response;
  }
}
