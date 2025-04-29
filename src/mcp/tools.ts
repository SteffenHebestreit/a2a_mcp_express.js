import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { invokeMcpTool, getMcpClient, mcpClientReady, getMcpToolMetadata, listMcpTools } from "./client";
import logger from '../utils/logger';
import { config } from "../config";

export interface McpToolInfo {
  name: string;
  description: string;
  schema?: z.ZodObject<any> | Record<string, any>;
}

// Function to discover available MCP tools dynamically from the server
export async function discoverMcpTools(): Promise<McpToolInfo[]> {
  try {
    const toolNames = await listMcpTools();
    const toolsInfo: McpToolInfo[] = [];

    for (const name of toolNames) {
      try {
        const metadata = await getMcpToolMetadata(name);
        toolsInfo.push({
          name,
          description: metadata.description || `MCP tool: ${name}`,
          schema: metadata.schema || undefined
        });
      } catch (error) {
        logger.warn(`Failed to get metadata for tool ${name}:`, error);
        // Add a basic entry without schema
        toolsInfo.push({
          name,
          description: `MCP tool: ${name} (metadata unavailable)`
        });
      }
    }

    return toolsInfo;
  } catch (error) {
    logger.error("Failed to discover MCP tools:", error);
    return [];
  }
}

// Use static tool list from config instead of hardcoded ones
export function getStaticMcpToolsList(): McpToolInfo[] {
  // Return static tools from config if available, with proper transformation to our format
  if (config.mcp.staticTools && config.mcp.staticTools.length > 0) {
    return config.mcp.staticTools.map(tool => {
      let schema: z.ZodObject<any> | undefined = undefined;
      
      if (tool.schema && tool.schema.properties) {
        try {
          // Convert JSON schema properties to Zod schema
          const schemaObj: Record<string, z.ZodTypeAny> = {};
          
          Object.entries(tool.schema.properties).forEach(([key, prop]) => {
            if (typeof prop === 'object' && prop !== null) {
              let zodType: z.ZodTypeAny = z.any();
              
              // Map JSON schema types to Zod types
              if (prop.type === 'string') {
                zodType = z.string();
              } else if (prop.type === 'number') {
                zodType = z.number();
              } else if (prop.type === 'boolean') {
                zodType = z.boolean();
              } else if (prop.type === 'object') {
                zodType = z.record(z.any());
              } else if (prop.type === 'array') {
                zodType = z.array(z.any());
              }
              
              // Add description if available
              if (prop.description) {
                zodType = zodType.describe(prop.description);
              }
              
              schemaObj[key] = zodType;
            }
          });
          
          schema = z.object(schemaObj);
          
          // Mark fields as required if specified
          if (tool.schema.required && Array.isArray(tool.schema.required)) {
            // This is handled by Zod object definition
          }
        } catch (error) {
          logger.warn(`Failed to convert schema for tool ${tool.name}:`, error);
        }
      }
      
      return {
        name: tool.name,
        description: tool.description,
        schema: schema
      };
    });
  }
  
  // Fallback static tools (though this shouldn't happen since defaults are in config)
  return [
    {
      name: "mcp_calculator",
      description: "Calculates the result of a mathematical expression using the MCP calculator tool. Input is an object like {'expression': '2+2'}.",
      schema: z.object({
        expression: z.string().describe("The mathematical expression to evaluate")
      })
    },
    {
      name: "mcp_weather_service",
      description: "Gets the weather for a location using the MCP weather tool. Input is an object like {'location': 'London, UK'}.",
      schema: z.object({
        location: z.string().describe("The location to get weather for")
      })
    }
  ];
}

// Helper function to create a LangChain tool from MCP tool info
export function createMcpTool(toolInfo: McpToolInfo) {
  class McpTool extends StructuredTool {
    name = toolInfo.name;
    description = toolInfo.description;
    schema = toolInfo.schema instanceof z.ZodObject ? toolInfo.schema : z.object({ input: z.any() });
    async _call(args: Record<string, any>): Promise<string> {
      try {
        const result = await invokeMcpTool(toolInfo.name, args as Record<string, any>);
        return typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      } catch (err: any) {
        return `Error executing MCP tool '${toolInfo.name}': ${err.message}`;
      }
    }
  }
  return new McpTool();
}

// Create LangChain tools from a list of MCP tool infos
export function createMcpTools(toolsInfo: McpToolInfo[]): StructuredTool[] {
  return toolsInfo.map(createMcpTool);
}

// Get all available MCP tools, either through discovery or using static list
export async function getMcpTools(): Promise<StructuredTool[]> {
  logger.info('--- MCP TOOLS INITIALIZATION ---');
  // Wait for MCP client to finish its initialization before checking availability
  await mcpClientReady;
  const client = getMcpClient();
  if (!client) {
    logger.warn('MCP Client not available - no MCP tools will be provided');
    return [];
  }
  try {
    const discoveredTools = await discoverMcpTools();
    if (discoveredTools.length > 0) {
      logger.info(`Discovered ${discoveredTools.length} MCP tools from the server`);
      return createMcpTools(discoveredTools);
    }
    
    // Use the static tools list from configuration
    const staticTools = getStaticMcpToolsList();
    logger.info(`No MCP tools discovered, using fallback static list of ${staticTools.length} tools`);
    return createMcpTools(staticTools);
  } catch (error) {
    logger.error('Error getting MCP tools:', error);
    
    // Use the static tools list from configuration
    const staticTools = getStaticMcpToolsList();
    logger.info(`Falling back to static list of ${staticTools.length} MCP tools`);
    return createMcpTools(staticTools);
  }
}
