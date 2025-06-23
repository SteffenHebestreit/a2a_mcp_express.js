import 'dotenv/config';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import logger from './utils/logger';
import { requestLoggerMiddleware, errorLoggerMiddleware, getRequestId } from './utils/requestLogger';

// --- LangChain Imports ---
import { AgentExecutor, createOpenAIFunctionsAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

// --- MCP Imports ---
import { getMcpClient, mcpClientReady } from './mcp/client';
import { getMcpTools } from './mcp/tools';
import { AskAnotherAgentTool } from './tools/AskAnotherAgentTool';

// --- Router Imports ---
import apiRouter from './routes/api';
import a2aRouter from './routes/a2a';
import { config } from './config';

// --- Initialize Express App ---
const app = express();

// Add request ID and logging middleware
app.use(requestLoggerMiddleware);

// Parse JSON requests
app.use(express.json());

// Register API and A2A routers
app.use('/api', apiRouter);
app.use('/', a2aRouter);

// Handle errors with our custom error logger
app.use(errorLoggerMiddleware);

// Use shared memory module for chat history management
import { getMemoryForConversation, clearMemoryForConversation } from "./agent/memory";

interface ProcessResult {
    reply: string;
    conversationId: string;
    status: string;
}

interface ProcessError {
    error: string;
    conversationId: string;
}

// --- Initialize LLM based on configuration ---
function initializeLLM(): BaseChatModel {
    logger.info(`Initializing LLM with provider: ${config.llm.provider}`);

    switch (config.llm.provider) {
        case 'openai':
            logger.info(`Using OpenAI model: ${config.llm.model}`);
            return new ChatOpenAI({
                modelName: config.llm.model,
                temperature: config.llm.temperature,
                openAIApiKey: config.llm.openai.apiKey,
                configuration: config.llm.openai.apiUrl ? {
                    baseURL: config.llm.openai.apiUrl,
                } : undefined,
            });

        case 'anthropic':
            logger.info(`Using Anthropic model: ${config.llm.model}`);
            return new ChatAnthropic({
                modelName: config.llm.model,
                temperature: config.llm.temperature,
                anthropicApiKey: config.llm.anthropic.apiKey,
            });

        case 'ollama':
            logger.info(`Using Ollama model: ${config.llm.model} via OpenAI-compatible interface`);
            // For Ollama, we need to use ChatOpenAI with proper settings since
            // it implements OpenAI-compatible API
            return new ChatOpenAI({
                modelName: config.llm.model,
                temperature: config.llm.temperature,
                openAIApiKey: "ollama-key", // Dummy key for OpenAI format
                configuration: {
                    baseURL: config.llm.ollama.baseUrl,
                    defaultHeaders: {
                        "Content-Type": "application/json",
                    },
                },
            });
            
        default:
            logger.warn(`Unknown LLM provider: ${config.llm.provider}, falling back to OpenAI`);
            return new ChatOpenAI({
                modelName: config.llm.model || "gpt-4o-mini",
                temperature: config.llm.temperature,
            });
    }
}

// Initialize LLM using our configuration
const llm = initializeLLM();

// --- Initialize Agent and Tools ---
let agentExecutor: AgentExecutor | null = null;

// Function to initialize the agent with tools
async function initializeAgent(): Promise<void> {
    try {
        // Wait for MCP client to finish initialization first
        await mcpClientReady;
        logger.info('--- TOOL INITIALIZATION ---');
        logger.info("Initializing agent with tools...");

        // Initialize MCP tools - these will be dynamically discovered if possible
        const mcpTools = await getMcpTools();
        
        // Add the A2A tool
        const a2aTool = AskAnotherAgentTool();
        
        // Combine all tools
        const allTools = [...mcpTools, a2aTool];
        
        logger.info(`Agent initialized with ${allTools.length} tools (${mcpTools.length} MCP tools, 1 A2A tool)`);
        
        // Create the agent prompt using the configured system prompt
        const agentPrompt = ChatPromptTemplate.fromMessages([
            ["system", config.agent.systemPrompt],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);
        
        // Create the agent using the more widely available createOpenAIFunctionsAgent
        const agent = await createOpenAIFunctionsAgent({
            llm,
            tools: allTools,
            prompt: agentPrompt
        });
        
        // Create the agent executor with configuration values
        agentExecutor = new AgentExecutor({
            agent,
            tools: allTools,
            verbose: config.agent.verbose,
            handleParsingErrors: config.agent.handleParsingErrors
        });
        
        logger.info("Agent successfully initialized");
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Error initializing agent:", errorMessage);
        throw new Error(`Failed to initialize agent: ${errorMessage}`);
    }
}

// Agent processing function - now improved with request ID tracking
async function processWithAgent(userPrompt: string, conversationId: string, requestId?: string): Promise<ProcessResult | ProcessError> {
    const logPrefix = requestId ? `[${requestId}]` : '';
    logger.info(`${logPrefix} Processing prompt for conversation ${conversationId}`);
    logger.debug(`${logPrefix} Prompt content: "${userPrompt}"`);
    
    if (!agentExecutor) {
        logger.error(`${logPrefix} Agent not initialized when trying to process prompt`);
        return { 
            error: "Agent not initialized. Please try again in a few moments.", 
            conversationId 
        };
    }
    
    const memory = await getMemoryForConversation(conversationId);
    agentExecutor.memory = memory;

    try {
        const result = await agentExecutor.invoke({ input: userPrompt });
        logger.debug(`${logPrefix} Agent execution result:`, result);
  // Check if the output is a JSON that contains a tool call
        if (typeof result.output === 'string' && isToolCallJSON(result.output)) {
            logger.info(`${logPrefix} Detected tool call JSON, executing tool...`);
            logger.debug(`${logPrefix} Tool call JSON: ${result.output}`);
            const toolResult = await executeToolFromJSON(result.output);
            logger.info(`${logPrefix} Tool execution completed with result:`, toolResult);
            return { reply: toolResult, conversationId, status: "complete" };
        } else {
            logger.debug(`${logPrefix} Output is not a tool call JSON or isToolCallJSON returned false.`);
            if (typeof result.output === 'string' && result.output.includes('"tool"')) {
                logger.debug(`${logPrefix} Output contains "tool" but wasn't detected as tool call: ${result.output}`);
                try {
                    const parsed = JSON.parse(result.output);
                    logger.debug(`${logPrefix} Successfully parsed as JSON:`, parsed);
                } catch (e) {
                    logger.debug(`${logPrefix} Failed to parse as JSON:`, e);
                }
            }
        }
        
        return { reply: result.output, conversationId, status: "complete" };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${logPrefix} Error during agent execution for ${conversationId}:`, errorMessage);
        return { error: `Agent execution error: ${errorMessage}`, conversationId };
    }
}

// Helper function to check if a string is a valid JSON tool call
function isToolCallJSON(output: string): boolean {
    try {
        const parsed = JSON.parse(output);
        return (
            (parsed.tool && typeof parsed.tool === 'string') || 
            (parsed.action && typeof parsed.action === 'string')
        );
    } catch (e) {
        return false;
    }
}

// Helper function to execute a tool from JSON
async function executeToolFromJSON(jsonOutput: string): Promise<string> {
    try {
        const parsed = JSON.parse(jsonOutput);
        const toolName = parsed.tool || parsed.action;
        
        logger.debug(`Executing tool from JSON: ${toolName}`, parsed);
        
        if (toolName === 'ask_another_a2a_agent') {
            const targetAgentId = parsed.targetAgentId;
            const taskInput = parsed.taskInput;
            
            if (!targetAgentId || !taskInput) {
                logger.error(`Missing required parameters for ask_another_a2a_agent:`, parsed);                return `Error: Missing required parameters for ask_another_a2a_agent`;
            }
            
            // For A2A tool, we'll use a direct API call rather than the tool
            try {
                const taskId = uuidv4();
                const requestBody = { 
                    task: { 
                        id: taskId, 
                        message: { 
                            role: 'user', 
                            parts: [
                                { type: 'text', content: taskInput }
                            ] 
                        } 
                    } 
                };                // Use the original target URL
                logger.debug(`Sending A2A request to ${targetAgentId} with task: ${taskInput}`);
                
                const resp = await axios.post(`${targetAgentId}/a2a/message`, requestBody, { 
                    headers: { 'Content-Type': 'application/json' }, 
                    timeout: 15000 
                });
                
                const responseTask = resp.data;
                logger.debug(`Received A2A response:`, responseTask);
                  let result = `Response from ${targetAgentId} (${responseTask.status.state}): `;
                if (responseTask.status.message?.parts?.length) {
                    const text = responseTask.status.message.parts.find((p: any) => p.type === 'text')?.content
                        ?? JSON.stringify(responseTask.status.message.parts[0].content);
                    result += text;
                } else if (responseTask.artifacts?.length) {
                    result += `Artifacts: ${responseTask.artifacts.length}`;
                }
                
                return result;
            } catch (e: any) {
                const msg = e.response ? JSON.stringify(e.response.data) : e.message;
                logger.error(`Error in A2A communication:`, e);
                return `Error communicating with agent ${targetAgentId}. ${msg}`;
            }
        } else if (toolName.startsWith('mcp_')) {
            const mcpTools = await getMcpTools();const tool = mcpTools.find(t => t.name === toolName);
            if (!tool) {
                logger.error(`MCP tool '${toolName}' not found. Available tools:`, mcpTools.map(t => t.name));
                return `Error: MCP tool '${toolName}' not found`;
            }
            
            const toolInput = parsed.tool_input || parsed.action_input || {};
            logger.debug(`Calling MCP tool with input:`, toolInput);
            
            // Use invoke instead of _call
            return await tool.invoke(toolInput);
        }
        
        logger.error(`Unknown tool: '${toolName}'`);
        return `Error: Unknown tool '${toolName}'`;
    } catch (e: any) {
        logger.error(`Error executing tool from JSON:`, e.message, e.stack);
        return `Error executing tool: ${e.message}`;
    }
}

// --- Start Server ---
(async () => {
    try {
        // Initialize the agent before starting the server
        await initializeAgent();
        
        app.listen(config.server.port, () => {
            logger.info('--- SERVER STARTUP ---');
            logger.info(`=============================================================`);
            logger.info(`${config.server.name} listening on port ${config.server.port}`);
            logger.info(`Agent Base URL / ID: ${config.server.baseUrl}`);
            logger.info(`Current log level: ${config.logging.level}`);
            logger.info(`Agent Card available at: ${config.server.baseUrl}/.well-known/agent.json`);
            logger.info(`A2A Task Endpoint (tasks/send): POST ${config.server.baseUrl}/a2a/message`);
            
            logger.info('--- MCP CLIENT CHECK ---');
            const mcpClient = getMcpClient();
            if (mcpClient) {
                logger.info(`MCP Client Initialized (Target: ${config.mcp.serverUrl})`);
            } else {
                logger.warn(`MCP Client could NOT be initialized. Check MCP server URL configuration.`);
            }
            logger.info(`=============================================================`);
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.fatal("Failed to start server:", errorMessage);
        process.exit(1);
    }
})();

// Export for testing and reuse
export { app, processWithAgent, clearMemoryForConversation };
