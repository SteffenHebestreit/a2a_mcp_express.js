# PowerShell script for testing A2A communication with MCP calculator

Write-Host "Testing agent1 delegating a calculation to agent2..." -ForegroundColor Cyan
$result = Invoke-RestMethod -Method Post -Uri "http://agent1.localhost/api/invoke" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"prompt": "Ask agent2 to calculate 123 * 456", "conversationId": "a2a-test"}'

Write-Host "Response from agent1:" -ForegroundColor Green
$result | ConvertTo-Json -Depth 5

Write-Host "`nWatching logs (press Ctrl+C to exit):" -ForegroundColor Yellow
docker-compose logs -f
