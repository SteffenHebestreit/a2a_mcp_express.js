import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config } from '../config';
import logger from '../utils/logger';
import fetch from 'node-fetch';

let mcpClient: Client | null = null;

// Initialize MCP client using Streamable HTTP transport
export const mcpClientReady = (async () => {
  logger.info('--- MCP CLIENT INITIALIZATION ---');
  // Using the mcp.serverUrl from unified config
  if (!config.mcp.serverUrl) {
    logger.warn('MCP_SERVER_URL not defined. MCP Client not configured.');
    return;
  }
  try {
    logger.info(`Initializing MCP Client via Streamable HTTP at: ${config.mcp.serverUrl}`);
    const client = new Client({ 
      name: config.server.name, // Use the configured agent name
      version: '1.0.0',
      protocolVersion: '2024-11-05'
    });
    const transport = new StreamableHTTPClientTransport(new URL(config.mcp.serverUrl));
    await client.connect(transport);
    mcpClient = client;
    logger.info(`MCP Client initialized successfully (Target: ${config.mcp.serverUrl})`);
  } catch (error: any) {
    logger.error('Failed to initialize MCP Client:', error);
    mcpClient = null;
  }
})();

export const getMcpClient = (): Client | null => {
  return mcpClient;
};

export async function invokeMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
  const client = getMcpClient();
  if (!client) {
    throw new Error("MCP Client is not initialized or configuration is missing.");
  }
  logger.info(`Calling MCP tool '${toolName}'`);
  logger.debug('Tool args:', args);
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    logger.info(`MCP tool '${toolName}' returned successfully`);
    logger.debug('Tool result:', result);
    return result;
  } catch (error: any) {
    logger.error(`Error calling MCP tool '${toolName}':`, error);
    throw new Error(`Failed to execute MCP tool '${toolName}': ${error.message || error}`);
  }
}

// Add functions to access resources and prompts from the MCP server
export async function getMcpResource(uri: string): Promise<any> {
  const client = getMcpClient();
  if (!client) {
    throw new Error("MCP Client is not initialized or configuration is missing.");
  }
  logger.info(`Getting MCP resource '${uri}'`);
  try {
    const result = await client.readResource({ uri });
    logger.info('MCP resource returned successfully');
    logger.debug('Resource result:', result);
    return result;
  } catch (error: any) {
    logger.error('Error reading MCP resource:', error);
    throw new Error(`Failed to read MCP resource '${uri}': ${error.message || error}`);
  }
}

export async function listMcpResources(prefix: string = ""): Promise<string[]> {
  const client = getMcpClient();
  if (!client) {
    throw new Error("MCP Client is not initialized or configuration is missing.");
  }
  logger.info('Listing MCP resources');
  try {
    const resources = (await client.listResources() as unknown) as string[];
    logger.info('MCP resources retrieved');
    logger.debug('Resources:', resources);
    return resources.filter(uri => uri.startsWith(prefix));
  } catch (error: any) {
    logger.error('Error listing MCP resources:', error);
    throw new Error(`Failed to list MCP resources: ${error.message || error}`);
  }
}

export async function getMcpPrompt(name: string, args: Record<string, any> = {}): Promise<any> {
  const client = getMcpClient();
  if (!client) {
    throw new Error("MCP Client is not initialized or configuration is missing.");
  }
  logger.info(`Getting MCP prompt '${name}'`);
  try {
    const result = await client.getPrompt({ name, arguments: args });
    logger.info('MCP prompt returned successfully');
    logger.debug('Prompt result:', result);
    return result;
  } catch (error: any) {
    logger.error('Error getting MCP prompt:', error);
    throw new Error(`Failed to get MCP prompt '${name}': ${error.message || error}`);
  }
}

// Direct low-level wrapper for MCP JSON-RPC to avoid SDK validation errors
async function directMcpRpc(method: string, params: any = {}): Promise<any> {
  if (!config.mcp.serverUrl) {
    throw new Error("MCP_SERVER_URL not defined");
  }
  
  logger.info(`Calling MCP RPC method '${method}' directly`);
  
  try {
    const response = await fetch(config.mcp.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000000),
        method,
        params
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(`RPC error: ${JSON.stringify(result.error)}`);
    }
    
    logger.debug(`Direct RPC response for '${method}':`, result);
    return result.result;
  } catch (error: any) {
    logger.error(`Error in direct MCP RPC call to '${method}':`, error);
    return null;
  }
}

export async function listMcpTools(): Promise<any[]> {
  logger.info('Listing MCP tools via direct RPC');
  const result = await directMcpRpc('listTools');
  // Handle raw array response
  if (Array.isArray(result)) {
    logger.info(`Retrieved ${result.length} MCP tools via direct RPC`);
    return result;
  }
  // Handle object with 'tools' property
  if (result && Array.isArray(result.tools)) {
    logger.info(`Retrieved ${result.tools.length} MCP tools via direct RPC`);
    return result.tools;
  }
  logger.warn('Could not retrieve MCP tools via direct RPC; no MCP tools available');
  return [];
}

export async function getMcpToolMetadata(name: string): Promise<any | undefined> {
  logger.info(`Getting metadata for MCP tool '${name}'`);
  
  // Use our listMcpTools function which already handles errors gracefully
  const tools = await listMcpTools();
  const metadata = tools.find((t: any) => t.name === name);
  
  logger.info(`MCP tool metadata ${metadata ? 'found' : 'not found'} for '${name}'`);
  logger.debug('Metadata:', metadata);
  return metadata;
}
