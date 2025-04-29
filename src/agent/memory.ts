import { BufferMemory, ChatMessageHistory } from "langchain/memory";
import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { RedisChatMessageHistory } from "@langchain/redis";
import { config } from "../config";
import logger from "../utils/logger";

// Simple in-memory store for chat history
const conversationMemoryStore: { [key: string]: BaseChatMessageHistory } = {};

/**
 * Creates a Redis-backed chat message history with TTL support
 */
function createRedisChatMessageHistory(conversationId: string): RedisChatMessageHistory {
  try {
    // Using memory config from unified configuration
    if (!config.memory.redis.url) {
      throw new Error('Redis URL is not configured');
    }
    
    // Create Redis chat history with the URL configured
    // Using the Redis connection string directly from config
    return new RedisChatMessageHistory({
      sessionId: conversationId,
      sessionTTL: config.memory.redis.chatHistoryTtl,
      config: {
        url: config.memory.redis.url
      }
    });
  } catch (error) {
    logger.error(`Failed to create Redis chat history: ${error}. Falling back to in-memory storage.`);
    return new ChatMessageHistory() as any;
  }
}

/**
 * Get memory instance for a given conversation ID
 */
export async function getMemoryForConversation(conversationId: string): Promise<BufferMemory> {
  let chatHistory: BaseChatMessageHistory;
  
  // Use Redis or in-memory storage based on configuration
  if (config.memory.type === 'redis') {
    try {
      // Try to use Redis first
      chatHistory = createRedisChatMessageHistory(conversationId);
      logger.debug(`Using Redis memory for conversation ${conversationId}`);
    } catch (error) {
      // Fall back to in-memory if Redis fails
      logger.warn(`Redis connection failed: ${error}. Falling back to in-memory storage.`);
      if (!conversationMemoryStore[conversationId]) {
        conversationMemoryStore[conversationId] = new ChatMessageHistory();
      }
      chatHistory = conversationMemoryStore[conversationId];
    }
  } else {
    // Use in-memory storage
    if (!conversationMemoryStore[conversationId]) {
      conversationMemoryStore[conversationId] = new ChatMessageHistory();
      logger.debug(`Created new in-memory storage for conversation ${conversationId}`);
    } else {
      logger.debug(`Using existing in-memory storage for conversation ${conversationId}`);
    }
    chatHistory = conversationMemoryStore[conversationId];
  }
  
  return new BufferMemory({
    chatHistory,
    memoryKey: "chat_history",
    returnMessages: true,
    inputKey: "input",
    outputKey: "output"
  });
}

/**
 * Clear memory for a conversation
 */
export async function clearMemoryForConversation(conversationId: string): Promise<void> {
  if (config.memory.type === 'redis') {
    try {
      // For Redis, we create a new instance and clear it
      const redisHistory = createRedisChatMessageHistory(conversationId);
      await redisHistory.clear();
      logger.info(`Cleared Redis memory for conversation ${conversationId}`);
    } catch (error) {
      logger.error(`Failed to clear Redis memory: ${error}`);
      // Try to clear in-memory as fallback
      if (conversationMemoryStore[conversationId]) {
        delete conversationMemoryStore[conversationId];
        logger.info(`Cleared fallback in-memory storage for conversation ${conversationId}`);
      }
    }
  } else {
    // For in-memory storage
    if (conversationMemoryStore[conversationId]) {
      delete conversationMemoryStore[conversationId];
      logger.info(`Cleared in-memory storage for conversation ${conversationId}`);
    } else {
      logger.debug(`No in-memory storage to clear for conversation ${conversationId}`);
    }
  }
}
