import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Main configuration interface representing all settings
 */
export interface AgentConfig {
  // Server configuration
  server: {
    port: number;
    baseUrl: string;
    name: string;
    description: string;
  };
  
  // MCP configuration
  mcp: {
    serverUrl: string | undefined;
    staticTools?: Array<{
      name: string;
      description: string;
      schema?: {
        properties: Record<string, any>;
        required?: string[];
      };
    }>;
  };
  
  // LLM configuration
  llm: {
    provider: 'openai' | 'ollama' | 'azure' | 'anthropic';
    model: string;
    temperature: number;
    
    // Provider-specific configurations
    openai: {
      apiKey: string | undefined;
      apiUrl: string | undefined;
    };
    ollama: {
      baseUrl: string | undefined;
    };
    azure: {
      apiKey: string | undefined;
      endpoint: string | undefined;
    };
    anthropic: {
      apiKey: string | undefined;
    };
  };
  
  // Agent configuration
  agent: {
    systemPrompt: string;
    verbose: boolean;
    handleParsingErrors: boolean;
  };
  
  // A2A Protocol configuration
  a2a: {
    version: string;
    skills: Array<{
      id: string;
      name: string;
      description: string;
      inputModes: string[];
      outputModes: string[];
    }>;
  };
  
  // Memory configuration
  memory: {
    type: 'memory' | 'redis';
    redis: {
      url: string | undefined;
      chatHistoryTtl: number;
    };
  };
  
  // Logging configuration
  logging: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  };
  
  // Docker configuration
  docker: {
    baseUrlHostname: string;
  };
}

/**
 * Default configuration values
 */
const defaultConfig: AgentConfig = {
  server: {
    port: 3000,
    baseUrl: 'http://localhost:3000',
    name: 'MyLangchainNodeAgentMCP',
    description: 'A helpful agent built with Langchain and Node.js using MCP.',
  },
  mcp: {
    serverUrl: undefined,
    staticTools: [
      {
        name: 'mcp_calculator',
        description: 'Calculates the result of a mathematical expression.',
        schema: {
          properties: {
            expression: {
              type: 'string',
              description: 'The mathematical expression to evaluate'
            }
          },
          required: ['expression']
        }
      },
      {
        name: 'mcp_weather_service',
        description: 'Gets the weather for a location.',
        schema: {
          properties: {
            location: {
              type: 'string',
              description: 'The location to get weather for'
            }
          },
          required: ['location']
        }
      }
    ]
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    openai: {
      apiKey: undefined,
      apiUrl: undefined
    },
    ollama: {
      baseUrl: 'http://localhost:11434'
    },
    azure: {
      apiKey: undefined,
      endpoint: undefined
    },
    anthropic: {
      apiKey: undefined
    }
  },
  agent: {
    systemPrompt: `You are {name}, {description}.
    Your Agent ID is {baseUrl}. You have access to MCP tools that provide various capabilities,
    and an A2A tool ('ask_another_a2a_agent') to interact with other agents.
    For the A2A tool, provide the target agent's base URL ('targetAgentId') and the specific question or data ('taskInput').
    Think step-by-step before deciding on an action. Respond directly if no tool is needed.`,
    verbose: true,
    handleParsingErrors: true
  },
  a2a: {
    version: '1.0',
    skills: [
      {
        id: 'general_query',
        name: 'General Query',
        description: 'Accepts natural language questions and attempts to answer using internal knowledge and tools.',
        inputModes: ['text/plain'],
        outputModes: ['text/plain']
      },
      {
        id: 'mcp_calc_proxy',
        name: 'MCP Calculator Proxy',
        description: 'Exposes the internal MCP calculator tool via A2A. Expects data part { expression: \'...\' }.',
        inputModes: ['application/json'],
        outputModes: ['application/json']
      }
    ]
  },
  memory: {
    type: 'memory',
    redis: {
      url: undefined,
      chatHistoryTtl: 86400
    }
  },
  logging: {
    level: 'INFO'
  },
  docker: {
    baseUrlHostname: 'agent.localhost'
  }
};

/**
 * Load YAML configuration from file
 */
function loadYamlConfig(configPath: string): Partial<AgentConfig> {
  try {
    if (!fs.existsSync(configPath)) {
      console.log(`Configuration file not found at ${configPath}, using defaults`);
      return {};
    }
    
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const yamlConfig = yaml.load(fileContents) as Partial<AgentConfig>;
    console.log(`Loaded configuration from ${configPath}`);
    return yamlConfig || {};
  } catch (error) {
    console.error(`Error loading configuration from ${configPath}:`, error);
    return {};
  }
}

/**
 * Apply environment variables to configuration
 */
function applyEnvironmentVariables(config: AgentConfig): AgentConfig {
  // Server configuration
  if (process.env.PORT) config.server.port = parseInt(process.env.PORT, 10);
  if (process.env.AGENT_BASE_URL) config.server.baseUrl = process.env.AGENT_BASE_URL;
  if (process.env.AGENT_NAME) config.server.name = process.env.AGENT_NAME;
  if (process.env.AGENT_DESCRIPTION) config.server.description = process.env.AGENT_DESCRIPTION;
  
  // MCP configuration
  if (process.env.MCP_SERVER_URL) config.mcp.serverUrl = process.env.MCP_SERVER_URL;
  
  // LLM configuration
  if (process.env.LLM_PROVIDER) {
    const provider = process.env.LLM_PROVIDER.toLowerCase();
    if (provider === 'openai' || provider === 'ollama' || provider === 'azure' || provider === 'anthropic') {
      config.llm.provider = provider;
    }
  }
  if (process.env.MODEL) config.llm.model = process.env.MODEL;
  if (process.env.TEMPERATURE) config.llm.temperature = parseFloat(process.env.TEMPERATURE);
  
  // Provider-specific configurations
  if (process.env.OPENAI_API_KEY) config.llm.openai.apiKey = process.env.OPENAI_API_KEY;
  if (process.env.OPENAI_URL) config.llm.openai.apiUrl = process.env.OPENAI_URL;
  if (process.env.OLLAMA_BASE_URL) config.llm.ollama.baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.AZURE_API_KEY) config.llm.azure.apiKey = process.env.AZURE_API_KEY;
  if (process.env.AZURE_ENDPOINT) config.llm.azure.endpoint = process.env.AZURE_ENDPOINT;
  if (process.env.ANTHROPIC_API_KEY) config.llm.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
  
  // Agent configuration - system prompt would typically come from the YAML
  
  // A2A configuration
  if (process.env.A2A_VERSION) config.a2a.version = process.env.A2A_VERSION;
  
  // Memory configuration
  if (process.env.MEMORY_TYPE) {
    const memoryType = process.env.MEMORY_TYPE.toLowerCase();
    if (memoryType === 'memory' || memoryType === 'redis') {
      config.memory.type = memoryType;
    }
  }
  if (process.env.REDIS_URL) config.memory.redis.url = process.env.REDIS_URL;
  if (process.env.MEMORY_CHAT_HISTORY_TTL) {
    config.memory.redis.chatHistoryTtl = parseInt(process.env.MEMORY_CHAT_HISTORY_TTL, 10);
  }
  
  // Logging configuration
  if (process.env.LOG_LEVEL) {
    const logLevel = process.env.LOG_LEVEL.toUpperCase();
    if (['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'].includes(logLevel)) {
      config.logging.level = logLevel as any;
    }
  }
  
  // Docker configuration
  if (process.env.AGENT_BASE_URL_HOSTNAME) config.docker.baseUrlHostname = process.env.AGENT_BASE_URL_HOSTNAME;
  
  return config;
}

/**
 * Deep merge objects (preserving the template structure)
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      const typedKey = key as keyof T;
      
      if (isObject(source[typedKey])) {
        if (!(typedKey in target)) {
          Object.assign(output, { [typedKey]: source[typedKey] });
        } else {
          output[typedKey] = deepMerge(
            target[typedKey] as Record<string, any>, 
            source[typedKey] as Record<string, any>
          ) as any;
        }
      } else {
        Object.assign(output, { [typedKey]: source[typedKey] });
      }
    });
  }
  
  return output;
}

function isObject(item: any): item is Record<string, any> {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Process system prompt by replacing placeholders with actual values
 * 
 * This function handles the templating system for the agent's system prompt.
 * It replaces special placeholder variables with values from the configuration:
 * - {name} is replaced with server.name
 * - {description} is replaced with server.description
 * - {baseUrl} is replaced with server.baseUrl
 * 
 * This ensures that the agent's identity in conversations matches the server identity.
 */
function processSystemPrompt(config: AgentConfig): AgentConfig {
  let prompt = config.agent.systemPrompt;
  
  // Replace placeholders with actual values
  prompt = prompt.replace(/{name}/g, config.server.name);
  prompt = prompt.replace(/{description}/g, config.server.description);
  prompt = prompt.replace(/{baseUrl}/g, config.server.baseUrl);
  
  config.agent.systemPrompt = prompt;
  return config;
}

/**
 * Validate the configuration and ensure all required fields are present
 */
function validateConfig(config: AgentConfig): void {
  const warnings: string[] = [];
  
  // Check if the selected LLM provider has the required configuration
  switch (config.llm.provider) {
    case 'openai':
      if (!config.llm.openai.apiKey) {
        warnings.push('OpenAI API Key is not set. OpenAI LLM features will not work correctly.');
      }
      break;
    case 'ollama':
      if (!config.llm.ollama.baseUrl) {
        warnings.push('Ollama Base URL is not set, defaulting to http://localhost:11434');
      }
      break;
    case 'azure':
      if (!config.llm.azure.apiKey) {
        warnings.push('Azure API Key is not set. Azure OpenAI features will not work correctly.');
      }
      if (!config.llm.azure.endpoint) {
        warnings.push('Azure Endpoint is not set. Azure OpenAI features will not work correctly.');
      }
      break;
    case 'anthropic':
      if (!config.llm.anthropic.apiKey) {
        warnings.push('Anthropic API Key is not set. Anthropic Claude features will not work correctly.');
      }
      break;
  }
  
  // Validate memory configuration
  if (config.memory.type === 'redis' && !config.memory.redis.url) {
    warnings.push('Redis URL is not set but Memory Type is set to "redis". Falling back to in-memory storage.');
    config.memory.type = 'memory';
  }
  
  if (!config.mcp.serverUrl) {
    warnings.push('MCP Server URL is not set. MCP features will not be available.');
  }
  
  // Log all warnings
  warnings.forEach(warning => console.warn(`WARNING: ${warning}`));
}

/**
 * Load and process the configuration
 */
export function loadConfig(): AgentConfig {
  // Check for the configuration file in various locations
  const configPaths = [
    'agent-config.yml', 
    'agent-config.yaml',
    path.join(process.cwd(), 'agent-config.yml'),
    path.join(process.cwd(), 'agent-config.yaml')
  ];
  
  // Try to load from each path until we find one
  let yamlConfig: Partial<AgentConfig> = {};
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      yamlConfig = loadYamlConfig(configPath);
      break;
    }
  }
  
  // Create configuration by merging defaults and YAML
  let config = deepMerge(defaultConfig, yamlConfig);
  
  // Apply environment variables (they take precedence over file config)
  config = applyEnvironmentVariables(config);
  
  // Process templates in the system prompt
  config = processSystemPrompt(config);
  
  // Validate configuration
  validateConfig(config);
  
  return config;
}

// Export the loaded configuration
export const config = loadConfig();

export default config;