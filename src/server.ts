import 'dotenv/config';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
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
        return { reply: result.output, conversationId, status: "complete" };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`${logPrefix} Error during agent execution for ${conversationId}:`, errorMessage);
        return { error: `Agent execution error: ${errorMessage}`, conversationId };
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
