#!/bin/bash
# Test script for A2A communication with MCP calculator

echo "Testing agent1 delegating a calculation to agent2..."
RESULT=$(curl -s -X POST http://agent1.localhost/api/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Ask agent2 to calculate 123 * 456", "conversationId": "a2a-test"}')

echo "Response from agent1:"
echo $RESULT | jq '.'

echo -e "\nWatching logs (press Ctrl+C to exit):"
docker-compose logs -f
