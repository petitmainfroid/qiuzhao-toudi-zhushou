import type { HistoryItem } from '@/hooks/useDashboard'

export interface ParsedHistoryDetail {
  schema: string
  hrQuestion: string
  aiReply: string
  systemReason: string
  conversationTail: Array<{ sender: string; text: string }>
}

export function parseHistoryDetail(item: HistoryItem): ParsedHistoryDetail {
  if (item.detail_payload) {
    const payloadReply = item.detail_payload.ai_reply || ''
    return {
      schema: item.detail_payload.schema || 'unknown',
      hrQuestion: item.detail_payload.hr_question || '',
      aiReply: item.action === 'resume_failed' ? '' : payloadReply,
      systemReason: item.detail_payload.system_reason || (item.action === 'resume_failed' ? payloadReply : ''),
      conversationTail: item.detail_payload.conversation_tail || [],
    }
  }

  if (!item.detail) {
    return {
      schema: 'legacy_text',
      hrQuestion: '',
      aiReply: '',
      systemReason: '',
      conversationTail: [],
    }
  }

  try {
    const parsed = JSON.parse(item.detail)
    if (parsed && typeof parsed === 'object') {
      const payloadReply = parsed.ai_reply || ''
      return {
        schema: parsed.schema || 'unknown',
        hrQuestion: parsed.hr_question || '',
        aiReply: item.action === 'resume_failed' ? '' : payloadReply,
        systemReason: parsed.system_reason || (item.action === 'resume_failed' ? payloadReply : ''),
        conversationTail: Array.isArray(parsed.conversation_tail) ? parsed.conversation_tail : [],
      }
    }
  } catch {
    // Legacy text detail.
  }

  return {
    schema: 'legacy_text',
    hrQuestion: '',
    aiReply: item.action === 'resume_failed' ? '' : item.detail,
    systemReason: item.action === 'resume_failed' ? item.detail : '',
    conversationTail: [],
  }
}
