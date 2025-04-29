import { createOpenAIFunctionsAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { Tool } from "langchain/tools";
import { ChatOpenAI } from "@langchain/openai";
import { BufferMemory } from "langchain/memory";
import { getMcpTools } from "../mcp/tools";
import { AskAnotherAgentTool } from "../tools/AskAnotherAgentTool";
import { config } from "../config";
import { getMemoryForConversation, clearMemoryForConversation } from "./memory";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import logger from "../utils/logger";

// Initialize LLM based on the configured provider
function initializeLLM(): BaseChatModel {
  switch (config.llm.provider.toLowerCase()) {
    case 'ollama':
      // For Ollama, we need to use ChatOpenAI since ChatOllama has compatibility issues
      // We'll set up a proxy via environment variables if needed
      logger.info('Using OpenAI-compatible interface for Ollama');
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
    
    case 'openai':
    default:
      logger.info(`Initializing OpenAI model: ${config.llm.model}`);
      return new ChatOpenAI({
        modelName: config.llm.model,
        temperature: config.llm.temperature,
        openAIApiKey: config.llm.openai.apiKey || "dummy-key",
        configuration: config.llm.openai.apiUrl ? {
          baseURL: config.llm.openai.apiUrl,
        } : undefined,
      });
  }
}

// Initialize the LLM
const llm = initializeLLM();

interface AgentResult {
  reply: string;
  conversationId: string;
  status: string;
}
interface AgentError {
  error: string;
  conversationId: string;
}

// Check if a prompt is a continuation command
function isContinuationCommand(prompt: string): boolean {
  return /^@agent\s+Continue:/i.test(prompt);
}

// Extract the actual continuation prompt from the command
function extractContinuationPrompt(prompt: string): string {
  const match = prompt.match(/^@agent\s+Continue:\s*"(.+?)"$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // If no quoted text is found, extract everything after the colon
  const colonIndex = prompt.indexOf(':');
  if (colonIndex !== -1) {
    return prompt.substring(colonIndex + 1).trim();
  }
  
  return "Continue with the previous task";
}

export async function processWithAgent(userPrompt: string, conversationId: string): Promise<AgentResult | AgentError> {
  logger.info(`Processing prompt for conversation ${conversationId}`);
  logger.debug(`Prompt content: "${userPrompt}"`);

  // Handle continuation command
  let processedPrompt = userPrompt;
  if (isContinuationCommand(userPrompt)) {
    const continuationPrompt = extractContinuationPrompt(userPrompt);
    logger.info(`Detected continuation command for conversation ${conversationId}`);
    
    // Modify the prompt to indicate continuation
    processedPrompt = `${continuationPrompt} (This is a continuation of our previous conversation. Please maintain the context of what we were discussing and continue from where we left off.)`;
  }

  // Load tools dynamically
  logger.debug(`Loading tools for conversation ${conversationId}...`);
  const mcpTools = await getMcpTools();
  const a2aTool = AskAnotherAgentTool();
  const tools = [...mcpTools, a2aTool];
  logger.debug(`Loaded ${tools.length} tools (${mcpTools.length} MCP tools, 1 A2A tool)`);

  // Create prompt
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are ${config.server.name}, ${config.server.description}.
Your Agent ID is ${config.server.baseUrl}. You can use MCP tools (prefixed with their names) and an A2A tool ('ask_another_a2a_agent') to interact with other agents.
Provide 'targetAgentId' and 'taskInput' for A2A tool calls. Think step-by-step before choosing a tool.
Respond directly if no tool is needed.`],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  try {
    // Initialize agent
    logger.debug(`Creating agent for conversation ${conversationId}`);
    const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
    const memory = await getMemoryForConversation(conversationId);
    const executor = new AgentExecutor({ 
      agent, 
      tools, 
      memory, 
      verbose: config.agent.verbose, 
      handleParsingErrors: config.agent.handleParsingErrors 
    });

    logger.info(`Executing agent for conversation ${conversationId}`);
    const result = await executor.invoke({ input: processedPrompt });
    logger.debug(`Agent execution result:`, result);

    if (typeof result.output !== 'string') {
      logger.error(`Agent produced invalid output format for ${conversationId}`);
      return { error: "Agent produced invalid output format.", conversationId };
    }
    
    logger.info(`Agent execution completed successfully for ${conversationId}`);
    return { reply: result.output, conversationId, status: "complete" };
  } catch (error: any) {
    logger.error(`Error during agent execution for ${conversationId}:`, error.message);
    return { error: `Agent execution error: ${error.message}`, conversationId };
  }
}
