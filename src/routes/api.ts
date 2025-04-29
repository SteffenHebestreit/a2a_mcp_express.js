import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { processWithAgent } from '../server';
import { getRequestId } from '../utils/requestLogger';

const router = Router();

// --- User Interaction Endpoint ---
router.post('/invoke', async (req: Request, res: Response) => {
    const { userPrompt, conversationId: incomingConvId } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string') {
        return res.status(400).json({ error: 'userPrompt (string) is required in the request body' });
    }

    // Use incoming conversation ID or generate a new one
    const conversationId = (incomingConvId && typeof incomingConvId === 'string') ? incomingConvId : `conv_${uuidv4()}`;

    const requestId = getRequestId(req);
    const result = await processWithAgent(userPrompt, conversationId, requestId);

    const responsePayload = { ...result, requestId };
    // Type guard to check if it's an error or success result
    if ('error' in result) {
        res.status(500).json(responsePayload);
    } else {
        res.status(200).json(responsePayload);
    }
});

export default router;
